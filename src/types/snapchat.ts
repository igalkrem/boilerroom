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
  // Catalogue (Dynamic Collection Ads) — associates the campaign with a Snapchat catalogue.
  product_properties?: { catalog_id: string };
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
      min_age?: string;
      max_age?: string;
      genders?: Array<"MALE" | "FEMALE">;
    }>;
    devices?: Array<{
      os_type?: "iOS" | "ANDROID" | "WEB";
      operation?: "INCLUDE" | "EXCLUDE";
    }>;
  };
  placement_v2?: {
    // "CONTENT" (Stories/Publisher Stories) is not in the public spec but is accepted by the API.
    // Omit this field for AUTOMATIC placement — sending it (even with config: "AUTOMATIC") causes
    // Snapchat to lock the squad so budget/bid/status cannot be updated via API (E2025).
    config: "AUTOMATIC" | "CONTENT" | "CUSTOM";
    platforms?: string[];
    snapchat_positions?: string[];
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
  // Catalogue (Dynamic Collection Ads) — set at creation only; omit from PUT (not in ADSQUAD_PUT_ALLOWED_FIELDS).
  // catalog_vertical is "COMMERCE" for product catalogues; child_ad_type "COLLECTION" makes this a collection squad.
  product_properties?: { product_set_id: string; catalog_vertical?: "COMMERCE" };
  child_ad_type?: "COLLECTION";
  // Server-computed — returned by GET, must never be sent in PUT (causes E2025 / sub_request_status ERROR)
  effective_status?: string;
  delivery_status?: string[];
}

export interface SnapAdSquad extends SnapAdSquadPayload {
  id: string;
  ad_account_id?: string;
}

// ─── Creatives ───────────────────────────────────────────────────────────────

export type CreativeType =
  | "SNAP_AD"
  | "WEB_VIEW"
  | "DEEP_LINK"
  | "COLLECTION";

export interface SnapCreativePayload {
  ad_account_id: string;
  name: string;
  type: CreativeType;
  headline?: string; // max 34 chars
  top_snap_media_id?: string; // the hero image/video (required for COLLECTION)
  call_to_action?: string;
  brand_name?: string;
  profile_properties: { profile_id: string };
  web_view_properties?: { url: string };
  deep_link_properties?: { deep_link_uri: string };
  // Catalogue (Dynamic Collection Ads). The hero is a static uploaded media (render_type STATIC);
  // the product tiles below it are rendered dynamically from the product set via the template.
  render_type?: "STATIC" | "DYNAMIC";
  dynamic_render_properties?: { product_set_id: string; dynamic_template_id?: string };
  collection_properties?: {
    interaction_zone_id: string;
    default_fallback_interaction_type?: string; // "WEB_VIEW"
    web_view_properties?: { url: string };
  };
}

export interface SnapCreative extends SnapCreativePayload {
  id: string;
}

// ─── Creative Elements & Interaction Zones (Collection Ads) ────────────────────
// A Collection Ad shows 4 product tiles below the hero. Each tile is a "creative element"
// (a BUTTON placeholder); the 4 elements are grouped into one "interaction zone" referenced
// by the creative's collection_properties.interaction_zone_id. For dynamic collection ads
// the elements/zone are DYNAMIC placeholders — Snapchat fills them from the product set.

export interface SnapCreativeElementPayload {
  name: string;
  type: "BUTTON";
  interaction_type: "WEB_VIEW" | "DEEP_LINK";
  render_type: "STATIC" | "DYNAMIC";
}

export interface SnapCreativeElement extends SnapCreativeElementPayload {
  id: string;
  ad_account_id?: string;
}

export interface SnapInteractionZonePayload {
  name: string;
  headline: string; // tile CTA label, e.g. "MORE"
  creative_element_ids: string[];
  render_type: "STATIC" | "DYNAMIC";
}

export interface SnapInteractionZone extends SnapInteractionZonePayload {
  id: string;
  ad_account_id?: string;
}

// ─── Ads ─────────────────────────────────────────────────────────────────────

export interface SnapAdPayload {
  ad_squad_id: string;
  creative_id: string;
  name: string;
  type: "SNAP_AD" | "REMOTE_WEBPAGE" | "COLLECTION";
  status: "ACTIVE" | "PAUSED";
}

export interface SnapAd extends SnapAdPayload {
  id: string;
  ad_account_id?: string;
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
  creative_element?: T;
  interaction_zone?: T;
}

export interface SnapBatchResponse<T> {
  request_status: string;
  request_id: string;
  campaigns?: Array<SnapApiItem<T>>;
  adsquads?: Array<SnapApiItem<T>>;
  creatives?: Array<SnapApiItem<T>>;
  ads?: Array<SnapApiItem<T>>;
  media?: Array<SnapApiItem<T>>;
  creative_elements?: Array<SnapApiItem<T>>;
  interaction_zones?: Array<SnapApiItem<T>>;
}
