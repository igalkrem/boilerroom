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

/**
 * Single-shot status check — returns the current upload_status string.
 * Returns "PENDING" for 404s (Snapchat may not register the media immediately).
 * The polling loop lives in the client (uploadMediaToSnapchat.ts) so we never
 * hold a Vercel serverless function open for minutes at a time.
 */
export async function checkMediaStatus(
  mediaId: string,
  adAccountId: string
): Promise<string> {
  let data: { media: Array<{ media: SnapMediaEntity }> } | null = null;
  try {
    data = await snapFetch<{ media: Array<{ media: SnapMediaEntity }> }>(
      `/adaccounts/${adAccountId}/media/${mediaId}`
    );
  } catch (err) {
    if (String(err).includes("404")) return "PENDING";
    throw err;
  }
  return data.media?.[0]?.media?.upload_status ?? "PENDING";
}
