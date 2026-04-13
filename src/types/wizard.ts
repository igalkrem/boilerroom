import type { CampaignObjective, BidStrategy, OptimizationGoal } from "./snapchat";

export type FrequencyCapTimePeriod =
  | "HOURS_1"
  | "HOURS_6"
  | "HOURS_12"
  | "DAY_1"
  | "DAY_7"
  | "MONTH_1";

// ─── Form data shapes (filled by wizard steps) ───────────────────────────────

export interface CampaignFormData {
  id: string; // client-side UUID for linking ad sets
  name: string;
  objective: CampaignObjective;
  status: "ACTIVE" | "PAUSED";
  startDate: string; // YYYY-MM-DD
  endDate?: string;
  spendCapType: "DAILY_BUDGET" | "LIFETIME_BUDGET";
  dailyBudgetUsd?: number;
  lifetimeBudgetUsd?: number;
}

export interface AdSquadFormData {
  id: string; // client-side UUID
  campaignId: string; // references CampaignFormData.id
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
  // Ad-set-level scheduling
  startDate?: string;
  endDate?: string;
  // Delivery
  pacingType: "STANDARD" | "ACCELERATED";
  placementConfig: "AUTOMATIC" | "CONTENT";
  // Frequency cap
  frequencyCapMaxImpressions?: number;
  frequencyCapTimePeriod?: FrequencyCapTimePeriod;
  // Targeting
  targetingAgeMin?: number;
  targetingAgeMax?: number;
  targetingGender?: "ALL" | "MALE" | "FEMALE";
  targetingDeviceType?: "WEB" | "MOBILE" | "ALL";
}

export type InteractionType =
  | "SWIPE_TO_OPEN"
  | "WEB_VIEW"
  | "DEEP_LINK"
  | "APP_INSTALL";

export interface CreativeFormData {
  id: string; // client-side UUID
  adSquadId: string; // references AdSquadFormData.id
  name: string;
  headline: string; // max 34 chars
  brandName?: string;
  callToAction?: string;
  mediaId?: string; // resolved after upload
  mediaFileName?: string;
  mediaPreviewUrl?: string;
  uploadStatus: "idle" | "uploading" | "done" | "error";
  // Interaction
  interactionType: InteractionType;
  webViewUrl?: string;
  deepLinkUrl?: string;
  shareable?: boolean;
  // Ad settings
  adStatus: "ACTIVE" | "PAUSED";
}

// ─── Submission results ────────────────────────────────────────────────────

export interface CreatedCampaign {
  clientId: string;
  snapId: string;
  name: string;
}

export interface CreatedAdSquad {
  clientId: string;
  snapId: string;
  name: string;
}

export interface CreatedCreative {
  clientId: string;
  snapId: string;
  name: string;
}

export interface CreatedAd {
  clientId: string;
  snapId: string;
  name: string;
}

export interface SubmissionResults {
  campaigns: Array<CreatedCampaign & { error?: string }>;
  adSquads: Array<CreatedAdSquad & { error?: string }>;
  creatives: Array<CreatedCreative & { error?: string }>;
  ads: Array<CreatedAd & { error?: string }>;
}

export type SubmissionStatus = "idle" | "running" | "done" | "error";

export type SubmissionStage =
  | "campaigns"
  | "adSquads"
  | "creatives"
  | "ads"
  | "done";
