import { describe, it, expect } from "vitest";
import { postSchema as campaignPostSchema } from "@/app/api/meta/campaigns/route";
import { postSchema as adSetPostSchema } from "@/app/api/meta/adsets/route";
import { postSchema as creativePostSchema } from "@/app/api/meta/creatives/route";
import { postSchema as adPostSchema } from "@/app/api/meta/ads/route";

/**
 * Guards the single most expensive failure class in this codebase: a field the
 * orchestrator builds correctly, that its route's Zod schema silently drops before it
 * ever reaches Meta. Zod's default `.strip()` does this without an error — the request
 * returns HTTP 200 and the field is simply absent on the created object, so the only
 * symptom is a behavioural one noticed days later in Ads Manager. It has happened at
 * least three times: `is_adset_budget_sharing_enabled` (error_subcode 4834011),
 * `creative_asset_groups_spec` (the "Flexible" format label never applied), and
 * `degrees_of_freedom_spec` (Advantage+ read back fully OPT_OUT).
 *
 * These tests cannot be satisfied by a live launch, which is why they exist here: the
 * `/api/meta/debug/test-launch` diagnostic calls createAd/createAdCreative directly and
 * bypasses every schema below, so "confirmed working" there proves nothing about this.
 *
 * WHEN YOU ADD A FIELD to any Meta payload in meta-submission-orchestrator.ts, add it to
 * the corresponding fixture here. A round-trip failure means the route would have
 * dropped it in production.
 */

/** Parse and assert the payload survives byte-for-byte — the strongest available check. */
function expectNoStrip<T>(schema: { parse: (v: unknown) => T }, payload: unknown) {
  const parsed = schema.parse(payload);
  expect(parsed).toEqual(payload);
  return parsed;
}

describe("POST /api/meta/campaigns", () => {
  const payload = {
    adAccountId: "act_123",
    campaign: {
      name: "WW | Test | 0804 | V1",
      status: "PAUSED" as const,
      objective: "OUTCOME_SALES" as const,
      special_ad_categories: [],
      // Meta REQUIRES this explicitly whenever the campaign carries no budget of its
      // own, which this app guarantees (budget is always ABO, on the ad set). It was
      // absent from this schema once and every launch failed with error_subcode 4834011.
      is_adset_budget_sharing_enabled: false,
    },
  };

  it("round-trips the orchestrator's campaign payload with nothing stripped", () => {
    expectNoStrip(campaignPostSchema, payload);
  });

  it("keeps is_adset_budget_sharing_enabled specifically", () => {
    const parsed = campaignPostSchema.parse(payload);
    expect(parsed.campaign.is_adset_budget_sharing_enabled).toBe(false);
    expect("is_adset_budget_sharing_enabled" in parsed.campaign).toBe(true);
  });

  it("rejects any objective other than OUTCOME_SALES", () => {
    expect(() =>
      campaignPostSchema.parse({ ...payload, campaign: { ...payload.campaign, objective: "OUTCOME_TRAFFIC" } })
    ).toThrow();
  });
});

