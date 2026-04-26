// ─── OAuth ──────────────────────────────────────────────────────────────────

export interface SnapTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

// ─── Ad Accounts ────────────────────────────────────────────────────────────

export interface SnapAdAccount {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  currency: string;
  timezone: string;
  organization_id: string;
}

export interface SnapAdAccountsResponse {
  adaccounts: Array<{ adaccount: SnapAdAccount }>;
}

// ─── Campaigns ──────────────────────────────────────────────────────────────

export type CampaignObjective = "SALES";

export interface SnapCampaignPayload {
  name: string;
  ad_account_id: string;
  status: "ACTIVE" | "PAUSED";
  buy_model: "AUCTION" | "RESERVED";
  start_time: string; // ISO 8601
  end_time?: string;
  daily_budget_micro?: number;
  objective_v2_properties?: {
    objective_v2_type: CampaignObjective;
  };
}

export interface SnapCampaign extends SnapCampaignPayload {
  id: string;
}

// ─── Ad Squads ───────────────────────────────────────────────────────────────

export type BidStrategy =
  | "AUTO_BID"
  | "LOWEST_COST_WITH_MAX_BID"
  | "TARGET_COST";

export type PixelConversionEvent =
  | "PAGE_VIEW"
  | "PURCHASE"
  | "ADD_TO_CART"
  | "VIEW_CONTENT"
  | "SUBSCRIBE"
  | "SIGN_UP"
  | "SAVE"
  | "SEARCH"
  | "START_CHECKOUT"
  | "AD_CLICK";

export type OptimizationGoal =
  | "PIXEL_PURCHASE"
  | "PIXEL_SIGNUP"
  | "PIXEL_ADD_TO_CART"
  | "PIXEL_PAGE_VIEW"
  | "LANDING_PAGE_VIEW";

export interface SnapAdSquadPayload {
  campaign_id: string;
  name: string;
  type: "SNAP_ADS" | "LENS" | "FILTER";
  status: "ACTIVE" | "PAUSED";
  targeting: {
    geos: Array<{ country_code: string }>;
    demographics?: Array<{
      min_age?: number;
      max_age?: number;
      genders?: Array<"MALE" | "FEMALE">;
    }>;
    devices?: Array<{
      device_type?: "MOBILE" | "WEB";
      os_type?: string;
    }>;
  };
  placement_v2: {
    config: "AUTOMATIC" | "CONTENT" | "CUSTOM";
  };
  delivery_constraint: "DAILY_BUDGET" | "LIFETIME_BUDGET" | "REACH_AND_FREQUENCY";
  billing_event: "IMPRESSION";
  optimization_goal: OptimizationGoal;
  bid_strategy: BidStrategy;
  bid_micro?: number;
  daily_budget_micro?: number; // minimum 5_000_000
  lifetime_budget_micro?: number;
  conversion_window?: "SWIPE_28DAY_VIEW_1DAY" | "SWIPE_7DAY";
  pacing_type?: "STANDARD" | "ACCELERATED";
  start_time?: string;
  end_time?: string;
  pixel_id?: string;
}

export interface SnapAdSquad extends SnapAdSquadPayload {
  id: string;
}

// ─── Creatives ───────────────────────────────────────────────────────────────

export type CreativeType =
  | "SNAP_AD"
  | "APP_INSTALL"
  | "WEB_VIEW"
  | "DEEP_LINK"
  | "LONGFORM_VIDEO";

export interface SnapCreativePayload {
  ad_account_id: string;
  name: string;
  type: CreativeType;
  headline: string; // max 34 chars
  top_snap_media_id: string;
  call_to_action?: string;
  brand_name?: string;
  profile_properties?: { profile_id: string };
  web_view_properties?: { url: string };
  deep_link_properties?: { deep_link_url: string };
  app_install_properties?: { app_link_url: string };
}

export interface SnapCreative extends SnapCreativePayload {
  id: string;
}

// ─── Ads ─────────────────────────────────────────────────────────────────────

export interface SnapAdPayload {
  ad_squad_id: string;
  creative_id: string;
  name: string;
  type: "SNAP_AD" | "REMOTE_WEBPAGE";
  status: "ACTIVE" | "PAUSED";
}

export interface SnapAd extends SnapAdPayload {
  id: string;
}

// ─── Media ───────────────────────────────────────────────────────────────────

export interface SnapMediaPayload {
  ad_account_id: string;
  name: string;
  type: "IMAGE" | "VIDEO";
}

export interface SnapMediaEntity {
  id: string;
  upload_status: "PENDING_UPLOAD" | "READY"; // live API values confirmed
  download_link?: string;
}

// ─── Generic API response wrapper ────────────────────────────────────────────

export interface SnapApiItem<T> {
  sub_request_status: "SUCCESS" | "ERROR";
  request_status?: string;
  request_id?: string;
  error_type?: string;
  message?: string;
  sub_request_error_reason?: string;
  error?: { error_type: string; message: string };
  campaign?: T;
  adsquad?: T;
  creative?: T;
  ad?: T;
  media?: T;
}

export interface SnapBatchResponse<T> {
  request_status: string;
  request_id: string;
  campaigns?: Array<SnapApiItem<T>>;
  adsquads?: Array<SnapApiItem<T>>;
  creatives?: Array<SnapApiItem<T>>;
  ads?: Array<SnapApiItem<T>>;
  media?: Array<SnapApiItem<T>>;
}
