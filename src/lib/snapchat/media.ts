import { snapFetch } from "./client";
import type { SnapMediaPayload, SnapMediaEntity } from "@/types/snapchat";

export async function createMediaEntity(
  payload: SnapMediaPayload
): Promise<{ mediaId: string; uploadUrl: string }> {
  const data = await snapFetch<{
    media: Array<{ media: SnapMediaEntity & { upload_url?: string } }>;
  }>(`/adaccounts/${payload.ad_account_id}/media`, {
    method: "POST",
    body: JSON.stringify({ media: [payload] }),
  });

  const item = data.media?.[0]?.media;
  if (!item) throw new Error("No media entity returned");

  return { mediaId: item.id, uploadUrl: item.upload_url ?? "" };
}

export async function pollMediaStatus(
  mediaId: string,
  adAccountId: string,
  maxAttempts = 30
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const data = await snapFetch<{
      media: Array<{ media: SnapMediaEntity }>;
    }>(`/adaccounts/${adAccountId}/media/${mediaId}`);

    const status = data.media?.[0]?.media?.upload_status;
    if (status === "COMPLETE") return;
    if (status === "FAILED") throw new Error("Media upload failed on Snapchat side");

    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Media upload timed out");
}
