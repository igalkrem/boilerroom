// Facebook's per-page ad limit is UI-only (not exposed by the ads_volume API —
// confirmed via live probe 2026-07-07). 250 is the default for most pages.
export const DEFAULT_PAGE_AD_LIMIT = 250;

export interface PageConfig {
  id: string;                // Facebook Page ID (actor_id)
  name: string;              // Display name (cached from the Meta pages API)
  hidden: boolean;           // Hide from campaign creation flows
  feedProviderIds: string[]; // Feed providers this page is assigned to
  adLimit?: number;          // Per-page ad limit override; defaults to 250 when unset
  updatedAt: string;         // ISO timestamp
}
