import { snapFetch } from "./client";
import type { SnapCreativePayload, SnapCreative, SnapBatchResponse } from "@/types/snapchat";

export async function createCreatives(
  adAccountId: string,
  creatives: SnapCreativePayload[]
): Promise<Array<SnapCreative & { error?: string }>> {
  const data = await snapFetch<SnapBatchResponse<SnapCreative>>(
    `/adaccounts/${adAccountId}/creatives`,
    {
      method: "POST",
      body: JSON.stringify({ creatives }),
    }
  );

  return (data.creatives ?? []).map((item) => {
    if (item.sub_request_status !== "SUCCESS") {
      const msg = item.message ?? item.error?.message;
      const detail = item.error_type ?? item.error?.error_type;
      console.error("Creative create failed:", { error_type: detail, message: msg, raw: item });
    }
    return {
      ...(item.creative ?? ({} as SnapCreative)),
      error:
        item.sub_request_status !== "SUCCESS"
          ? [item.error_type ?? item.error?.error_type, item.message ?? item.error?.message].filter(Boolean).join(": ") || "Unknown error"
          : undefined,
    };
  });
}
