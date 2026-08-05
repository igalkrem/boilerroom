import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocked rather than exercised: this file is about token SELECTION, not HTTP.
const mockGetSession = vi.fn();
const mockGetUserMetaTokenRow = vi.fn();

vi.mock("@/lib/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/session")>("@/lib/session");
  return {
    ...actual,
    getSession: () => mockGetSession(),
  };
});

vi.mock("@/lib/db", () => ({
  getUserMetaTokenRow: (id: string) => mockGetUserMetaTokenRow(id),
}));

const { getValidMetaToken } = await import("./client");

const HOUR = 3_600_000;

/** A session cookie whose Meta copy is fresh unless `expiresAt` says otherwise. */
function session(overrides: Record<string, unknown> = {}) {
  return {
    googleUserId: "google-1",
    metaAccessToken: "COOKIE_TOKEN",
    metaUserId: "meta-1",
    metaExpiresAt: Date.now() + HOUR,
    metaAllowedAdAccountIds: ["act_live_1", "act_live_2"],
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    google_user_id: "google-1",
    meta_user_id: "meta-1",
    access_token: "DB_TOKEN",
    // Deliberately DIFFERENT from the session's live list, mirroring the observed drift.
    ad_account_ids: [{ id: "act_stale_9", currency: "USD", timezone_name: "UTC" }],
    expires_at: Date.now() + 45 * 24 * HOUR,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetSession.mockReset();
  mockGetUserMetaTokenRow.mockReset();
});

describe("getValidMetaToken", () => {
  it("uses the cookie token while it is in date, without touching the database", async () => {
    mockGetSession.mockResolvedValue(session());
    await expect(getValidMetaToken()).resolves.toBe("COOKIE_TOKEN");
    expect(mockGetUserMetaTokenRow).not.toHaveBeenCalled();
  });

  // The production bug: 60 errors logged on 2026-08-05 while the stored token was still
  // valid for 45 more days. Before the fallback this threw instead of recovering.
  it("recovers from a stale cookie using the still-valid stored token", async () => {
    const s = session({ metaExpiresAt: Date.now() - HOUR });
    mockGetSession.mockResolvedValue(s);
    mockGetUserMetaTokenRow.mockResolvedValue(storedRow());

    await expect(getValidMetaToken()).resolves.toBe("DB_TOKEN");
    expect(mockGetUserMetaTokenRow).toHaveBeenCalledWith("google-1");
  });

  it("repairs the cookie so the next request takes the fast path", async () => {
    const row = storedRow();
    const s = session({ metaExpiresAt: Date.now() - HOUR });
    mockGetSession.mockResolvedValue(s);
    mockGetUserMetaTokenRow.mockResolvedValue(row);

    await getValidMetaToken();

    expect(s.metaAccessToken).toBe("DB_TOKEN");
    expect(s.metaExpiresAt).toBe(row.expires_at);
    expect(s.save).toHaveBeenCalledTimes(1);
  });

  // The stored ad_account_ids are explicitly NOT an allow-list and drift from the live
  // /me/adaccounts list. Writing them here would swap a live authorization gate for a
  // stale one, so the repair must leave the session's list strictly alone.
  it("never overwrites the session's live ad-account allow-list", async () => {
    const s = session({ metaExpiresAt: Date.now() - HOUR });
    mockGetSession.mockResolvedValue(s);
    mockGetUserMetaTokenRow.mockResolvedValue(storedRow());

    await getValidMetaToken();

    expect(s.metaAllowedAdAccountIds).toEqual(["act_live_1", "act_live_2"]);
    expect(s.metaAllowedAdAccountIds).not.toContain("act_stale_9");
  });

  // Meta tokens cannot be refreshed, so a genuinely expired stored token is terminal.
  it("still reports expiry when the stored token has also expired", async () => {
    mockGetSession.mockResolvedValue(session({ metaExpiresAt: Date.now() - HOUR }));
    mockGetUserMetaTokenRow.mockResolvedValue(storedRow({ expires_at: Date.now() - HOUR }));

    await expect(getValidMetaToken()).rejects.toThrow("meta_token_expired");
  });

  it("reports not_connected when nothing is stored for the user", async () => {
    mockGetSession.mockResolvedValue(session({ metaExpiresAt: Date.now() - HOUR }));
    mockGetUserMetaTokenRow.mockResolvedValue(null);

    await expect(getValidMetaToken()).rejects.toThrow("meta_not_connected");
  });

  // A cookie with no Meta fields at all must still consult the database: this is the
  // first request after a session was created by Google login alone.
  it("falls back even when the cookie carries no Meta fields", async () => {
    mockGetSession.mockResolvedValue(
      session({ metaAccessToken: undefined, metaUserId: undefined, metaExpiresAt: undefined })
    );
    mockGetUserMetaTokenRow.mockResolvedValue(storedRow());

    await expect(getValidMetaToken()).resolves.toBe("DB_TOKEN");
  });

  it("rejects before any database read when there is no Google session", async () => {
    mockGetSession.mockResolvedValue(session({ googleUserId: undefined }));

    await expect(getValidMetaToken()).rejects.toThrow("meta_not_connected");
    expect(mockGetUserMetaTokenRow).not.toHaveBeenCalled();
  });
});
