// ─── Meta Graph API v19.0 — Type definitions ───────────────────────────────

// ─── Enums ──────────────────────────────────────────────────────────────────

export type MetaCampaignObjective = "OUTCOME_SALES";

export type MetaBillingEvent = "IMPRESSIONS" | "LINK_CLICKS";

export type MetaOptimizationGoal =
  | "OFFSITE_CONVERSIONS"
  | "LINK_CLICKS"
  | "IMPRESSIONS"
  | "LANDING_PAGE_VIEWS"
  | "REACH"
  | "VALUE";

export type MetaPixelEvent =
  | "PURCHASE"
  | "ADD_TO_CART"
  | "INITIATED_CHECKOUT"
  | "VIEW_CONTENT"
  | "LEAD"
  | "COMPLETE_REGISTRATION"
  | "SEARCH"
  | "ADD_PAYMENT_INFO"
  | "ADD_TO_WISHLIST";

export type MetaCampaignStatus = "ACTIVE" | "PAUSED";

// ─── Campaigns ──────────────────────────────────────────────────────────────

export interface MetaCampaignPayload {
  name: string;
  status: MetaCampaignStatus;
  objective: MetaCampaignObjective;
  special_ad_categories: string[]; // empty array for standard campaigns
  daily_budget?: number; // in cents — $20 = 2000
  lifetime_budget?: number;
}

export interface MetaCampaign extends MetaCampaignPayload {
  id: string;
  account_id: string;
}

// ─── Ad Sets ────────────────────────────────────────────────────────────────

export interface MetaTargeting {
  geo_locations: { countries: string[] };
  age_min?: number; // 13–65
  age_max?: number;
  genders?: number[]; // 1 = male, 2 = female; omit for all
  publisher_platforms?: ("facebook" | "instagram" | "audience_network")[];
}

export interface MetaPromotedObject {
  pixel_id: string;
  custom_event_type: MetaPixelEvent;
}

export interface MetaAdSetPayload {
  campaign_id: string;
  name: string;
  status: MetaCampaignStatus;
  targeting: MetaTargeting;
  billing_event: MetaBillingEvent;
  optimization_goal: MetaOptimizationGoal;
  bid_amount?: number; // cents
  daily_budget?: number; // cents
  lifetime_budget?: number;
  promoted_object?: MetaPromotedObject;
  start_time?: string; // ISO 8601
  end_time?: string;
}

export interface MetaAdSet extends MetaAdSetPayload {
  id: string;
  account_id: string;
}

// ─── Ad Creatives ───────────────────────────────────────────────────────────

export interface MetaCallToAction {
  type: string; // e.g. "LEARN_MORE", "SHOP_NOW", "SIGN_UP"
  value?: { link?: string };
}

export interface MetaLinkData {
  link: string;
  message?: string;
  image_hash: string;
  name?: string; // headline
  call_to_action?: MetaCallToAction;
}

export interface MetaVideoData {
  video_id: string;
  image_hash: string; // thumbnail
  title?: string;
  message?: string;
  call_to_action?: MetaCallToAction;
}

export interface MetaObjectStorySpec {
  page_id: string;
  link_data?: MetaLinkData;
  video_data?: MetaVideoData;
}

export interface MetaAdCreativePayload {
  name: string;
  object_story_spec: MetaObjectStorySpec;
}

export interface MetaAdCreative extends MetaAdCreativePayload {
  id: string;
  account_id?: string;
}

// ─── Ads ────────────────────────────────────────────────────────────────────

export interface MetaAdPayload {
  name: string;
  adset_id: string;
  creative: { creative_id: string };
  status: MetaCampaignStatus;
}

export interface MetaAd extends MetaAdPayload {
  id: string;
  account_id?: string;
}

// ─── Media uploads ──────────────────────────────────────────────────────────

export interface MetaAdImageResponse {
  images: Record<string, { hash: string; url: string }>;
}

export interface MetaAdVideoResponse {
  id: string;
}

export interface MetaVideoStatus {
  video_id: string;
  processing_phase: string; // "complete" when ready
}

// ─── Insights (stats) ───────────────────────────────────────────────────────

export interface MetaInsightsRow {
  date_start: string;
  date_stop: string;
  impressions: string; // Graph API returns string numbers
  clicks: string;
  spend: string; // in account currency, decimal string
  actions?: Array<{ action_type: string; value: string }>;
}

// ─── API error shape ────────────────────────────────────────────────────────

export interface MetaApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

// ─── Ad Accounts ────────────────────────────────────────────────────────────

export interface MetaAdAccount {
  id: string; // "act_123456"
  account_id: string; // "123456"
  name: string;
  account_status: number; // 1 = ACTIVE
  currency: string;
  timezone_name: string;
  business?: { id: string; name: string };
}