describe("POST /api/meta/adsets", () => {
  // The ROAS-floor variant, because that path carries the value real money keys off.
  const payload = {
    adAccountId: "act_123",
    adSet: {
      campaign_id: "120250000000000000",
      name: "WW | Test | 0804 | V1",
      status: "PAUSED" as const,
      billing_event: "IMPRESSIONS",
      optimization_goal: "VALUE",
      targeting: {
        geo_locations: { countries: ["US"] },
        excluded_geo_locations: { countries: ["TH", "SG", "TW"] },
        publisher_platforms: ["facebook", "instagram"],
      },
      bid_strategy: "LOWEST_COST_WITH_MIN_ROAS" as const,
      // 0.9 ratio at Predicto's divisor of 100 -> 900000. No ceiling is correct here.
      bid_constraints: { roas_average_floor: 900_000 },
      daily_budget: 1000,
      attribution_spec: [{ event_type: "CLICK_THROUGH", window_days: 1 }],
      promoted_object: { pixel_id: "1801732700649490", custom_event_type: "PURCHASE" },
      regional_regulated_categories: ["TAIWAN_UNIVERSAL"],
      start_time: "2026-08-04T00:00:00.000Z",
    },
  };

  it("round-trips the orchestrator's ad set payload with nothing stripped", () => {
    expectNoStrip(adSetPostSchema, payload);
  });

  // attribution_spec, promoted_object and regional_regulated_categories are NOT named in
  // adSetShape — they survive only because it is `.passthrough()`. If anyone ever closes
  // that object, these three vanish silently and this test is the tripwire.
  it("preserves the unnamed fields that rely on .passthrough()", () => {
    const parsed = adSetPostSchema.parse(payload) as typeof payload;
    expect(parsed.adSet.attribution_spec).toEqual([{ event_type: "CLICK_THROUGH", window_days: 1 }]);
    expect(parsed.adSet.promoted_object).toEqual(payload.adSet.promoted_object);
    expect(parsed.adSet.regional_regulated_categories).toEqual(["TAIWAN_UNIVERSAL"]);
  });

  it("preserves the whole targeting object, including excluded_geo_locations", () => {
    const parsed = adSetPostSchema.parse(payload) as typeof payload;
    expect(parsed.adSet.targeting).toEqual(payload.adSet.targeting);
  });

  describe("money guards", () => {
    const budget = (v: number) => ({ ...payload, adSet: { ...payload.adSet, daily_budget: v } });

    // Graph truncates a fractional minor-unit value, turning a $10.50 intent into an
    // unnoticed $10.00 cap. Reject it at the edge instead.
    it("rejects a fractional daily_budget", () => {
      expect(() => adSetPostSchema.parse(budget(1050.5))).toThrow();
    });

    it("rejects zero and negative daily_budget", () => {
      expect(() => adSetPostSchema.parse(budget(0))).toThrow();
      expect(() => adSetPostSchema.parse(budget(-1000))).toThrow();
    });

    const floor = (v: number) => ({
      ...payload,
      adSet: { ...payload.adSet, bid_constraints: { roas_average_floor: v } },
    });

    it("rejects a non-positive roas_average_floor", () => {
      expect(() => adSetPostSchema.parse(floor(0))).toThrow();
      expect(() => adSetPostSchema.parse(floor(-9000))).toThrow();
    });

    // Deliberately NO upper bound: at a divisor of 100 a legitimate "90%" cell stores
    // 900000, so any ceiling would reject real launches. See lib/roas-floor.ts.
    it("accepts a large roas_average_floor, because no ceiling is correct", () => {
      expect(floor(900_000).adSet.bid_constraints.roas_average_floor).toBe(900_000);
      expect(() => adSetPostSchema.parse(floor(900_000))).not.toThrow();
      expect(() => adSetPostSchema.parse(floor(9_000))).not.toThrow();
    });
  });
});

describe("POST /api/meta/creatives", () => {
  const base = {
    name: "WW | Test | 0804 | V1",
    // The v22+ write name. `instagram_actor_id` is unsupported, and this field being
    // stripped means an ad ships with no Instagram identity at HTTP 200.
    instagram_user_id: "17841478313981323",
    // Drives the Advantage+ toggle. Read back fully OPT_OUT once because this key was
    // missing from the schema while the orchestrator was building it correctly.
    degrees_of_freedom_spec: {
      creative_features_spec: {
        advantage_plus_creative: { enroll_status: "OPT_IN" as const },
        inline_comment: { enroll_status: "OPT_IN" as const },
        product_extensions: { enroll_status: "OPT_IN" as const },
        site_extensions: { enroll_status: "OPT_IN" as const },
        text_optimizations: { enroll_status: "OPT_IN" as const },
      },
    },
  };

  const imagePayload = {
    adAccountId: "act_123",
    creative: {
      ...base,
      object_story_spec: {
        page_id: "861456873718305",
        link_data: {
          link: "https://example.com/?utm=1",
          image_hash: "abc123",
          name: "Headline",
          message: "Primary text",
          call_to_action: { type: "LEARN_MORE", value: { link: "https://example.com/?utm=1" } },
        },
      },
    },
  };

  const videoPayload = {
    adAccountId: "act_123",
    creative: {
      ...base,
      object_story_spec: {
        page_id: "861456873718305",
        video_data: {
          video_id: "1790220378626220",
          // Meta rejects video_data with no thumbnail at all (error_subcode 1443226),
          // and an empty image_hash is rejected too — hence image_url as the carrier.
          image_url: "https://scontent.example/thumb.jpg",
          title: "Headline",
          message: "Primary text",
          call_to_action: { type: "LEARN_MORE", value: { link: "https://example.com/?utm=1" } },
        },
      },
    },
  };

  it("round-trips the image creative with nothing stripped", () => {
    expectNoStrip(creativePostSchema, imagePayload);
  });

  it("round-trips the video creative with nothing stripped", () => {
    expectNoStrip(creativePostSchema, videoPayload);
  });

  it("keeps degrees_of_freedom_spec and instagram_user_id specifically", () => {
    const parsed = creativePostSchema.parse(imagePayload);
    expect(parsed.creative.degrees_of_freedom_spec).toEqual(base.degrees_of_freedom_spec);
    expect(parsed.creative.instagram_user_id).toBe("17841478313981323");
  });

  // Meta rejects this outright (error_subcode 3858504) — it must not have a path to the
  // wire, so the schema should refuse the enum value it isn't allowed to carry.
  it("rejects an enroll_status outside OPT_IN/OPT_OUT", () => {
    const bad = structuredClone(imagePayload) as typeof imagePayload;
    // @ts-expect-error deliberately invalid
    bad.creative.degrees_of_freedom_spec.creative_features_spec.advantage_plus_creative.enroll_status = "ENABLED";
    expect(() => creativePostSchema.parse(bad)).toThrow();
  });
});

