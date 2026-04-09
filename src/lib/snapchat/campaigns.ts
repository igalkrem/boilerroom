import { snapFetch } from "./client";
import type { SnapCampaignPayload, SnapCampaign, SnapBatchResponse } from "@/types/snapchat";

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

  return (data.campaigns ?? []).map((item) => ({
    ...(item.campaign ?? ({} as SnapCampaign)),
    error:
      item.sub_request_status !== "SUCCESS"
        ? item.error?.message ?? "Unknown error"
        : undefined,
  }));
}
