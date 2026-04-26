import { snapFetch } from "./client";
import type { SnapAdSquadPayload, SnapAdSquad, SnapBatchResponse, SnapApiItem } from "@/types/snapchat";

export async function getAdSquad(adSquadId: string): Promise<SnapAdSquad> {
  const data = await snapFetch<{ adsquads: Array<SnapApiItem<SnapAdSquad>> }>(
    `/adsquads/${adSquadId}`
  );
  const item = data.adsquads?.[0];
  if (!item?.adsquad) throw new Error("Ad squad not found");
  return item.adsquad;
}

export async function createAdSquads(
  campaignId: string,
  adsquads: SnapAdSquadPayload[]
): Promise<Array<SnapAdSquad & { error?: string }>> {
  console.log("[createAdSquads] payload:", JSON.stringify({ adsquads }));
  const data = await snapFetch<SnapBatchResponse<SnapAdSquad>>(
    `/campaigns/${campaignId}/adsquads`,
    {
      method: "POST",
      body: JSON.stringify({ adsquads }),
    }
  );

  const mapped = (data.adsquads ?? []).map((item) => {
    if (item.sub_request_status !== "SUCCESS") {
      const msg = item.message ?? item.error?.message;
      const detail = item.error_type ?? item.error?.error_type;
      console.error("Ad squad create failed:", { error_type: detail, message: msg, raw: item });
    }
    return {
      ...(item.adsquad ?? ({} as SnapAdSquad)),
      error:
        item.sub_request_status !== "SUCCESS"
          ? [item.error_type ?? item.error?.error_type, item.message ?? item.error?.message].filter(Boolean).join(": ") || item.sub_request_error_reason || "Unknown error"
          : undefined,
    };
  });
  console.log("[createAdSquads] results:", mapped.map((r) => ({ id: r.id ?? "MISSING", hasError: !!r.error, error: r.error })));
  return mapped;
}
