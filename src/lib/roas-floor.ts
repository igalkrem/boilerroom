/**
 * Helpers for Meta's `bid_constraints.roas_average_floor`.
 *
 * TWO CONVERSION VALUE SCALES COEXIST, AND THAT IS NOT A BUG. Measured against live ad
 * sets on 2026-08-03: one pixel (840455538279291, Predicto's) reports about $37 per
 * conversion while the others report about $0.09–$0.24 for the same kind of event, ~300x
 * apart. That pixel inflates its reported values (confirmed by the user); the real revenue
 * is the small number. A floor therefore only means anything relative to the scale of the
 * pixel measuring it:
 *
 *   pixel reporting ~$0.11/conv  ->  floor  0.9  (stored    9000)  = about break-even
 *   pixel reporting ~$37/conv    ->  floor 90    (stored  900000)  = about break-even
 *
 * `roasDisplayDivisor` (per provider, FeedProviderModal's Meta tab) reconciles them: it
 * divides on read and multiplies back on save, so a cell reading "90%" means break-even on
 * either provider. It is compensating correctly and MUST NOT be reset to 1 while the pixel
 * still inflates — at divisor 1 a Predicto ad set would hold a floor of 0.9 against
 * inflated values, which is really ~0.009 and constrains nothing.
 *
 * AN EARLIER VERSION OF THIS FILE RECOMMENDED EXACTLY THAT ("correct the stored floors at
 * the source and set the divisor back to 1"), assuming a single true scale existed. Acting
 * on it would have dropped 79 live ad sets — returning $264,643 on $2,255 of spend, a
 * binding ~90x reported floor — to no effective floor. Do not reinstate that advice unless
 * Predicto's pixel is fixed upstream first, and then the floors and the divisor have to
 * move together in a single change.
 *
 * Also DELIBERATELY NO PLAUSIBILITY CHECK: no numeric bound can police these values,
 * because the correct magnitude depends on which provider owns the ad set.
 */

/**
 * Ratio -> the value Meta stores. 0.9 -> 9000.
 *
 * Prefer `toRoasAverageFloorForProvider` when building a real ad set payload — this
 * overload knows nothing about the pixel scale it will be measured against, and calling it
 * directly is what silently produced 9 mis-scaled live ad sets.
 */
export function toRoasAverageFloor(ratio: number): number {
  return Math.round(ratio * 10000);
}

/**
 * Legacy presets stored `roasFloor` ALREADY MULTIPLIED by Predicto's divisor, because the
 * orchestrator applied no divisor and the value had to be pre-scaled by hand to work
 * there. Live data (2026-08-03) holds exactly two such presets, both named "WW": one at
 * 0.9 (a true ratio) and one at 90 (0.9 pre-scaled by 100).
 *
 * Without this shim, adding the divisor multiplication would take the 90 preset to
 * 90 x 100 x 10000 = 90,000,000 — far worse than the bug being fixed. Normalising on read
 * instead means the code is correct against the data as it actually exists, rather than
 * depending on a manual migration having been run first.
 *
 * The 100 is not arbitrary: it is the only divisor any provider uses, so it is the only
 * factor a hand-scaled preset can have been multiplied by. A real floor is a small ratio
 * (observed live: 0.45–1.17), so the threshold of 10 sits far from any legitimate value in
 * either direction. Once no stored preset holds a value above 10, delete this function and
 * call `toRoasAverageFloor(ratio * divisor)` directly.
 */
const LEGACY_PRESCALED_THRESHOLD = 10;
const LEGACY_PRESCALE_FACTOR = 100;

function normalizePresetRoasFloor(ratio: number): number {
  return ratio >= LEGACY_PRESCALED_THRESHOLD ? ratio / LEGACY_PRESCALE_FACTOR : ratio;
}

/**
 * Ratio -> the value Meta stores, scaled for the provider whose pixel will measure it.
 *
 * A preset's `roasFloor` is a TRUE ratio (0.9 = break even) and is provider-independent;
 * the divisor adapts it to the target pixel's scale. The orchestrator previously called
 * `toRoasAverageFloor` with no divisor, so a preset was implicitly bound to one provider's
 * scale: launching the 0.9 preset at Predicto wrote 9000 against inflated values — no real
 * floor — which is how 9 ad sets ended up running at ~0.41x real ROAS. It also forced two
 * near-duplicate "WW" presets holding 0.9 and 90 for identical intent. With this, one
 * preset covers every provider and the mis-scaled combination cannot be expressed.
 *
 * Verified against the two live presets and both live providers:
 *
 *   preset 0.9, Predicto (divisor 100) -> 900000   (break-even on the inflating pixel)
 *   preset 0.9, Vizymo   (divisor   1) ->   9000   (break-even on a normal pixel)
 *   preset 90,  Predicto (divisor 100) -> 900000   (legacy value normalised first)
 *   preset 90,  Vizymo   (divisor   1) ->   9000   (legacy value normalised first)
 */
export function toRoasAverageFloorForProvider(ratio: number, roasDisplayDivisor?: number): number {
  const divisor = roasDisplayDivisor && roasDisplayDivisor > 0 ? roasDisplayDivisor : 1;
  return toRoasAverageFloor(normalizePresetRoasFloor(ratio) * divisor);
}

/** Human-readable percentage for a ratio, e.g. 0.9 -> "90%", 90 -> "9000%". */
export function formatRoasPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(0)}%`;
}
