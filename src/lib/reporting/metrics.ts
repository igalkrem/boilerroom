// Single definition of every derived performance metric.
//
// These formulas previously existed twice — PerformanceTable computed them one way
// and DrilldownModal another — so the same ad set showed a different CPC depending on
// which panel you opened. CPC was the clear casualty: the table divided spend by
// PLATFORM clicks while the drilldown divided by SELL-SIDE clicks, two unrelated
// funnels. Import from here; do not re-derive at a call site.
//
// Field contract (enforced in combined/route.ts and drilldown/route.ts, both arms):
//   swipes  — PLATFORM clicks. Snap swipes, or Meta link clicks.
//   clicks  — SELL-SIDE clicks only. Visymo + Predicto / Predicto FB.
// Mixing the two is what DR-5 fixed; metrics below depend on the split holding.

// Revenue-per-X metrics are suppressed below this many funnel clicks, because a
// handful of clicks against real revenue produces a per-click figure that looks
// authoritative and is noise.
const MIN_FUNNEL_CLICKS_FOR_PER_CLICK = 10;

export interface MetricInputs {
  impressions: number;
  swipes: number;
  clicks: number;
  spend_usd: number;
  revenue_usd: number;
  funnel_clicks: number;
  funnel_impressions: number;
  snap_results: number;
}

export interface DerivedMetrics {
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  cvr: number | null;
  rpc: number | null;
  rpr: number | null;
  fill_rate: number | null;
  profit: number;
  snap_cost_per_result: number | null;
}

export function deriveMetrics(a: MetricInputs): DerivedMetrics {
  const hasFunnelVolume = a.funnel_clicks >= MIN_FUNNEL_CLICKS_FOR_PER_CLICK;
  return {
    // Buy-side cost metrics: denominator is always the platform metric, never the feed.
    cpm: a.impressions > 0 ? (a.spend_usd / a.impressions) * 1000 : null,
    cpc: a.swipes > 0 ? a.spend_usd / a.swipes : null,
    ctr: a.impressions > 0 ? (a.swipes / a.impressions) * 100 : null,
    cvr: a.swipes > 0 ? (a.funnel_clicks / a.swipes) * 100 : null,
    fill_rate: a.swipes > 0 ? (a.funnel_impressions / a.swipes) * 100 : null,

    // Sell-side revenue metrics, gated on enough funnel volume to be meaningful.
    rpc: hasFunnelVolume && a.clicks > 0 ? a.revenue_usd / a.clicks : null,
    // NOT gated on funnel_clicks: a squad can have many purchases and few funnel
    // clicks, and suppressing revenue-per-RESULT on a CLICK threshold rendered a
    // dash for exactly the rows that were converting best.
    rpr: a.snap_results > 0 ? a.revenue_usd / a.snap_results : null,

    profit: a.revenue_usd - a.spend_usd,
    snap_cost_per_result: a.snap_results > 0 ? a.spend_usd / a.snap_results : null,
  };
}

// Bid strategies with no user-settable bid value — the Bid column shows the strategy
// pill and a dash instead of an editor. Shared so the drilldown modal cannot offer an
// editor the main table correctly refuses.
export const NO_BID_TARGET_STRATEGIES = new Set(["AUTO_BID", "LOWEST_COST_WITHOUT_CAP"]);

// Meta's ROAS-floor strategy: edited through the ROAS editor, not the bid editor.
export const ROAS_FLOOR_STRATEGY = "LOWEST_COST_WITH_MIN_ROAS";
