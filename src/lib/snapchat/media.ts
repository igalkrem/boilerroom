import { snapFetch } from "./client";
import type { SnapMediaPayload, SnapMediaEntity } from "@/types/snapchat";

export async function createMediaEntity(
  payload: SnapMediaPayload
): Promise<{ mediaId: string; uploadUrl: string | null }> {
  const data = await snapFetch<{
    media: Array<{ sub_request_status: string; media: SnapMediaEntity & { upload_url?: string } }>;
  }>(`/adaccounts/${payload.ad_account_id}/media`, {
    method: "POST",
    body: JSON.stringify({ media: [payload] }),
  });

  const rawItem = data.media?.[0];
  const item = rawItem?.media;

  if (!item) {
    throw new Error(`No media entity in response: ${JSON.stringify(data)}`);
  }
  if (!item.id) {
    throw new Error(`Media entity has no ID. sub_status=${rawItem?.sub_request_status} response=${JSON.stringify(data)}`);
  }

  return { mediaId: item.id, uploadUrl: item.upload_url ?? null };
}

export async function pollMediaStatus(
  mediaId: string,
  adAccountId: string,
  maxAttempts = 90
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    let data: { media: Array<{ media: SnapMediaEntity }> } | null = null;
    try {
      data = await snapFetch<{ media: Array<{ media: SnapMediaEntity }> }>(
        `/adaccounts/${adAccountId}/media/${mediaId}`
      );
    } catch (err) {
      // Snapchat may return 404 briefly after finalize while the media is
      // being registered — treat it as PENDING and keep polling.
      if (String(err).includes("404")) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }

    const status = data.media?.[0]?.media?.upload_status;
    if (status === "COMPLETE") return;
    if (status === "FAILED") throw new Error("Media upload failed on Snapchat side");

    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Media upload timed out");
}
