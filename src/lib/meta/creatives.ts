import { metaFetch } from "./client";
import type {
  MetaAdCreativePayload,
  MetaAdCreative,
  MetaAdImageResponse,
  MetaAdVideoResponse,
  MetaVideoStatus,
} from "@/types/meta";

export async function uploadImage(
  adAccountId: string,
  imageBytes: Buffer,
  fileName: string,
  token?: string
): Promise<{ hash: string; url: string }> {
  const formData = new FormData();
  formData.append("filename", new Blob([new Uint8Array(imageBytes)]), fileName);

  const data = await metaFetch<MetaAdImageResponse>(
    `/act_${adAccountId.replace("act_", "")}/adimages`,
    {
      method: "POST",
      body: formData,
      headers: {},
    },
    token
  );

  const entry = Object.values(data.images)[0];
  if (!entry) throw new Error("Image upload returned no hash");
  return entry;
}

export async function uploadVideo(
  adAccountId: string,
  videoUrl: string,
  title: string,
  token?: string
): Promise<string> {
  const data = await metaFetch<MetaAdVideoResponse>(
    `/act_${adAccountId.replace("act_", "")}/advideos`,
    {
      method: "POST",
      body: JSON.stringify({ file_url: videoUrl, title }),
    },
    token
  );
  return data.id;
}

export async function pollVideoStatus(
  videoId: string,
  token?: string,
  maxAttempts = 30,
  intervalMs = 2000
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await metaFetch<MetaVideoStatus>(
      `/${videoId}?fields=processing_phase`,
      {},
      token
    );
    if (status.processing_phase === "complete") return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Video ${videoId} processing timed out`);
}

export async function createAdCreative(
  adAccountId: string,
  creative: MetaAdCreativePayload,
  token?: string
): Promise<MetaAdCreative> {
  return metaFetch<MetaAdCreative>(
    `/act_${adAccountId.replace("act_", "")}/adcreatives`,
    {
      method: "POST",
      body: JSON.stringify(creative),
    },
    token
  );
}

export async function getAdCreative(
  creativeId: string,
  token?: string
): Promise<MetaAdCreative> {
  return metaFetch<MetaAdCreative>(
    `/${creativeId}?fields=id,name,object_story_spec,account_id`,
    {},
    token
  );
}
