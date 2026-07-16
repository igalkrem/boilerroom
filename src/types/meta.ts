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

// Confirmed against a live ad set (bid_strategy "ROAS goal" resolved to this
// enum's LOWEST_COST_WITH_MIN_ROAS) and a Meta tool's create-campaign schema.
// LOWEST_COST_WITH_BID_CAP (manual bid cap) exists on Meta's side but isn't
// offered in this app — only Cost Cap and Min ROAS goals are exposed.
export type MetaBidStrategy = "LOWEST_COST_WITHOUT_CAP" | "COST_CAP" | "LOWEST_COST_WITH_MIN_ROAS";

// ─── Campaigns ──────────────────────────────────────────────────────────────

export interface MetaCampaignPayload {
  name: string;
  status: MetaCampaignStatus;
  objective: MetaCampaignObjective;
  special_ad_categories: string[]; // empty array for standard campaigns
  // Required by Meta (confirmed live 2026-07-15, error_subcode 4834011) whenever
  // the campaign has no daily_budget/lifetime_budget of its own (i.e. ABO —
  // budget lives on the ad set). false = don't share budget across ad sets.
  is_adset_budget_sharing_enabled?: boolean;
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

export interface MetaBidConstraints {
  // ROAS floor * 10000 (e.g. a 0.9/90% floor -> 9000). Confirmed live 2026-07-15
  // via GET /api/meta/adsets against the reference "boiler" ad set (fields=
  // bid_constraints), which showed exactly {"roas_average_floor":9000} for a
  // 0.9 ROAS goal. bid_amount is NOT used for LOWEST_COST_WITH_MIN_ROAS at all
  // — two earlier attempts sending it there (at *1000 and *10000 scale) both
  // failed with "Bid Strategy Doesn't Support Value Optimization".
  roas_average_floor: number;
}

export interface MetaAttributionSpecEntry {
  event_type: "CLICK_THROUGH" | "VIEW_THROUGH" | "ENGAGED_VIDEO_VIEW";
  window_days: number;
}

export interface MetaAdSetPayload {
  campaign_id: string;
  name: string;
  status: MetaCampaignStatus;
  targeting: MetaTargeting;
  billing_event: MetaBillingEvent;
  optimization_goal: MetaOptimizationGoal;
  bid_strategy?: MetaBidStrategy; // omitted → Meta defaults to LOWEST_COST_WITHOUT_CAP
  bid_amount?: number; // cents — only used when bid_strategy is COST_CAP
  bid_constraints?: MetaBidConstraints; // ROAS floor — only used when bid_strategy is LOWEST_COST_WITH_MIN_ROAS
  attribution_spec?: MetaAttributionSpecEntry[]; // always forced to 1-day click, see orchestrator
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
  image_hash?: string; // thumbnail — one of image_hash/image_url is required
  image_url?: string; // thumbnail via URL — Meta's auto-generated video thumbnail (see getVideoThumbnailUrl)
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
  instagram_actor_id?: string; // page-backed Instagram identity — see getOrCreatePageBackedInstagramAccount
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

// `processing_phase` is NOT a valid field on the Ad Video node — confirmed live
// 2026-07-14: "(#100) Tried accessing nonexisting field (processing_phase)".
// The video's processing state is exposed via `status.video_status`.
export interface MetaVideoStatus {
  status?: { video_status?: string };
}

// ─── Insights (stats) ───────────────────────────────────────────────────────

export interface MetaInsightsRow {
  date_start: string;
  date_stop: string;
  impressions: string; // Graph API returns string numbers
  clicks: string;
  spend: string; // in account currency, decimal string
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  adset_id?: string; // present when level=adset
  adset_name?: string;
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
