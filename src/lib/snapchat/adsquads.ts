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

  return (data.adsquads ?? []).map((item) => ({
    ...(item.adsquad ?? ({} as SnapAdSquad)),
    error:
      item.sub_request_status !== "SUCCESS"
        ? item.error?.message ?? "Unknown error"
        : undefined,
  }));
}
