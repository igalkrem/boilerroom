import { snapFetch } from "./client";
import type { SnapCreativePayload, SnapCreative, SnapBatchResponse, SnapApiItem } from "@/types/snapchat";

export async function getCreative(creativeId: string): Promise<SnapCreative> {
  const data = await snapFetch<{ creatives: Array<SnapApiItem<SnapCreative>> }>(
    `/creatives/${creativeId}`
  );
  const item = data.creatives?.[0];
  if (!item?.creative) throw new Error("Creative not found");
  return item.creative;
}

export async function createCreatives(
  adAccountId: string,
  creatives: SnapCreativePayload[]
): Promise<Array<SnapCreative & { error?: string }>> {
  console.log("[createCreatives] payload:", JSON.stringify({ creatives: creatives.map(c => ({ ...c, top_snap_media_id: c.top_snap_media_id?.slice(0, 8) + "..." })) }));
  const data = await snapFetch<SnapBatchResponse<SnapCreative>>(
    `/adaccounts/${adAccountId}/creatives`,
    {
      method: "POST",
      body: JSON.stringify({ creatives }),
    }
  );

  const mapped = (data.creatives ?? []).map((item) => {
    if (item.sub_request_status !== "SUCCESS") {
      const msg = item.message ?? item.error?.message ?? "";
      const detail = item.error_type ?? item.error?.error_type ?? "";
      const reason = item.sub_request_error_reason ?? "";
      console.error(`Creative create failed | error_type=${detail} | message=${msg} | reason=${reason} | raw=${JSON.stringify(item)}`);
    }
    return {
      ...(item.creative ?? ({} as SnapCreative)),
      error:
        item.sub_request_status !== "SUCCESS"
          ? [item.error_type ?? item.error?.error_type, item.message ?? item.error?.message].filter(Boolean).join(": ") || item.sub_request_error_reason || "Unknown error"
          : undefined,
    };
  });
  console.log("[createCreatives] results:", mapped.map((r) => ({ id: r.id ?? "MISSING", hasError: !!r.error, error: r.error })));
  return mapped;
}
