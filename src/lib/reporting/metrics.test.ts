import { describe, it, expect } from "vitest";
import {
  deriveMetrics,
  NO_BID_TARGET_STRATEGIES,
  ROAS_FLOOR_STRATEGY,
  type MetricInputs,
} from "./metrics";

/**
 * A row with every field non-zero and every field DISTINCT, so a formula that reaches
 * for the wrong input produces a visibly wrong number instead of coincidentally
 * matching. That is the whole point: the historical bug here was CPC dividing by the
 * wrong click field, which two equal values would have hidden.
 */
function row(over: Partial<MetricInputs> = {}): MetricInputs {
  return {
    impressions: 10_000,
    swipes: 200, // PLATFORM clicks (Snap swipes / Meta link clicks)
    clicks: 50, // SELL-SIDE clicks (Visymo + Predicto)
    spend_usd: 100,
    revenue_usd: 400,
    funnel_clicks: 40,
    funnel_impressions: 800,
    snap_results: 8,
    ...over,
  };
}

// The regression this module exists for: PerformanceTable divided spend by PLATFORM
// clicks, DrilldownModal divided by SELL-SIDE clicks, so one ad set showed two
// different CPCs depending on which panel you opened.
describe("the swipes/clicks field contract", () => {
  it("computes cpc from swipes (platform), never clicks (sell-side)", () => {
    const m = deriveMetrics(row({ spend_usd: 100, swipes: 200, clicks: 50 }));
    expect(m.cpc).toBe(0.5); // 100 / 200
    expect(m.cpc).not.toBe(2); // 100 / 50 — the drilldown's old, wrong answer
  });

  it("computes rpc from clicks (sell-side), never swipes (platform)", () => {
    const m = deriveMetrics(row({ revenue_usd: 400, clicks: 50, swipes: 200 }));
    expect(m.rpc).toBe(8); // 400 / 50
    expect(m.rpc).not.toBe(2); // 400 / 200
  });

  it("computes ctr, cvr and fill_rate against the platform funnel", () => {
    const m = deriveMetrics(row({ impressions: 10_000, swipes: 200, funnel_clicks: 40, funnel_impressions: 800 }));
    expect(m.ctr).toBe(2); // 200 / 10000 * 100
    expect(m.cvr).toBe(20); // 40 / 200 * 100
    expect(m.fill_rate).toBe(400); // 800 / 200 * 100
  });
});

describe("scale factors", () => {
  it("scales cpm per thousand impressions", () => {
    expect(deriveMetrics(row({ spend_usd: 100, impressions: 10_000 })).cpm).toBe(10);
  });

  it("returns ctr, cvr and fill_rate as percentages, not ratios", () => {
    const m = deriveMetrics(row({ impressions: 100, swipes: 50, funnel_clicks: 25, funnel_impressions: 100 }));
    expect(m.ctr).toBe(50);
    expect(m.cvr).toBe(50);
    expect(m.fill_rate).toBe(200);
  });
});

describe("the funnel-volume gate", () => {
  // Revenue-per-click on a handful of clicks looks authoritative and is noise.
  it("suppresses rpc below 10 funnel clicks", () => {
    expect(deriveMetrics(row({ funnel_clicks: 9 })).rpc).toBeNull();
  });

  it("allows rpc at exactly 10 funnel clicks", () => {
    expect(deriveMetrics(row({ funnel_clicks: 10, revenue_usd: 400, clicks: 50 })).rpc).toBe(8);
  });

  // Deliberate asymmetry, and the more surprising half: rpr is revenue per RESULT, so
  // gating it on a CLICK threshold dashed exactly the rows converting best. Do not
  // "make this consistent" with rpc.
  it("does NOT gate rpr on funnel clicks", () => {
    const m = deriveMetrics(row({ funnel_clicks: 0, snap_results: 8, revenue_usd: 400 }));
    expect(m.rpr).toBe(50);
    expect(m.rpc).toBeNull(); // same row, gated — proves the two differ on purpose
  });
});

describe("zero denominators yield null, never Infinity or NaN", () => {
  it("nulls impression-based metrics when impressions are 0", () => {
    const m = deriveMetrics(row({ impressions: 0 }));
    expect(m.cpm).toBeNull();
    expect(m.ctr).toBeNull();
  });

  it("nulls swipe-based metrics when swipes are 0", () => {
    const m = deriveMetrics(row({ swipes: 0 }));
    expect(m.cpc).toBeNull();
    expect(m.cvr).toBeNull();
    expect(m.fill_rate).toBeNull();
  });

  it("nulls rpc when sell-side clicks are 0 even with funnel volume", () => {
    expect(deriveMetrics(row({ clicks: 0, funnel_clicks: 500 })).rpc).toBeNull();
  });

  it("nulls result-based metrics when there are no results", () => {
    const m = deriveMetrics(row({ snap_results: 0 }));
    expect(m.rpr).toBeNull();
    expect(m.snap_cost_per_result).toBeNull();
  });

  // An all-zero row is the common case for a freshly launched ad set. Every ratio must
  // be null and nothing may be NaN, or the dashboard renders "NaN%" on day one.
  it("survives an entirely zero row", () => {
    const m = deriveMetrics({
      impressions: 0, swipes: 0, clicks: 0, spend_usd: 0,
      revenue_usd: 0, funnel_clicks: 0, funnel_impressions: 0, snap_results: 0,
    });
    expect(m).toEqual({
      cpm: null, cpc: null, ctr: null, cvr: null, rpc: null, rpr: null,
      fill_rate: null, profit: 0, snap_cost_per_result: null,
    });
    for (const v of Object.values(m)) expect(Number.isNaN(v as number)).toBe(false);
  });
});

describe("profit", () => {
  it("is revenue minus spend", () => {
    expect(deriveMetrics(row({ revenue_usd: 400, spend_usd: 100 })).profit).toBe(300);
  });

  // Profit is the one metric that is never null — a loss is a real answer, and
  // returning null for it would hide exactly the rows worth looking at.
  it("goes negative on a loss rather than clamping or nulling", () => {
    expect(deriveMetrics(row({ revenue_usd: 10, spend_usd: 100 })).profit).toBe(-90);
  });
});

describe("bid-strategy constants", () => {
  it("covers the strategies with no user-settable bid", () => {
    expect(NO_BID_TARGET_STRATEGIES.has("AUTO_BID")).toBe(true);
    expect(NO_BID_TARGET_STRATEGIES.has("LOWEST_COST_WITHOUT_CAP")).toBe(true);
  });

  it("leaves COST_CAP and TARGET_COST editable", () => {
    expect(NO_BID_TARGET_STRATEGIES.has("COST_CAP")).toBe(false);
    expect(NO_BID_TARGET_STRATEGIES.has("TARGET_COST")).toBe(false);
  });

  // The ROAS strategy is deliberately NOT in that set: it needs its own branch, checked
  // first, because it carries its target in bid_constraints and has bid_micro = 0. A
  // caller relying on this set alone would render a "$0.00" bid editor for it.
  it("excludes the ROAS-floor strategy, which needs its own branch", () => {
    expect(NO_BID_TARGET_STRATEGIES.has(ROAS_FLOOR_STRATEGY)).toBe(false);
    expect(ROAS_FLOOR_STRATEGY).toBe("LOWEST_COST_WITH_MIN_ROAS");
  });
});
