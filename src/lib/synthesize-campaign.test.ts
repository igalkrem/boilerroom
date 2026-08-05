import { describe, it, expect } from "vitest";
import { synthesizeCampaign, synthesizeMetaCampaign, pickBestPage } from "./synthesize-campaign";
import { toRoasAverageFloorForProvider } from "./roas-floor";
import { postSchema as adSetPostSchema } from "@/app/api/meta/adsets/route";
import type { CampaignBuildItem } from "@/types/wizard";
import type { FeedProvider } from "@/types/feed-provider";
import type { Article } from "@/types/article";
import type { CampaignPreset } from "@/types/preset";
import type { SiloAsset } from "@/types/silo";

/**
 * Covers the launch path up to (not including) the network calls. `synthesizeCampaign` /
 * `synthesizeMetaCampaign` are where a preset, provider, article and asset become the
 * payload shape the orchestrators send, so most launch-time correctness lives here and is
 * reachable without touching a real ad account.
 *
 * These run in a node environment with no `window`. That is fine and deliberate:
 * `loadCountryGroups`/`loadAssets` both guard on `typeof window === "undefined"` and
 * return empty, so a `countryGroupId` cannot resolve here — which means these tests
 * exercise the SNAPSHOT fallback path. That is the more valuable half anyway: the
 * snapshot fields were once write-only, so deleting a Worldwide country group left every
 * linked Meta preset targeting nobody.
 *
 * NOT covered here (needs the orchestrators, which perform real uploads and POSTs):
 * channel assignment and `{{channel.id}}` resolution, media upload, and the Snapchat
 * batch-response matching.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────────
// Minimal objects with only the fields these functions read. Cast rather than restate
// the full types, so an unrelated type change doesn't break these tests.

function provider(over: Partial<{ divisor: number; pageId: string; name: string }> = {}): FeedProvider {
  return {
    id: "prov-1",
    name: over.name ?? "Predicto",
    domains: [{ id: "d1", baseDomain: "example.com", baseUrl: "https://example.com", trafficSources: ["Snap", "Meta"] }],
    snapConfig: { allowedAdAccountIds: ["snap-1"], allowedPixelIds: [], urlConfig: { baseUrl: "", parameters: [] } },
    metaConfig: {
      allowedAdAccountIds: ["act_1"],
      allowedPixelIds: [],
      allowedPageIds: [over.pageId ?? "page-1"],
      pageId: over.pageId ?? "page-1",
      roasDisplayDivisor: over.divisor ?? 100,
      urlConfig: { baseUrl: "", parameters: [] },
    },
  } as unknown as FeedProvider;
}

const article = {
  id: "art-1",
  feedProviderId: "prov-1",
  slug: "application-security",
  query: "security",
  domain: "example.com",
  allowedHeadlines: [{ text: "Headline", rac: "rac1", metaHeadline: "Meta Headline", metaPrimaryText: "Meta Body" }],
  trafficSources: ["Snap", "Meta"],
  createdAt: "2026-01-01",
} as unknown as Article;

const asset = {
  id: "asset-1",
  originalFileName: "v1.mp4",
  originalUrl: "https://blob.example/v1.mp4",
  optimizedUrl: "https://blob.example/v1-h264.mp4",
  mediaType: "VIDEO",
  vname: "V1",
  snapchatUploads: [],
  metaUploads: [],
} as unknown as SiloAsset;

const item = {
  feedProviderId: "prov-1",
  articleId: "art-1",
  presetId: "preset-1",
  adAccountId: "act_1",
  creativeIds: ["asset-1"],
  headline: "Headline",
  headlineRac: "rac1",
  metaHeadline: "Meta Headline",
  metaPrimaryText: "Meta Body",
  duplicationIndex: 0,
} as unknown as CampaignBuildItem;

function metaPreset(over: Partial<{
  roasFloor: number; bidStrategy: string; dailyBudgetCents: number;
  geoIsWorldwide: boolean; geoCountryCodes: string[]; geoExcludedCountryCodes: string[];
  adStatus: "ACTIVE" | "PAUSED";
}> = {}): CampaignPreset {
  return {
    id: "preset-1",
    name: "WW",
    trafficSource: "facebook",
    feedProviderId: "prov-1",
    adSquads: [],
    campaign: { objective: "OUTCOME_SALES", status: "ACTIVE", spendCapType: "NO_BUDGET" },
    creativeDefaults: over.adStatus ? { adStatus: over.adStatus } : undefined,
    metaAdSet: {
      // Matches both live presets. Note synthesis passes this straight through with no
      // fallback (`status: metaAdSet.status`), unlike creativeDefaults.adStatus which
      // defaults to PAUSED — a preset missing it would send undefined and now be rejected
      // by the adsets route schema rather than confusing Meta.
      status: "ACTIVE",
      billingEvent: "IMPRESSIONS",
      optimizationGoal: "VALUE",
      bidStrategy: over.bidStrategy ?? "LOWEST_COST_WITH_MIN_ROAS",
      roasFloor: over.roasFloor ?? 0.9,
      dailyBudgetCents: over.dailyBudgetCents ?? 1000,
      geoCountryCodes: over.geoCountryCodes ?? ["US"],
      geoIsWorldwide: over.geoIsWorldwide ?? false,
      geoExcludedCountryCodes: over.geoExcludedCountryCodes ?? [],
    },
  } as unknown as CampaignPreset;
}

function snapPreset(over: Partial<{ isCatalogue: boolean; catalogId: string; productSetId: string }> = {}): CampaignPreset {
  return {
    id: "preset-2",
    name: "US",
    trafficSource: "snap",
    feedProviderId: "prov-1",
    isCatalogue: over.isCatalogue ?? false,
    campaign: { objective: "SALES", status: "ACTIVE", spendCapType: "NO_BUDGET" },
    adSquads: [{
      optimizationGoal: "PIXEL_PURCHASE",
      bidStrategy: "TARGET_COST",
      bidAmountUsd: 0.75,
      dailyBudgetUsd: 10,
      spendCapType: "DAILY_BUDGET",
      geoCountryCodes: ["US"],
      catalogId: over.catalogId,
      productSetId: over.productSetId,
    }],
  } as unknown as CampaignPreset;
}

const synthMeta = (p: CampaignPreset, prov = provider()) =>
  synthesizeMetaCampaign(item, "WW | Test | 0804", prov, article, p, [asset]);

// ── The money chain, end to end ────────────────────────────────────────────────

describe("ROAS floor: preset -> synthesis -> provider divisor -> Meta payload", () => {
  // Synthesis must NOT apply the divisor. A preset's roasFloor is a TRUE ratio and is
  // provider-independent; binding it to one provider's scale here is exactly the bug that
  // produced 9 mis-scaled live ad sets.
  it("carries roasFloor through synthesis unscaled and provider-independent", () => {
    expect(synthMeta(metaPreset({ roasFloor: 0.9 }), provider({ divisor: 100 })).adSet.roasFloor).toBe(0.9);
    expect(synthMeta(metaPreset({ roasFloor: 0.9 }), provider({ divisor: 1 })).adSet.roasFloor).toBe(0.9);
  });

  // The full chain the orchestrator performs, composed here so the end-to-end money
  // figure is asserted somewhere. Verified against the live accounts on 2026-08-03.
  it("produces 900000 at Predicto (divisor 100) and 9000 at Vizymo (divisor 1)", () => {
    for (const [divisor, expected] of [[100, 900_000], [1, 9_000]] as const) {
      const s = synthMeta(metaPreset({ roasFloor: 0.9 }), provider({ divisor }));
      const floor = toRoasAverageFloorForProvider(s.adSet.roasFloor!, divisor);
      expect(floor).toBe(expected);

      // …and the value survives the route schema that would otherwise strip or reject it.
      const parsed = adSetPostSchema.parse({
        adAccountId: "act_1",
        adSet: {
          campaign_id: "1", name: s.adSet.name, status: s.adSet.status,
          billing_event: s.adSet.billingEvent, optimization_goal: s.adSet.optimizationGoal,
          targeting: {}, bid_strategy: "LOWEST_COST_WITH_MIN_ROAS",
          bid_constraints: { roas_average_floor: floor },
          daily_budget: s.adSet.dailyBudgetCents,
        },
      }) as { adSet: { bid_constraints: { roas_average_floor: number } } };
      expect(parsed.adSet.bid_constraints.roas_average_floor).toBe(expected);
    }
  });

  // The legacy hand-scaled preset (still live as the second "WW") must land on the same
  // number, not 90 x 100 x 10000.
  it("normalises the legacy pre-scaled preset to the same floor", () => {
    const legacy = synthMeta(metaPreset({ roasFloor: 90 }), provider({ divisor: 100 }));
    expect(toRoasAverageFloorForProvider(legacy.adSet.roasFloor!, 100)).toBe(900_000);
  });

  it("passes the daily budget through in cents", () => {
    expect(synthMeta(metaPreset({ dailyBudgetCents: 2015 })).adSet.dailyBudgetCents).toBe(2015);
  });
});

// ── Geo targeting ──────────────────────────────────────────────────────────────

describe("Meta geo targeting", () => {
  // Worldwide necessarily reaches Taiwan and Singapore, which Meta rejects without a
  // regional declaration (error_subcode 3858498/3858550), and Thailand, which fails on
  // age restrictions alongside manual publisher_platforms (1870249). All three are
  // auto-excluded instead of declared.
  it("auto-excludes TH, SG and TW when Worldwide", () => {
    const s = synthMeta(metaPreset({ geoIsWorldwide: true, geoCountryCodes: [] }));
    expect(s.adSet.geoIsWorldwide).toBe(true);
    for (const c of ["TH", "SG", "TW"]) expect(s.adSet.geoExcludedCountryCodes).toContain(c);
  });

  it("merges the auto-exclusions with the preset's own", () => {
    const s = synthMeta(metaPreset({ geoIsWorldwide: true, geoExcludedCountryCodes: ["FR"] }));
    for (const c of ["TH", "SG", "TW", "FR"]) expect(s.adSet.geoExcludedCountryCodes).toContain(c);
  });

  it("does not auto-exclude anything for a normal country list", () => {
    const s = synthMeta(metaPreset({ geoCountryCodes: ["US", "GB"], geoIsWorldwide: false }));
    expect(s.adSet.geoIsWorldwide).toBe(false);
    expect(s.adSet.geoExcludedCountryCodes).toEqual([]);
    expect(s.adSet.geoCountryCodes).toEqual(["US", "GB"]);
  });

  // The write-only bug: resolveMetaGeoTargeting used to hard-code isWorldwide: false on
  // the no-linked-group path, so `geoIsWorldwide` was written by unlinkPresetsFromGroup
  // and never read back — a deleted Worldwide group left the preset targeting nobody.
  it("READS the geoIsWorldwide snapshot when no country group is linked", () => {
    const s = synthMeta(metaPreset({ geoIsWorldwide: true, geoCountryCodes: [] }));
    expect(s.adSet.geoIsWorldwide).toBe(true); // not silently false
  });
});

// ── Guards and defaults ────────────────────────────────────────────────────────

describe("Meta synthesis guards", () => {
  it("throws when the preset has no Meta ad set", () => {
    const p = metaPreset();
    delete (p as unknown as { metaAdSet?: unknown }).metaAdSet;
    expect(() => synthMeta(p)).toThrow(/no Meta ad set/i);
  });

  it("throws when the provider has no Facebook Page", () => {
    const noPage = provider();
    (noPage.metaConfig as unknown as Record<string, unknown>).pageId = undefined;
    (noPage.metaConfig as unknown as Record<string, unknown>).allowedPageIds = [];
    expect(() => synthMeta(metaPreset(), noPage)).toThrow(/Facebook Page/i);
  });

  it("prefers the page resolved at launch over the provider's stored one", () => {
    const s = synthesizeMetaCampaign(item, "n", provider({ pageId: "stored" }), article, metaPreset(), [asset], "resolved");
    expect(s.creatives[0]?.pageId).toBe("resolved");
  });
});

describe("ad status defaults to PAUSED on both platforms", () => {
  // This is why a test launch costs nothing: the campaign and ad set are created ACTIVE
  // but the ads are PAUSED, so nothing delivers.
  it("defaults Meta creatives to PAUSED", () => {
    expect(synthMeta(metaPreset()).creatives[0]?.adStatus).toBe("PAUSED");
  });

  it("defaults Snap creatives to PAUSED", () => {
    const s = synthesizeCampaign(item, "US | Test", provider(), article, snapPreset(), [asset]);
    expect(s.creatives[0]?.adStatus).toBe("PAUSED");
  });

  it("honours an explicit ACTIVE ad status", () => {
    expect(synthMeta(metaPreset({ adStatus: "ACTIVE" })).creatives[0]?.adStatus).toBe("ACTIVE");
  });

  // The combination that makes a live test launch cost nothing, and the reason the
  // 2026-08-04 Next 16 verification was safe to run against a funded account: the ad set
  // is ACTIVE (as both live presets have it) while the ad underneath is PAUSED, so the
  // entities exist but nothing delivers. If this ever inverts, a "free" test launch spends.
  it("creates an ACTIVE ad set with a PAUSED ad, so nothing delivers", () => {
    const s = synthMeta(metaPreset());
    expect(s.adSet.status).toBe("ACTIVE");
    expect(s.creatives[0]?.adStatus).toBe("PAUSED");
  });
});

// ── Snapchat path ──────────────────────────────────────────────────────────────

describe("Snap synthesis", () => {
  it("synthesizes one campaign, one ad squad and one creative per asset", () => {
    const s = synthesizeCampaign(item, "US | Test", provider(), article, snapPreset(), [asset]);
    expect(s.campaigns).toHaveLength(1);
    expect(s.adSquads).toHaveLength(1);
    expect(s.creatives).toHaveLength(1);
  });

  it("uses the transcoded H.264 URL when present, since Snapchat rejects other codecs", () => {
    const s = synthesizeCampaign(item, "US | Test", provider(), article, snapPreset(), [asset]);
    expect(s.creatives[0]?.siloAssetBlobUrl).toBe("https://blob.example/v1-h264.mp4");
  });

  // Catalogue ads need both ids: a missing product_set_id fails with E2840 at the squad,
  // and a missing catalog_id with E2973 — both AFTER the campaign already exists.
  // Failing at synthesis instead means nothing is created.
  it("throws before creating anything when a catalogue preset lacks its ids", () => {
    expect(() => synthesizeCampaign(item, "n", provider(), article, snapPreset({ isCatalogue: true }), [asset]))
      .toThrow(/Product Set ID/i);
    expect(() => synthesizeCampaign(item, "n", provider(), article, snapPreset({ isCatalogue: true, productSetId: "ps1" }), [asset]))
      .toThrow(/Catalog ID/i);
  });

  it("accepts a fully configured catalogue preset and puts catalogId on the campaign", () => {
    const s = synthesizeCampaign(
      item, "n", provider(), article,
      snapPreset({ isCatalogue: true, catalogId: "cat1", productSetId: "ps1" }),
      [asset]
    );
    expect(s.campaigns[0]?.catalogId).toBe("cat1");
  });

  it("throws when the preset has no ad squad template", () => {
    const p = snapPreset();
    (p as unknown as { adSquads: unknown[] }).adSquads = [];
    expect(() => synthesizeCampaign(item, "n", provider(), article, p, [asset])).toThrow(/ad squad template/i);
  });
});

// ── Page selection ─────────────────────────────────────────────────────────────

describe("pickBestPage", () => {
  it("picks the page with the most ads remaining", () => {
    expect(pickBestPage(["a", "b", "c"], { a: 200, b: 10, c: 100 })).toBe("b");
  });

  it("treats an unseen page as 0 running, i.e. the most remaining", () => {
    expect(pickBestPage(["a", "b"], { a: 50 })).toBe("b");
  });

  it("resolves ties to the earliest page in the list", () => {
    expect(pickBestPage(["a", "b"], { a: 10, b: 10 })).toBe("a");
  });

  it("returns undefined when no pages are assigned", () => {
    expect(pickBestPage([], { a: 1 })).toBeUndefined();
  });
});
