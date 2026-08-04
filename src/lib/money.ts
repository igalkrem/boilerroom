/**
 * The only place dollars are converted to and from the integer units the ad platforms
 * actually store. Snapchat takes micro-dollars (1 USD = 1,000,000); Meta takes minor
 * currency units, i.e. cents (1 USD = 100).
 *
 * THESE FOUR FUNCTIONS MUST NOT BE RE-IMPLEMENTED LOCALLY. Before 2026-08-04 the same
 * arithmetic was written out in four places — a private `usdToMicro` in
 * submission-orchestrator, a private `microToDollar`/`dollarToMicro` pair inside
 * PerformanceTable, and bare `* 100` / `/ 100` in PresetForm and the presets page. That is
 * the exact shape of the ROAS-floor bug fixed the day before: one concept spread across
 * several paths, where fixing one path leaves the others behind. A wrong factor here does
 * not throw — it silently multiplies or divides real ad spend by 100 or 1,000,000.
 *
 * Every to-integer conversion rounds, and that is load-bearing rather than cosmetic.
 * Binary floating point cannot represent most decimal money values exactly: `2.01 * 1e6`
 * is 2009999.9999999998 and `20.15 * 100` is 2014.9999999999998, so truncation (`| 0`,
 * `Math.floor`, or a bare pass to an API that truncates) would bill 2009999 and 2014.
 * What makes this worth guarding is that it is intermittent rather than systematic —
 * `8.15 * 1e6` is exactly 8150000, so a handful of spot checks will happily pass. See
 * money.test.ts for the values that actually fail. Do not remove the rounding, and do not
 * add a plausibility clamp here: callers own their own limits, and a silent clamp inside a
 * shared converter is very hard to trace back to.
 */

/** Dollars -> Snapchat micro-dollars. 8.15 -> 8_150_000. */
export function usdToMicro(usd: number): number {
  return Math.round(usd * 1_000_000);
}

/**
 * Snapchat micro-dollars -> dollars. 8_150_000 -> 8.15.
 *
 * Returns an unrounded float: callers format for display (`.toFixed(2)`) or convert
 * straight back with `usdToMicro`. Rounding here would lose precision before the caller
 * had a chance to decide how much it needs.
 */
export function microToUsd(micro: number): number {
  return micro / 1_000_000;
}

/** Dollars -> Meta minor units (cents). 20.15 -> 2015. */
export function usdToCents(usd: number): number {
  return Math.round(usd * 100);
}

/** Meta minor units (cents) -> dollars. 2015 -> 20.15. */
export function centsToUsd(cents: number): number {
  return cents / 100;
}
