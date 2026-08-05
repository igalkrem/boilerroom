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
 * Cancels the divisor multiplication back out for a preset that was authored in its
 * provider's own pixel scale rather than as a true ratio.
 *
 * DO NOT DELETE THIS AS DEAD LEGACY CODE. An earlier version of this comment called the
 * >= 10 values "legacy hand-scaled" and said to delete the function once none remained.
 * That was wrong. A preset belongs to exactly one provider (`feedProviderId` is required,
 * and CampaignCanvas only attaches a preset to an article of the same provider), so
 * authoring in that provider's scale is the natural thing to do and the live data does
 * exactly that. Measured 2026-08-05:
 *
 *   WW / Vizymo   (divisor   1) -> roasFloor  0.9    both break-even for their own pixel
 *   WW / Predicto (divisor 100) -> roasFloor 90
 *
 * Removing this shim would send Predicto's preset to 90 x 100 x 10000 = 90,000,000.
 *
 * KNOWN LANDMINE — correct only while 100 is the sole non-unity divisor. The value is
 * scaled by the provider's divisor AND normalised back down by a hardcoded 100, so the two
 * cancel only when they are equal. Authoring 0.9 x D in provider scale at any other D:
 *
 *   D =   10  -> authored   9, below the threshold, unnormalised -> 10x TOO HIGH
 *   D = 1000  -> authored 900, normalised by 100                 -> 10x TOO HIGH
 *   D =   10, floor 1.0 -> authored 10, trips the threshold      -> 10x TOO LOW
 *
 * The threshold makes the error discontinuous, so at one provider a 0.9 floor and a 1.0
 * floor break in opposite directions, silently. Before adding a provider whose
 * roasDisplayDivisor is neither 1 nor 100, resolve the double-scaling instead of extending
 * this: either presets store a TRUE ratio and the divisor adapts it, or presets store
 * provider-scale values and no divisor is applied — not both.
 */
const LEGACY_PRESCALED_THRESHOLD = 10;
const LEGACY_PRESCALE_FACTOR = 100;

function normalizePresetRoasFloor(ratio: number): number {
  return ratio >= LEGACY_PRESCALED_THRESHOLD ? ratio / LEGACY_PRESCALE_FACTOR : ratio;
}

/**
 * The only divisors the preset scaling above is correct for.
 *
 * 1 needs no scaling at all, and 100 is the value `LEGACY_PRESCALE_FACTOR` cancels against.
 * Anything else silently mis-scales every ROAS floor launched at that provider, so it is
 * refused rather than accepted — a rejected input is recoverable, a live ad set holding a
 * floor 10x off is not. Audited across every metadata row on 2026-08-05: the only stored
 * values are 100 (Predicto) and unset (Vizymo), so nothing in production trips this.
 *
 * If a provider genuinely needs another divisor, fix the double-scaling first (see
 * `normalizePresetRoasFloor`) — do NOT just widen this list.
 */
export const SUPPORTED_ROAS_DIVISORS = [1, 100] as const;

/** Whether a divisor can be scaled correctly. `undefined`/unset means 1, which is fine. */
export function isSupportedRoasDivisor(divisor: number | undefined | null): boolean {
  if (divisor === undefined || divisor === null) return true;
  return (SUPPORTED_ROAS_DIVISORS as readonly number[]).includes(divisor);
}

/**
 * Ratio -> the value Meta stores, scaled for the provider whose pixel will measure it.
 *
 * The orchestrator previously called `toRoasAverageFloor` with no divisor, so launching a
 * preset holding 0.9 at Predicto wrote 9000 against inflated values — no real floor — which
 * is how 9 ad sets ended up running at ~0.41x real ROAS.
 *
 * The two live "WW" presets are NOT duplicates: presets are provider-scoped, so there is
 * one per provider by design, each authored in its own provider's pixel scale (0.9 at
 * Vizymo, 90 at Predicto). `normalizePresetRoasFloor` is what makes both land correctly
 * here — see its comment, including the divisor landmine.
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

  // Refuse rather than mis-scale. An unsupported divisor cannot produce a correct floor here
  // (see SUPPORTED_ROAS_DIVISORS), and the wrong value is unnoticeable once live: the ad set
  // just underperforms or stops delivering. Throwing aborts the launch in WizardShell's
  // handleLaunch catch, which surfaces this message and still persists the build log, so the
  // operator sees why nothing launched. Unreachable via the UI — MetaTab rejects the input —
  // so this only fires for a value written directly to metadata.
  if (!isSupportedRoasDivisor(divisor)) {
    throw new Error(
      `Unsupported roasDisplayDivisor ${divisor}: ROAS floors can only be scaled correctly ` +
        `for ${SUPPORTED_ROAS_DIVISORS.join(" or ")}. Launch refused rather than writing a ` +
        `mis-scaled floor. See src/lib/roas-floor.ts before changing this provider's divisor.`
    );
  }

  return toRoasAverageFloor(normalizePresetRoasFloor(ratio) * divisor);
}

/** Human-readable percentage for a ratio, e.g. 0.9 -> "90%", 90 -> "9000%". */
export function formatRoasPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(0)}%`;
}
