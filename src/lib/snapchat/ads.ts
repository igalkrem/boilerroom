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

  return (data.ads ?? []).map((item) => ({
    ...(item.ad ?? ({} as SnapAd)),
    error:
      item.sub_request_status !== "SUCCESS"
        ? item.error?.message ?? "Unknown error"
        : undefined,
  }));
}
