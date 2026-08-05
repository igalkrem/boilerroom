import { describe, it, expect, vi, afterEach } from "vitest";
import { isConcurrentDdlRace, applyIdempotentDdl } from "./index";

/**
 * Guards the SEC-21 concurrent-DDL tolerance that replaced an inert pg_advisory_lock on
 * 2026-08-05. The lock never worked (Neon's HTTP endpoint drops session state, so a
 * session-level advisory lock is discarded immediately), so the DDL is instead written to
 * survive N serverless instances running it at once.
 *
 * Every SQLSTATE below was measured against the live database, not read from docs.
 * Reproduced concurrently with 8 processes creating the same new table: unguarded, 1
 * succeeded and 7 threw 42P07; guarded, all 8 succeeded.
 */

/** The shape the driver actually throws: a NeonDbError carrying a `code`. */
function neonError(code: string, message = "boom") {
  return Object.assign(new Error(message), { name: "NeonDbError", code, severity: "ERROR" });
}

afterEach(() => vi.restoreAllMocks());

describe("isConcurrentDdlRace", () => {
  // A UNIQUE constraint reports 42P07, NOT 42710, because it creates a backing index.
  // Assumed 42710 while writing this up and the probe disproved it -- hence the assertion.
  it("treats the three measured already-exists states as races", () => {
    expect(isConcurrentDdlRace(neonError("42P07", 'relation "user_metadata" already exists'))).toBe(true);
    expect(isConcurrentDdlRace(neonError("42P07", 'relation "..._unique_channel_v2" already exists'))).toBe(true);
    expect(isConcurrentDdlRace(neonError("42701", 'column "key" ... already exists'))).toBe(true);
    expect(isConcurrentDdlRace(neonError("42710"))).toBe(true);
  });

  // These are bugs in migrations.sql. Swallowing them would hide a broken migration until
  // something failed much later, far from the cause.
  it("does NOT treat real migration bugs as races", () => {
    expect(isConcurrentDdlRace(neonError("42P01", 'relation "nope" does not exist'))).toBe(false);
    expect(isConcurrentDdlRace(neonError("42601", 'syntax error at or near "TABL"'))).toBe(false);
    expect(isConcurrentDdlRace(neonError("23505", "duplicate key value"))).toBe(false);
    expect(isConcurrentDdlRace(neonError("57014", "canceling statement due to timeout"))).toBe(false);
  });

  // A connection failure has no SQLSTATE at all, and must never be mistaken for "already
  // applied" -- that would mark migrations complete when nothing ran.
  it("does not treat code-less failures as races", () => {
    expect(isConcurrentDdlRace(new Error("Error connecting to database: fetch failed"))).toBe(false);
    expect(isConcurrentDdlRace(undefined)).toBe(false);
    expect(isConcurrentDdlRace(null)).toBe(false);
    expect(isConcurrentDdlRace("42P07")).toBe(false); // a bare string, not an error
    // Passes because the Set holds strings and never matches a number -- the `typeof`
    // guard in the implementation is therefore belt-and-braces, not load-bearing.
    // Removing it is behaviour-preserving and this assertion will NOT catch that; it is
    // kept because a code of the wrong type must stay non-tolerated however that is
    // achieved. The guard's real value is avoiding an `as string` cast.
    expect(isConcurrentDdlRace({ code: 42707 })).toBe(false);
  });
});

describe("applyIdempotentDdl", () => {
  it("passes through on success without logging", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const run = vi.fn().mockResolvedValue(undefined);
    await expect(applyIdempotentDdl("step", run)).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
    expect(info).not.toHaveBeenCalled();
  });

  it("absorbs a race and names the SQLSTATE in the log", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(
      applyIdempotentDdl("create user_metadata", () => Promise.reject(neonError("42P07")))
    ).resolves.toBeUndefined();
    expect(info).toHaveBeenCalledTimes(1);
    const logged = String(info.mock.calls[0][0]);
    expect(logged).toContain("create user_metadata");
    expect(logged).toContain("42P07");
  });

  it("rethrows anything that is not a race, preserving the original error", async () => {
    const err = neonError("42601", 'syntax error at or near "TABL"');
    await expect(applyIdempotentDdl("bad stmt", () => Promise.reject(err))).rejects.toBe(err);
  });

  // The failure mode that matters most: a transient connection error must abort the run so
  // `migrated` is never set, rather than being logged as "already applied".
  it("rethrows a connection failure so migrations are not marked complete", async () => {
    const err = new Error("Error connecting to database: fetch failed");
    await expect(applyIdempotentDdl("any", () => Promise.reject(err))).rejects.toBe(err);
  });
});
