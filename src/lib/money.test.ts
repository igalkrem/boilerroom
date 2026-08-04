import { describe, it, expect } from "vitest";
import { usdToMicro, microToUsd, usdToCents, centsToUsd } from "./money";

describe("usdToMicro", () => {
  it("uses a factor of exactly 1,000,000", () => {
    expect(usdToMicro(1)).toBe(1_000_000);
    expect(usdToMicro(8.15)).toBe(8_150_000);
    expect(usdToMicro(0)).toBe(0);
  });

  // The whole reason usdToMicro rounds. $2.01 is a perfectly ordinary bid, and
  // 2.01 * 1e6 is 2009999.9999999998 in binary floating point -- truncating would send
  // 2009999. Most values are exact (8.15 * 1e6 really is 8150000), which is what makes
  // this worth pinning: the failure is rare enough to survive casual testing.
  it("rounds away float representation error rather than truncating", () => {
    expect(2.01 * 1_000_000).not.toBe(2_010_000); // guards the premise of this test
    expect(Math.floor(2.01 * 1_000_000)).toBe(2_009_999); // what truncation would bill
    expect(usdToMicro(2.01)).toBe(2_010_000);
    expect(usdToMicro(4.02)).toBe(4_020_000);
    expect(usdToMicro(2.07)).toBe(2_070_000);
    expect(usdToMicro(1.005)).toBe(1_005_000);
  });

  it("handles sub-cent amounts without collapsing to zero", () => {
    expect(usdToMicro(0.000001)).toBe(1);
    expect(usdToMicro(0.0001)).toBe(100);
  });
});

describe("microToUsd", () => {
  it("uses a factor of exactly 1,000,000", () => {
    expect(microToUsd(1_000_000)).toBe(1);
    expect(microToUsd(8_150_000)).toBe(8.15);
    expect(microToUsd(0)).toBe(0);
  });

  it("does not round, so callers keep full precision", () => {
    expect(microToUsd(1_500)).toBe(0.0015);
  });
});

describe("usdToCents", () => {
  it("uses a factor of exactly 100", () => {
    expect(usdToCents(1)).toBe(100);
    expect(usdToCents(20)).toBe(2000);
    expect(usdToCents(0)).toBe(0);
  });

  // $20.15 is inside the range of a normal daily budget, and 20.15 * 100 is
  // 2014.9999999999998 -- truncating would under-fund by a cent every single day.
  it("rounds away float representation error rather than truncating", () => {
    expect(20.15 * 100).not.toBe(2015); // guards the premise of this test
    expect(Math.floor(20.15 * 100)).toBe(2014); // what truncation would send
    expect(usdToCents(20.15)).toBe(2015);
    expect(usdToCents(0.29)).toBe(29);
    expect(usdToCents(1.1)).toBe(110);
    expect(usdToCents(29.99)).toBe(2999);
  });

  // A Meta daily budget is sent as an integer; a fractional cent would be rejected
  // outright or silently truncated by the API.
  it("always produces an integer", () => {
    for (const usd of [0.001, 0.005, 12.344, 12.345, 99.999]) {
      expect(Number.isInteger(usdToCents(usd))).toBe(true);
    }
  });
});

describe("centsToUsd", () => {
  it("uses a factor of exactly 100", () => {
    expect(centsToUsd(100)).toBe(1);
    expect(centsToUsd(2015)).toBe(20.15);
    expect(centsToUsd(0)).toBe(0);
  });
});

// The dashboard reads a stored integer, shows it in a dollar input, and writes back
// whatever the user leaves there. An untouched field must therefore round-trip exactly,
// or merely opening an editor and pressing save would drift the budget.
describe("round-trips", () => {
  it("preserves any whole-cent micro value through micro -> usd -> micro", () => {
    const micros = [1_000_000, 8_150_000, 20_000_000, 5_500_000, 99_990_000, 70_000, 1];
    for (const micro of micros) {
      expect(usdToMicro(microToUsd(micro))).toBe(micro);
    }
  });

  it("preserves any cent value through cents -> usd -> cents", () => {
    const cents = [1, 100, 2015, 2000, 999, 123_456];
    for (const c of cents) {
      expect(usdToCents(centsToUsd(c))).toBe(c);
    }
  });

  // Snapchat stores micro-dollars but the UI edits whole cents, so the two scales have
  // to agree: $20.15 must mean the same amount of money in both.
  it("agrees between the micro and cent scales", () => {
    for (const usd of [1, 8.15, 20.15, 0.07, 29.99]) {
      expect(usdToMicro(usd)).toBe(usdToCents(usd) * 10_000);
    }
  });
});
