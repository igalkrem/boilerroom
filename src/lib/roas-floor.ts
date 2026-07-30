/**
 * Helpers for Meta's `bid_constraints.roas_average_floor`.
 *
 * DELIBERATELY CONTAINS NO PLAUSIBILITY CHECK. An earlier version of this file capped
 * the value, on the reasoning that a preset storing roasFloor 90 would send 900000 (a
 * 90x return) and could never deliver. That reasoning was wrong, and the cap would have
 * broken a live workflow:
 *
 * `roasDisplayDivisor` (per provider, FeedProviderModal's Meta tab) is NOT display-only.
 * It divides on read and MULTIPLIES BACK on save, so for the Predicto provider — which
 * has it set to 100 — a cell reading "90%" genuinely stores 900000, and those ad sets
 * are delivering with real spend. There is therefore no single scale that a numeric
 * bound could police: the correct magnitude depends on which provider owns the ad set.
 *
 * The real problem is that two conventions coexist. Preset `roasFloor` is applied with
 * no divisor at all (see meta-submission-orchestrator), so a preset is implicitly tied
 * to one provider's scale — which is why two saved presets hold 0.9 and 90 for what is
 * the same intent under different providers. Fixing that means correcting the stored
 * floors at the source and setting the divisor back to 1, as the note in
 * PerformanceTable already recommends. Until that decision is made, do not add a bound.
 */

/** Ratio -> the value Meta stores, at divisor 1. 0.9 -> 9000. */
export function toRoasAverageFloor(ratio: number): number {
  return Math.round(ratio * 10000);
}

/** Human-readable percentage for a ratio, e.g. 0.9 -> "90%", 90 -> "9000%". */
export function formatRoasPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(0)}%`;
}
