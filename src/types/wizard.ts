import type { CampaignObjective, BidStrategy, OptimizationGoal } from "./snapchat";

// ─── Form data shapes (filled by wizard steps) ───────────────────────────────

export interface CampaignFormData {
  id: string; // client-side UUID for linking ad sets
  name: string;
  objective: CampaignObjective;
  status: "ACTIVE" | "PAUSED";
  startDate: string; // YYYY-MM-DD
  endDate?: string;
  spendCapType: "DAILY_BUDGET" | "NO_BUDGET";
  dailyBudgetUsd?: number;
  lifetimeBudgetUsd?: number;
}

export interface AdSquadFormData {
  id: string; // client-side UUID
  campaignId: string; // references CampaignFormData.id
  name: string;
  type: "SNAP_ADS";
  geoCountryCodes: string[];
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
  placementConfig: "AUTOMATIC" | "CONTENT";
  // Targeting
  targetingGender?: "ALL" | "MALE" | "FEMALE";
  targetingDeviceType?: "WEB" | "MOBILE" | "ALL";
  targetingOsType?: "iOS" | "ANDROID";
  // Tracking
  pixelId?: string;
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
  mediaId?: string; // resolved at submission time by uploadMedia stage
  mediaFile?: File; // transcoded/resized file stored in Step 3, uploaded in Step 4
  mediaFileName?: string;
  mediaPreviewUrl?: string;
  uploadStatus: "idle" | "uploading" | "done" | "error";
  siloAssetId?: string; // set when media was selected from Silo library
  // Set when Silo asset has no cached mediaId — orchestrator calls uploadBlobToSnapchat at submission
  siloAssetBlobUrl?: string;
  siloAssetMediaType?: "VIDEO" | "IMAGE";
  siloAssetOriginalFileName?: string;
  // Interaction
  interactionType: InteractionType;
  webViewUrl?: string;
  deepLinkUrl?: string;
  articleId?: string; // references Article.id; drives URL auto-fill + headline constraint in Step 3
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
  uploadMedia: Array<{ clientId: string; snapId: string; name: string; error?: string }>;
  campaigns: Array<CreatedCampaign & { error?: string }>;
  adSquads: Array<CreatedAdSquad & { error?: string }>;
  creatives: Array<CreatedCreative & { error?: string }>;
  ads: Array<CreatedAd & { error?: string }>;
}

export type SubmissionStatus = "idle" | "running" | "done" | "error";

export type SubmissionStage =
  | "uploadMedia"
  | "campaigns"
  | "adSquads"
  | "creatives"
  | "ads"
  | "done";

// ─── Canvas store types ────────────────────────────────────────────────────

export interface CreativeGroup {
  id: string;
  creativeIds: string[]; // max 5
}

export interface CanvasEdges {
  groupToProvider: Array<{ groupId: string; feedProviderId: string }>;
  providerToArticle: Array<{
    feedProviderId: string;
    articleId: string;
    headline: string;
    headlineRac: string;
    callToAction: string;
  }>;
  articleToPreset: Array<{
    articleId: string;
    presetId: string;
    duplications: number;
  }>;
  articleToAdAccount: Array<{ articleId: string; adAccountId: string }>;
}

export interface CampaignBuildItem {
  adAccountId: string;
  creativeIds: string[];
  feedProviderId: string;
  articleId: string;
  presetId: string;
  duplicationIndex: number; // 0-based within the duplication count
  headline: string;
  headlineRac: string;
  callToAction: string;
}
