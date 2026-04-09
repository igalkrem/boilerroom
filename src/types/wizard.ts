import type { CampaignObjective, BidStrategy, OptimizationGoal } from "./snapchat";

// ─── Form data shapes (filled by wizard steps) ───────────────────────────────

export interface CampaignFormData {
  id: string; // client-side UUID for linking ad sets
  name: string;
  objective: CampaignObjective;
  status: "ACTIVE" | "PAUSED";
  startDate: string; // YYYY-MM-DD
  endDate?: string;
  dailyBudgetUsd: number;
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
  dailyBudgetUsd: number;
  status: "ACTIVE" | "PAUSED";
}

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
