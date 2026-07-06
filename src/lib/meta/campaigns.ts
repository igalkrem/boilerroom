import { metaFetch } from "./client";
import type { MetaCampaignPayload, MetaCampaign } from "@/types/meta";

export async function createCampaign(
  adAccountId: string,
  campaign: MetaCampaignPayload,
  token?: string
): Promise<MetaCampaign> {
  return metaFetch<MetaCampaign>(
    `/act_${adAccountId.replace("act_", "")}/campaigns`,
    {
      method: "POST",
      body: JSON.stringify(campaign),
    },
    token
  );
}

export async function getCampaigns(
  adAccountId: string,
  token?: string
): Promise<MetaCampaign[]> {
  const data = await metaFetch<{ data: MetaCampaign[] }>(
    `/act_${adAccountId.replace("act_", "")}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,special_ad_categories,account_id`,
    {},
    token
  );
  return data.data ?? [];
}

export async function getCampaign(
  campaignId: string,
  token?: string
): Promise<MetaCampaign> {
  return metaFetch<MetaCampaign>(
    `/${campaignId}?fields=id,name,status,objective,daily_budget,lifetime_budget,special_ad_categories,account_id`,
    {},
    token
  );
}

export async function updateCampaign(
  campaignId: string,
  updates: Partial<Pick<MetaCampaignPayload, "name" | "status" | "daily_budget" | "lifetime_budget">>,
  expectedAdAccountId: string,
  token?: string
): Promise<{ success: boolean }> {
  const campaign = await getCampaign(campaignId, token);
  if (campaign.account_id && campaign.account_id !== expectedAdAccountId.replace("act_", "")) {
    throw new Error("forbidden: campaign does not belong to the specified ad account");
  }
  return metaFetch<{ success: boolean }>(
    `/${campaignId}`,
    {
      method: "POST",
      body: JSON.stringify(updates),
    },
    token
  );
}

export async function deleteCampaign(
  campaignId: string,
  expectedAdAccountId: string,
  token?: string
): Promise<void> {
  const campaign = await getCampaign(campaignId, token);
  if (campaign.account_id && campaign.account_id !== expectedAdAccountId.replace("act_", "")) {
    throw new Error("forbidden: campaign does not belong to the specified ad account");
  }
  await metaFetch<{ success: boolean }>(
    `/${campaignId}`,
    { method: "DELETE" },
    token
  );
}
