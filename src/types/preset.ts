import type { CampaignObjective, BidStrategy, OptimizationGoal } from "./snapchat";
import type { FrequencyCapTimePeriod } from "./wizard";

export interface CampaignPresetData {
  name: string;
  objective: CampaignObjective;
  status: "ACTIVE" | "PAUSED";
  startDate: string; // YYYY-MM-DD
  endDate?: string;
  spendCapType: "DAILY_BUDGET" | "LIFETIME_BUDGET";
  dailyBudgetUsd?: number;
  lifetimeBudgetUsd?: number;
}

export interface AdSquadPresetData {
  name: string;
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
}

export interface CampaignPreset {
  id: string;
  name: string;
  createdAt: string; // ISO timestamp
  campaign: CampaignPresetData;
  adSquads: AdSquadPresetData[];
}
