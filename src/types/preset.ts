import type { CampaignObjective, BidStrategy, OptimizationGoal } from "./snapchat";
import type { MetaOptimizationGoal, MetaBillingEvent, MetaPixelEvent, MetaBidStrategy } from "./meta";

export interface CampaignPresetData {
  objective: CampaignObjective;
  status: "ACTIVE" | "PAUSED";
  startDate?: string; // YYYY-MM-DD; undefined = launch immediately
  endDate?: string;
  spendCapType: "DAILY_BUDGET" | "NO_BUDGET";
  dailyBudgetUsd?: number;
  lifetimeBudgetUsd?: number;
}

export interface AdSquadPresetData {
  type: "SNAP_ADS";
  geoCountryCodes: string[];
  optimizationGoal: OptimizationGoal;
  bidStrategy: BidStrategy;
  bidAmountUsd?: number;
  spendCapType: "DAILY_BUDGET" | "LIFETIME_BUDGET";
  dailyBudgetUsd?: number;
  lifetimeBudgetUsd?: number;
  status: "ACTIVE" | "PAUSED";
  startDate?: string;
  endDate?: string;
  // Smart placement opt-in. When true, the squad is created with placement_v2 { config: AUTOMATIC }
  // (Snapchat auto-optimizes placements) — BUT Snapchat then locks the squad against API edits (E2025),
  // so budget/bid/status must be managed in Snapchat Ads Manager. Default (false/undefined) = omit
  // placement_v2 → Snapchat default placement, fully editable in-app. Replaces the old dead
  // placementConfig field ("CONTENT" was rejected by the API with E39400).
  smartPlacement?: boolean;
  targetingGender?: "ALL" | "MALE" | "FEMALE";
  targetingDeviceType?: "WEB" | "MOBILE" | "ALL";
  targetingOsType?: "iOS" | "ANDROID";
  minAge?: string;
  maxAge?: string;
  pixelId?: string;
  // Catalogue (Dynamic Collection Ads) fields
  catalogId?: string;       // campaign-level catalogue ID
  productSetId?: string;    // product set within the catalogue (squad + creative)
  dynamicTemplateId?: string; // optional creative template; Snapchat default if absent
}

export interface MetaAdSetPresetData {
  geoCountryCodes: string[];
  optimizationGoal: MetaOptimizationGoal;
  billingEvent: MetaBillingEvent;
  bidStrategy?: MetaBidStrategy; // default LOWEST_COST_WITHOUT_CAP when absent
  bidAmountCents?: number;       // Cost Cap target — only used when bidStrategy === "COST_CAP"
  roasFloor?: number;            // ROAS floor ratio (e.g. 4 = 400%), NOT cents — only used when bidStrategy === "LOWEST_COST_WITH_MIN_ROAS"
  dailyBudgetCents: number;
  status: "ACTIVE" | "PAUSED";
  pixelId?: string;
  pixelEvent?: MetaPixelEvent;
  targetingGender?: "ALL" | "MALE" | "FEMALE";
  minAge?: number;
  maxAge?: number;
  publisherPlatforms?: ("facebook" | "instagram" | "audience_network")[];
  startDate?: string;
  endDate?: string;
}

export interface CreativePresetDefaults {
  adStatus: "ACTIVE" | "PAUSED";
  brandName?: string;
  callToAction?: string;
}

export interface CampaignPreset {
  id: string;
  name: string;
  tag?: string; // resolves {{preset.tag}} in campaign naming templates
  trafficSource?: "snap" | "facebook";
  feedProviderId: string; // required — preset belongs to one provider ("" for legacy presets)
  countryGroupId?: string; // when set, geo targeting is resolved live from this Country Group at
                           // every campaign build (see resolveGeoCountryCodes in synthesize-campaign.ts);
                           // geoCountryCodes on adSquads[0]/metaAdSet still holds the last-resolved
                           // snapshot for display + fallback if the group is deleted
  createdAt: string; // ISO timestamp
  isCatalogue?: boolean; // true = Dynamic Product Ads (no Silo media, uses product feed)
  campaign: CampaignPresetData;
  adSquads: AdSquadPresetData[];
  metaAdSet?: MetaAdSetPresetData;
  creativeDefaults?: CreativePresetDefaults;
}
