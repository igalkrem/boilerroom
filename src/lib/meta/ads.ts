import { metaFetch } from "./client";
import type { MetaAdPayload, MetaAd } from "@/types/meta";

export async function createAd(
  adAccountId: string,
  ad: MetaAdPayload,
  token?: string
): Promise<MetaAd> {
  return metaFetch<MetaAd>(
    `/act_${adAccountId.replace("act_", "")}/ads`,
    {
      method: "POST",
      body: JSON.stringify(ad),
    },
    token
  );
}

export async function getAds(
  adSetId: string,
  token?: string
): Promise<MetaAd[]> {
  const data = await metaFetch<{ data: MetaAd[] }>(
    `/${adSetId}/ads?fields=id,name,status,adset_id,creative,account_id`,
    {},
    token
  );
  return data.data ?? [];
}

export async function getAd(
  adId: string,
  token?: string
): Promise<MetaAd> {
  return metaFetch<MetaAd>(
    `/${adId}?fields=id,name,status,adset_id,creative,account_id,creative_asset_groups_spec`,
    {},
    token
  );
}

export async function updateAd(
  adId: string,
  updates: Partial<Pick<MetaAdPayload, "name" | "status">>,
  expectedAdAccountId: string,
  token?: string
): Promise<{ success: boolean }> {
  const ad = await getAd(adId, token);
  if (ad.account_id && ad.account_id !== expectedAdAccountId.replace("act_", "")) {
    throw new Error("forbidden: ad does not belong to the specified ad account");
  }
  return metaFetch<{ success: boolean }>(
    `/${adId}`,
    {
      method: "POST",
      body: JSON.stringify(updates),
    },
    token
  );
}
