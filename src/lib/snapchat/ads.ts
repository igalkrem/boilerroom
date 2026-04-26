import { snapFetch } from "./client";
import type { SnapAdPayload, SnapAd, SnapBatchResponse, SnapApiItem } from "@/types/snapchat";

export async function getAd(adId: string): Promise<SnapAd> {
  const data = await snapFetch<{ ads: Array<SnapApiItem<SnapAd>> }>(
    `/ads/${adId}`
  );
  const item = data.ads?.[0];
  if (!item?.ad) throw new Error("Ad not found");
  return item.ad;
}

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

  const mapped = (data.ads ?? []).map((item) => {
    if (item.sub_request_status !== "SUCCESS") {
      const msg = item.message ?? item.error?.message ?? "";
      const detail = item.error_type ?? item.error?.error_type ?? "";
      const reason = item.sub_request_error_reason ?? "";
      console.error(`Ad create failed | error_type=${detail} | message=${msg} | reason=${reason} | raw=${JSON.stringify(item)}`);
    }
    return {
      ...(item.ad ?? ({} as SnapAd)),
      error:
        item.sub_request_status !== "SUCCESS"
          ? [item.error_type ?? item.error?.error_type, item.message ?? item.error?.message].filter(Boolean).join(": ") || item.sub_request_error_reason || "Unknown error"
          : undefined,
    };
  });
  console.log("[createAds] results:", mapped.map((r) => ({ id: r.id ?? "MISSING", hasError: !!r.error, error: r.error })));
  return mapped;
}
