import type { CampaignObjective, BidStrategy, OptimizationGoal } from "./snapchat";

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
  placementConfig: "AUTOMATIC" | "CONTENT";
  targetingGender?: "ALL" | "MALE" | "FEMALE";
  targetingDeviceType?: "WEB" | "MOBILE" | "ALL";
  targetingOsType?: "iOS" | "ANDROID";
  pixelId?: string;
}

export interface CreativePresetDefaults {
  adStatus: "ACTIVE" | "PAUSED";
  brandName?: string;
  callToAction?: string;
}

export interface CampaignPreset {
  id: string;
  name: string;
  trafficSource?: "snap" | "facebook";
  feedProviderId: string; // required — preset belongs to one provider ("" for legacy presets)
  comboId?: string; // optional: references a FeedProviderCombo.id from the provider
  createdAt: string; // ISO timestamp
  campaign: CampaignPresetData;
  adSquads: AdSquadPresetData[];
  creativeDefaults?: CreativePresetDefaults;
}