describe("POST /api/meta/ads", () => {
  const payload = {
    adAccountId: "act_123",
    ad: {
      name: "WW | Test | 0804 | V1",
      adset_id: "120250000000000000",
      creative: { creative_id: "2806613799698285" },
      status: "PAUSED" as const,
      // This field on the AD node is what makes Ads Manager show "Flexible". It was
      // absent from this schema while the orchestrator sent it, so a real launched ad
      // came back with no creative_asset_groups_spec at all (confirmed 2026-07-20).
      creative_asset_groups_spec: {
        origins: ["CAG"],
        groups: [
          {
            call_to_action: { type: "LEARN_MORE", value: { link: "https://example.com/?utm=1" } },
            images: [{ hash: "abc123" }, { hash: "def456" }],
            videos: [{ video_id: "1790220378626220", thumbnail_url: "https://scontent.example/t.jpg" }],
            // Flexible ads render their text from HERE, not from object_story_spec —
            // the ad preview showed no headline until these two were added.
            bodies: [{ text: "Primary text" }],
            titles: [{ text: "Headline" }],
          },
        ],
      },
    },
  };

  it("round-trips the orchestrator's ad payload with nothing stripped", () => {
    expectNoStrip(adPostSchema, payload);
  });

  it("keeps creative_asset_groups_spec, including bodies and titles", () => {
    const parsed = adPostSchema.parse(payload);
    const group = parsed.ad.creative_asset_groups_spec?.groups?.[0];
    expect(parsed.ad.creative_asset_groups_spec?.origins).toEqual(["CAG"]);
    expect(group?.bodies).toEqual([{ text: "Primary text" }]);
    expect(group?.titles).toEqual([{ text: "Headline" }]);
    expect(group?.images).toHaveLength(2);
    expect(group?.videos?.[0]?.video_id).toBe("1790220378626220");
  });

  // The 2+ item creative group bundles every asset into ONE ad, so the arrays must
  // survive at length, not just be present.
  it("preserves a multi-asset group at full length", () => {
    const many = structuredClone(payload);
    many.ad.creative_asset_groups_spec.groups[0].images = [
      { hash: "h1" }, { hash: "h2" }, { hash: "h3" }, { hash: "h4" }, { hash: "h5" },
    ];
    const parsed = adPostSchema.parse(many);
    expect(parsed.ad.creative_asset_groups_spec?.groups?.[0]?.images).toHaveLength(5);
  });
});

/**
 * Asserts the premise of every round-trip test above: that stripping is real and these
 * schemas would in fact silently drop an unlisted field. Without this, a schema that
 * had been switched to `.passthrough()` would make all the deep-equal assertions pass
 * trivially while providing no protection at all.
 */
describe("the stripping behaviour these tests guard against", () => {
  it("campaigns, creatives and ads DO silently strip an unlisted field", () => {
    const c = campaignPostSchema.parse({
      adAccountId: "act_123",
      campaign: {
        name: "n", status: "PAUSED", objective: "OUTCOME_SALES",
        special_ad_categories: [], totally_new_field: "dropped",
      },
    }) as { campaign: Record<string, unknown> };
    expect("totally_new_field" in c.campaign).toBe(false);

    const a = adPostSchema.parse({
      adAccountId: "act_123",
      ad: {
        name: "n", adset_id: "1", creative: { creative_id: "1" },
        status: "PAUSED", totally_new_field: "dropped",
      },
    }) as { ad: Record<string, unknown> };
    expect("totally_new_field" in a.ad).toBe(false);
  });

  // The ad set schema is the deliberate exception — `.passthrough()`, which is how
  // attribution_spec and promoted_object reach Meta without being named.
  it("adsets does NOT strip, by design", () => {
    const parsed = adSetPostSchema.parse({
      adAccountId: "act_123",
      adSet: {
        campaign_id: "1", name: "n", status: "PAUSED",
        billing_event: "IMPRESSIONS", optimization_goal: "VALUE",
        targeting: {}, totally_new_field: "kept",
      },
    }) as { adSet: Record<string, unknown> };
    expect(parsed.adSet.totally_new_field).toBe("kept");
  });
});
