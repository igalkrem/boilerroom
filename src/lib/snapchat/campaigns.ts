import { snapFetch } from "./client";
import type { SnapCampaignPayload, SnapCampaign, SnapBatchResponse, SnapApiItem } from "@/types/snapchat";

export async function getCampaigns(adAccountId: string, token?: string): Promise<SnapCampaign[]> {
  const data = await snapFetch<{ campaigns: Array<SnapApiItem<SnapCampaign>> }>(
    `/adaccounts/${adAccountId}/campaigns`,
    {},
    token
  );
  return (data.campaigns ?? [])
    .filter((item) => item.sub_request_status === "SUCCESS" && item.campaign)
    .map((item) => item.campaign!);
}

export async function getCampaign(campaignId: string): Promise<SnapCampaign> {
  const data = await snapFetch<{ campaigns: Array<SnapApiItem<SnapCampaign>> }>(
    `/campaigns/${campaignId}`
  );
  const item = data.campaigns?.[0];
  if (!item?.campaign) throw new Error("Campaign not found");
  return item.campaign;
}

export async function deleteCampaign(
  campaignId: string,
  expectedAdAccountId: string
): Promise<void> {
  // IDOR guard — mirror deleteAdSquad/updateAdSquad: fetch first, assert ownership.
  const campaign = await getCampaign(campaignId);
  if (campaign.ad_account_id && campaign.ad_account_id !== expectedAdAccountId) {
    throw new Error("forbidden: campaign does not belong to the specified ad account");
  }
  await snapFetch<unknown>(`/campaigns/${campaignId}`, { method: "DELETE" });
}

// Fallback for Smart-placement ad squads: the squad itself is locked (E2025), but its wrapping
// campaign is not. Delivery requires campaign status ACTIVE AND squad status ACTIVE, so toggling
// the campaign is a real substitute for squad-level activate/deactivate. (Budget is NOT handled the
// same way here — campaign-level daily_budget_micro is a spend ceiling layered on top of the
// squad's own budget, not a substitute for it; setting it higher than the squad's frozen budget has
// no real effect, since the squad's own budget is still the binding constraint underneath. Confirmed
// 2026-07-27 after live verification in Ads Manager, correcting an earlier assumption drawn only from
// a fresh-GET read-back test — that test proved the field accepts writes, not that it governs real
// delivery pacing. Budget therefore stays unrecoverable on locked squads, same as bid.)
export async function updateCampaignStatus(
  campaignId: string,
  status: "ACTIVE" | "PAUSED",
  expectedAdAccountId: string
): Promise<SnapCampaign> {
  const current = await getCampaign(campaignId);
  if (current.ad_account_id && current.ad_account_id !== expectedAdAccountId) {
    throw new Error("forbidden: campaign does not belong to the specified ad account");
  }
  // Snapchat requires start_time/buy_model/objective_v2_properties to already be present on a
  // campaign PUT or it rejects with E2006/E1008 — echo the campaign's own current values back.
  // end_time and product_properties are echoed for the same reason: omitting a field that IS set
  // reads to Snapchat as an attempt to null it, which either fails with E1008 or silently clears
  // it (an omitted end_time would let the campaign run past its intended stop; an omitted
  // product_properties would break a Catalogue campaign's catalog_id association).
  // undefined keys are dropped by JSON.stringify, so unset fields stay unset.
  const body = {
    id: campaignId,
    ad_account_id: expectedAdAccountId,
    name: current.name,
    start_time: current.start_time,
    end_time: current.end_time,
    buy_model: current.buy_model,
    objective_v2_properties: current.objective_v2_properties,
    product_properties: current.product_properties,
    daily_budget_micro: current.daily_budget_micro,
    status,
  };
  const data = await snapFetch<{ campaigns: Array<SnapApiItem<SnapCampaign>> }>(
    `/adaccounts/${expectedAdAccountId}/campaigns`,
    { method: "PUT", body: JSON.stringify({ campaigns: [body] }) }
  );
  const item = data.campaigns?.[0];
  if (!item) throw new Error("Campaign update failed: empty response");
  if (item.sub_request_status !== "SUCCESS") {
    const detail = item.error_type ?? item.error?.error_type;
    const msg = item.message ?? item.error?.message ?? item.sub_request_error_reason ?? "";
    console.error("[updateCampaignStatus] Snapchat ERROR:", { campaignId, status, raw: item });
    throw new Error([detail, msg].filter(Boolean).join(": ") || "Snapchat rejected the campaign update");
  }
  if (!item.campaign) throw new Error("Campaign update failed: no campaign in response");
  return item.campaign;
}

export async function createCampaigns(
  adAccountId: string,
  campaigns: SnapCampaignPayload[]
): Promise<Array<SnapCampaign & { error?: string }>> {
  const data = await snapFetch<SnapBatchResponse<SnapCampaign>>(
    `/adaccounts/${adAccountId}/campaigns`,
    {
      method: "POST",
      body: JSON.stringify({ campaigns }),
    }
  );

  const mapped = (data.campaigns ?? []).map((item) => {
    if (item.sub_request_status !== "SUCCESS") {
      const msg = item.message ?? item.error?.message;
      const detail = item.error_type ?? item.error?.error_type;
      console.error("Campaign create failed:", { error_type: detail, message: msg, raw: item });
    }
    return {
      ...(item.campaign ?? ({} as SnapCampaign)),
      error:
        item.sub_request_status !== "SUCCESS"
          ? item.sub_request_error_reason || [item.error_type ?? item.error?.error_type, item.message ?? item.error?.message].filter(Boolean).join(": ") || "Unknown error"
          : undefined,
    };
  });
  console.log("[createCampaigns] results:", mapped.map((r) => ({ id: r.id ?? "MISSING", hasError: !!r.error, error: r.error })));
  return mapped;
}
