import type { CampaignObjective, BidStrategy, OptimizationGoal } from "./snapchat";
import type { FrequencyCapTimePeriod } from "./wizard";

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
  geoCountryCode: string;
  optimizationGoal: OptimizationGoal;
  bidStrategy: BidStrategy;
  bidAmountUsd?: number;
  spendCapType: "DAILY_BUDGET" | "LIFETIME_BUDGET";
  dailyBudgetUsd?: number;
  lifetimeBudgetUsd?: number;
  status: "ACTIVE" | "PAUSED";
  startDate?: string;
  endDate?: string;
  pacingType: "STANDARD" | "ACCELERATED";
  placementConfig: "AUTOMATIC" | "CONTENT";
  frequencyCapMaxImpressions?: number;
  frequencyCapTimePeriod?: FrequencyCapTimePeriod;
  targetingAgeMin?: number;
  targetingAgeMax?: number;
  targetingGender?: "ALL" | "MALE" | "FEMALE";
  targetingDeviceType?: "WEB" | "MOBILE" | "ALL";
  pixelId?: string;
  pixelConversionEvent?: string;
}

export interface CampaignPreset {
  id: string;
  name: string;
  createdAt: string; // ISO timestamp
  campaign: CampaignPresetData;
  adSquads: AdSquadPresetData[];
}
