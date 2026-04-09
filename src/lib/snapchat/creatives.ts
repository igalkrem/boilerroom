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

  return (data.creatives ?? []).map((item) => ({
    ...(item.creative ?? ({} as SnapCreative)),
    error:
      item.sub_request_status !== "SUCCESS"
        ? item.error?.message ?? "Unknown error"
        : undefined,
  }));
}
