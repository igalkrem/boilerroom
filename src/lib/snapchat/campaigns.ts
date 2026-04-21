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
          ? [item.error_type ?? item.error?.error_type, item.message ?? item.error?.message].filter(Boolean).join(": ") || item.sub_request_error_reason || "Unknown error"
          : undefined,
    };
  });
  console.log("[createCampaigns] results:", mapped.map((r) => ({ id: r.id ?? "MISSING", hasError: !!r.error, error: r.error })));
  return mapped;
}
