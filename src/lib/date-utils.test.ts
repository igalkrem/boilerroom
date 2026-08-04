import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { localTodayStr, toLocalDateStr, localDaysAgoStr, shiftDateStr } from "./date-utils";

// These helpers exist because of a timezone bug, so the tests have to run in a timezone
// where the bug is reachable. America/Los_Angeles is west of UTC, so for part of every
// day the UTC calendar is already on tomorrow — which is precisely the condition that
// made the dashboard default to a date the viewer had not reached and render blank.
// Node re-reads process.env.TZ, so setting it here is enough (verified, Node 20+).
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = "America/Los_Angeles"; });
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

describe("toLocalDateStr", () => {
  it("formats from local calendar fields, zero-padded", () => {
    expect(toLocalDateStr(new Date(2026, 0, 5, 9, 30))).toBe("2026-01-05");
    expect(toLocalDateStr(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  // THE bug, pinned. 18:00 on Jul 29 in Los Angeles is already Jul 30 in UTC.
  it("returns the viewer's date, not the UTC date, when the two disagree", () => {
    const evening = new Date(2026, 6, 29, 18, 0, 0);
    expect(evening.toISOString().slice(0, 10)).toBe("2026-07-30"); // what the old code did
    expect(toLocalDateStr(evening)).toBe("2026-07-29"); // what the viewer's calendar says
  });

  // The mirror case: just after local midnight, UTC is still on the previous day. A
  // helper that "fixed" the bug by subtracting a day would break here.
  it("is correct just after local midnight too", () => {
    const justAfterMidnight = new Date(2026, 6, 30, 0, 30, 0);
    expect(justAfterMidnight.toISOString().slice(0, 10)).toBe("2026-07-30");
    expect(toLocalDateStr(justAfterMidnight)).toBe("2026-07-30");
  });
});

describe("localTodayStr", () => {
  it("agrees with formatting the current Date locally", () => {
    expect(localTodayStr()).toBe(toLocalDateStr(new Date()));
  });

  it("produces a well-formed YYYY-MM-DD", () => {
    expect(localTodayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("localDaysAgoStr", () => {
  it("returns today for 0", () => {
    expect(localDaysAgoStr(0)).toBe(localTodayStr());
  });

  it("counts backwards and stays well-formed across a month boundary", () => {
    for (const n of [1, 7, 30, 365]) {
      expect(localDaysAgoStr(n)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(localDaysAgoStr(n) < localTodayStr()).toBe(true);
    }
  });
});

describe("shiftDateStr", () => {
  it("shifts forward and backward", () => {
    expect(shiftDateStr("2026-07-15", 1)).toBe("2026-07-16");
    expect(shiftDateStr("2026-07-15", -1)).toBe("2026-07-14");
    expect(shiftDateStr("2026-07-15", 10)).toBe("2026-07-25");
  });

  it("is identity for 0", () => {
    expect(shiftDateStr("2026-07-15", 0)).toBe("2026-07-15");
  });

  it("crosses month and year boundaries", () => {
    expect(shiftDateStr("2026-07-31", 1)).toBe("2026-08-01");
    expect(shiftDateStr("2026-08-01", -1)).toBe("2026-07-31");
    expect(shiftDateStr("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDateStr("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("handles leap and non-leap Februaries", () => {
    expect(shiftDateStr("2028-02-28", 1)).toBe("2028-02-29"); // 2028 is a leap year
    expect(shiftDateStr("2028-02-29", 1)).toBe("2028-03-01");
    expect(shiftDateStr("2026-02-28", 1)).toBe("2026-03-01"); // 2026 is not
  });

  // These pin behaviour across a DST boundary. They do NOT demonstrate that the noon
  // anchor is necessary — measured by mutation, they pass with a midnight anchor too,
  // because `setDate()` is calendar-FIELD arithmetic rather than epoch arithmetic, so a
  // 1-hour offset change cannot move the day. A 6-year scan of every plausible
  // midnight-transition zone (Santiago, Asuncion, Havana, Beirut, Lord Howe, Apia, …)
  // found no date where the two anchors disagree on a ±1-day shift. Keep the noon anchor
  // anyway — it is free, and it would start mattering the moment anyone rewrites this
  // with `getTime() + n * 86400000`. LA springs forward 2026-03-08, falls back 2026-11-01.
  it("survives DST spring-forward", () => {
    expect(shiftDateStr("2026-03-07", 1)).toBe("2026-03-08");
    expect(shiftDateStr("2026-03-08", 1)).toBe("2026-03-09");
    expect(shiftDateStr("2026-03-08", -1)).toBe("2026-03-07");
    expect(shiftDateStr("2026-03-09", -1)).toBe("2026-03-08");
  });

  it("survives DST fall-back", () => {
    expect(shiftDateStr("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDateStr("2026-11-01", 1)).toBe("2026-11-02");
    expect(shiftDateStr("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDateStr("2026-11-02", -1)).toBe("2026-11-01");
  });

  // Broader coverage rather than an anchor discriminator: Beirut changes its clocks AT
  // midnight (last Sunday of March / October), so on 2026-03-29 local 00:00 does not
  // exist at all. Verified it normalises to 01:00 the same day, which is why the date
  // still survives — but this is the nastiest input shape, so pin it.
  it("is correct in a zone whose DST transition happens at midnight", () => {
    const saved = process.env.TZ;
    process.env.TZ = "Asia/Beirut";
    try {
      expect(shiftDateStr("2026-03-28", 1)).toBe("2026-03-29"); // into the missing midnight
      expect(shiftDateStr("2026-03-29", 1)).toBe("2026-03-30");
      expect(shiftDateStr("2026-03-29", -1)).toBe("2026-03-28");
      expect(shiftDateStr("2026-10-24", 1)).toBe("2026-10-25"); // into the repeated hour
      expect(shiftDateStr("2026-10-25", -1)).toBe("2026-10-24");
      expect(toLocalDateStr(new Date(2026, 2, 29, 0, 0, 0))).toBe("2026-03-29");
    } finally {
      process.env.TZ = saved;
    }
  });

  // The dashboard's prev/next-day buttons call this repeatedly, so drift compounds.
  it("does not drift when stepping across a DST boundary one day at a time", () => {
    let d = "2026-03-05";
    for (let i = 0; i < 6; i++) d = shiftDateStr(d, 1);
    expect(d).toBe("2026-03-11");
    for (let i = 0; i < 6; i++) d = shiftDateStr(d, -1);
    expect(d).toBe("2026-03-05");
  });
});
