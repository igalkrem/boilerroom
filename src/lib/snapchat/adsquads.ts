import { snapFetch } from "./client";
import type { SnapAdSquadPayload, SnapAdSquad, SnapBatchResponse } from "@/types/snapchat";

export async function createAdSquads(
  campaignId: string,
  adsquads: SnapAdSquadPayload[]
): Promise<Array<SnapAdSquad & { error?: string }>> {
  const data = await snapFetch<SnapBatchResponse<SnapAdSquad>>(
    `/campaigns/${campaignId}/adsquads`,
    {
      method: "POST",
      body: JSON.stringify({ adsquads }),
    }
  );

  return (data.adsquads ?? []).map((item) => {
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
}
