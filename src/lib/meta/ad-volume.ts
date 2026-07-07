import { metaFetch } from "./client";

export { DEFAULT_PAGE_AD_LIMIT } from "@/types/page-config";

// Row shape from GET /act_<id>/ads_volume?show_breakdown_by_actor=true (confirmed
// against the LIVE API — do not trust docs). `ads_running_or_in_review_count` is
// the PAGE-LEVEL total (identical across every ad account that references the
// page); `current_account_ads_running_or_in_review_count` is that account's slice.
// No limit field is returned. `[k: string]: unknown` keeps any unknown fields.
export interface AdsVolumeRow {
  actor_id?: string;
  ads_running_or_in_review_count?: number;
  current_account_ads_running_or_in_review_count?: number;
  recommendations?: unknown[];
  [k: string]: unknown;
}

export async function getAdsVolume(
  adAccountId: string,
  token?: string
): Promise<{ data: AdsVolumeRow[] }> {
  const acct = adAccountId.replace(/^act_/, "");
  return metaFetch<{ data: AdsVolumeRow[] }>(
    `/act_${acct}/ads_volume?show_breakdown_by_actor=true`,
    {},
    token
  );
}
