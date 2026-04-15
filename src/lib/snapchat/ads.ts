import { snapFetch } from "./client";
import type { SnapAdPayload, SnapAd, SnapBatchResponse } from "@/types/snapchat";

export async function createAds(
  adSquadId: string,
  ads: SnapAdPayload[]
): Promise<Array<SnapAd & { error?: string }>> {
  const data = await snapFetch<SnapBatchResponse<SnapAd>>(
    `/adsquads/${adSquadId}/ads`,
    {
      method: "POST",
      body: JSON.stringify({ ads }),
    }
  );

  return (data.ads ?? []).map((item) => {
    if (item.sub_request_status !== "SUCCESS") {
      const msg = item.message ?? item.error?.message;
      const detail = item.error_type ?? item.error?.error_type;
      console.error("Ad create failed:", { error_type: detail, message: msg, raw: item });
    }
    return {
      ...(item.ad ?? ({} as SnapAd)),
      error:
        item.sub_request_status !== "SUCCESS"
          ? [item.error_type ?? item.error?.error_type, item.message ?? item.error?.message].filter(Boolean).join(": ") || item.sub_request_error_reason || "Unknown error"
          : undefined,
    };
  });
}
