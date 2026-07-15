import { metaFetch } from "./client";
import type { MetaAdSetPayload, MetaAdSet } from "@/types/meta";

export async function createAdSet(
  adAccountId: string,
  adSet: MetaAdSetPayload,
  token?: string
): Promise<MetaAdSet> {
  return metaFetch<MetaAdSet>(
    `/act_${adAccountId.replace("act_", "")}/adsets`,
    {
      method: "POST",
      body: JSON.stringify(adSet),
    },
    token
  );
}

export async function getAdSets(
  campaignId: string,
  token?: string
): Promise<MetaAdSet[]> {
  const data = await metaFetch<{ data: MetaAdSet[] }>(
    `/${campaignId}/adsets?fields=id,name,status,targeting,billing_event,optimization_goal,bid_amount,daily_budget,lifetime_budget,promoted_object,start_time,end_time,campaign_id,account_id`,
    {},
    token
  );
  return data.data ?? [];
}

export async function getAdSetsByAccount(
  adAccountId: string,
  token?: string
): Promise<MetaAdSet[]> {
  const data = await metaFetch<{ data: MetaAdSet[] }>(
    `/act_${adAccountId.replace("act_", "")}/adsets?fields=id,name,status,daily_budget,bid_amount,bid_strategy,bid_constraints,optimization_goal,attribution_spec,campaign_id,account_id&limit=500`,
    {},
    token
  );
  return data.data ?? [];
}

export async function getAdSet(
  adSetId: string,
  token?: string
): Promise<MetaAdSet> {
  return metaFetch<MetaAdSet>(
    `/${adSetId}?fields=id,name,status,targeting,billing_event,optimization_goal,bid_amount,daily_budget,lifetime_budget,promoted_object,start_time,end_time,campaign_id,account_id`,
    {},
    token
  );
}

export async function updateAdSet(
  adSetId: string,
  updates: Partial<Pick<MetaAdSetPayload, "name" | "status" | "daily_budget" | "bid_amount">>,
  expectedAdAccountId: string,
  token?: string
): Promise<{ success: boolean }> {
  const adSet = await getAdSet(adSetId, token);
  if (adSet.account_id && adSet.account_id !== expectedAdAccountId.replace("act_", "")) {
    throw new Error("forbidden: ad set does not belong to the specified ad account");
  }
  return metaFetch<{ success: boolean }>(
    `/${adSetId}`,
    {
      method: "POST",
      body: JSON.stringify(updates),
    },
    token
  );
}

export async function deleteAdSet(
  adSetId: string,
  expectedAdAccountId: string,
  token?: string
): Promise<void> {
  const adSet = await getAdSet(adSetId, token);
  if (adSet.account_id && adSet.account_id !== expectedAdAccountId.replace("act_", "")) {
    throw new Error("forbidden: ad set does not belong to the specified ad account");
  }
  await metaFetch<{ success: boolean }>(
    `/${adSetId}`,
    { method: "DELETE" },
    token
  );
}
