import { describe, it, expect } from "vitest";
import {
  toRoasAverageFloor,
  toRoasAverageFloorForProvider,
  formatRoasPercent,
} from "./roas-floor";

// The divisors that actually exist in the live data, named so the cases below read as
// intent rather than as magic numbers.
const PREDICTO = 100; // inflating pixel (840455538279291), ~$37/conversion
const VIZYMO = 1; // normal pixel, ~$0.09-$0.24/conversion

describe("toRoasAverageFloor", () => {
  it("scales a ratio by Meta's fixed factor of 10,000", () => {
    expect(toRoasAverageFloor(0.9)).toBe(9000);
    expect(toRoasAverageFloor(1)).toBe(10_000);
    expect(toRoasAverageFloor(1.17)).toBe(11_700);
    expect(toRoasAverageFloor(0.45)).toBe(4500);
  });

  it("returns an integer, which Meta requires", () => {
    for (const ratio of [0.333, 0.12345, 1.00005]) {
      expect(Number.isInteger(toRoasAverageFloor(ratio))).toBe(true);
    }
  });
});

describe("toRoasAverageFloorForProvider", () => {
  // These four cases are the verification that was previously run once by hand in a
  // throwaway script and then discarded. They are the contract of the 2026-08-03 fix.
  it("matches the values verified against both live presets and both live providers", () => {
    expect(toRoasAverageFloorForProvider(0.9, PREDICTO)).toBe(900_000);
    expect(toRoasAverageFloorForProvider(0.9, VIZYMO)).toBe(9000);
    expect(toRoasAverageFloorForProvider(90, PREDICTO)).toBe(900_000);
    expect(toRoasAverageFloorForProvider(90, VIZYMO)).toBe(9000);
  });

  // The bug itself: the orchestrator called the divisor-unaware overload, so a true-ratio
  // preset launched at Predicto wrote 9000 against inflated values -- about 0.009 in real
  // terms, which constrains nothing. Nine ad sets ran at ~0.41x real ROAS because of it.
  it("does not collapse a true ratio to an unconstraining floor at Predicto", () => {
    expect(toRoasAverageFloorForProvider(0.9, PREDICTO)).not.toBe(toRoasAverageFloor(0.9));
    expect(toRoasAverageFloorForProvider(0.9, PREDICTO)).toBe(toRoasAverageFloor(0.9) * PREDICTO);
  });

  // The near-miss during the fix: adding the multiplication without normalising first
  // would have sent the legacy pre-scaled preset to 90 * 100 * 10000 = 90,000,000.
  it("normalises a legacy pre-scaled preset instead of multiplying it again", () => {
    expect(toRoasAverageFloorForProvider(90, PREDICTO)).not.toBe(90_000_000);
  });

  // One preset now has to cover every provider -- that was the point of the change.
  it("makes a preset provider-independent: equal intent yields equal floors", () => {
    for (const divisor of [PREDICTO, VIZYMO]) {
      expect(toRoasAverageFloorForProvider(0.9, divisor)).toBe(
        toRoasAverageFloorForProvider(90, divisor)
      );
    }
  });

  describe("missing or unusable divisors", () => {
    // A provider with no Meta config must behave as an un-scaled pixel rather than
    // throwing or producing NaN, which would abort a launch mid-flight.
    it("treats undefined as a divisor of 1", () => {
      expect(toRoasAverageFloorForProvider(0.9, undefined)).toBe(9000);
      expect(toRoasAverageFloorForProvider(0.9)).toBe(9000);
    });

    // Zero would make every floor 0 (no constraint at all) and a negative divisor would
    // make it negative; both fall back to 1 rather than being passed through.
    it("falls back to 1 for zero and negative divisors", () => {
      expect(toRoasAverageFloorForProvider(0.9, 0)).toBe(9000);
      expect(toRoasAverageFloorForProvider(0.9, -100)).toBe(9000);
    });
  });

  describe("the legacy normalisation threshold", () => {
    // The threshold sits at 10, far above any real floor (observed live: 0.45-1.17) and
    // far below a hand-scaled one (0.45-1.17 x 100). These assertions pin which side of
    // the line each kind of value falls on.
    it("leaves plausible true ratios untouched", () => {
      expect(toRoasAverageFloorForProvider(0.45, VIZYMO)).toBe(4500);
      expect(toRoasAverageFloorForProvider(1.17, VIZYMO)).toBe(11_700);
      expect(toRoasAverageFloorForProvider(9.99, VIZYMO)).toBe(99_900);
    });

    it("normalises values at or above the threshold", () => {
      expect(toRoasAverageFloorForProvider(10, VIZYMO)).toBe(1000); // 10 -> 0.1
      expect(toRoasAverageFloorForProvider(45, VIZYMO)).toBe(4500); // 45 -> 0.45
      expect(toRoasAverageFloorForProvider(117, VIZYMO)).toBe(11_700); // 117 -> 1.17
    });

    // Documents the deliberate consequence of a value-based heuristic: a preset holding a
    // genuinely huge ratio cannot be expressed. That is accepted because no such floor is
    // legitimate. If one ever becomes legitimate, this test is the thing that should fail.
    it("cannot express a true ratio of 10 or more", () => {
      expect(toRoasAverageFloorForProvider(10, VIZYMO)).not.toBe(toRoasAverageFloor(10));
    });
  });
});

describe("formatRoasPercent", () => {
  it("renders a ratio as a whole-number percentage", () => {
    expect(formatRoasPercent(0.9)).toBe("90%");
    expect(formatRoasPercent(1)).toBe("100%");
    expect(formatRoasPercent(1.17)).toBe("117%");
  });

  // Display-only, and deliberately not normalised: a legacy 90 preset should look wrong
  // in the UI, because it is.
  it("does not normalise legacy pre-scaled values", () => {
    expect(formatRoasPercent(90)).toBe("9000%");
  });
});
