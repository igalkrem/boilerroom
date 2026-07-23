import { metaFetch } from "./client";
import type { MetaAd, MetaAdCreative } from "@/types/meta";

export interface ResolvedMediaItem {
  key: string; // hash or video_id — unique per distinct asset
  type: "image" | "video";
  url: string;
}

// Every place an image_hash/video_id can appear on a launched ad, across the
// two authoring paths this app uses (object_story_spec) and the ad-level
// "Flexible" format field (creative_asset_groups_spec) — plus asset_feed_spec,
// which this app never writes but a manually-edited/duplicated ad could carry.
export function resolveAdMediaRefs(
  ad: MetaAd,
  creative: MetaAdCreative | null
): { imageHashes: string[]; videoIds: string[] } {
  const imageHashes = new Set<string>();
  const videoIds = new Set<string>();

  const linkData = creative?.object_story_spec?.link_data;
  if (linkData?.image_hash) imageHashes.add(linkData.image_hash);

  const videoData = creative?.object_story_spec?.video_data;
  if (videoData?.video_id) videoIds.add(videoData.video_id);

  for (const group of ad.creative_asset_groups_spec?.groups ?? []) {
    for (const img of group.images ?? []) {
      if (img.hash) imageHashes.add(img.hash);
    }
    for (const vid of group.videos ?? []) {
      if (vid.video_id) videoIds.add(vid.video_id);
    }
  }

  for (const img of creative?.asset_feed_spec?.images ?? []) {
    if (img.hash) imageHashes.add(img.hash);
  }
  for (const vid of creative?.asset_feed_spec?.videos ?? []) {
    if (vid.video_id) videoIds.add(vid.video_id);
  }

  return { imageHashes: [...imageHashes], videoIds: [...videoIds] };
}

interface AdImagesResponse {
  data?: Record<string, { hash: string; url?: string }>;
}

export async function fetchImageUrls(
  adAccountId: string,
  hashes: string[],
  token?: string
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (hashes.length === 0) return out;
  const res = await metaFetch<AdImagesResponse>(
    `/act_${adAccountId.replace("act_", "")}/adimages?hashes=${encodeURIComponent(JSON.stringify(hashes))}`,
    {},
    token
  );
  for (const entry of Object.values(res.data ?? {})) {
    if (entry.url) out.set(entry.hash, entry.url);
  }
  return out;
}

interface VideoSourceResponse {
  [videoId: string]: { id: string; source?: string };
}

export async function fetchVideoUrls(
  videoIds: string[],
  token?: string
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (videoIds.length === 0) return out;
  const res = await metaFetch<VideoSourceResponse>(
    `/?ids=${videoIds.join(",")}&fields=id,source`,
    {},
    token
  );
  for (const entry of Object.values(res)) {
    if (entry.source) out.set(entry.id, entry.source);
  }
  return out;
}

export const MAX_MEDIA_ITEMS = 60;
export const MAX_ADS = 20;

export interface AdWithCreative {
  adId: string;
  ad: MetaAd;
  creative: MetaAdCreative | null;
}

// Resolves media across MULTIPLE ads at once, deduped globally by hash/video_id
// so an asset reused across several ads (or the same ad account) is only
// resolved and downloaded once — this is the actual point of batching, not
// just convenience. Image hashes are account-scoped on Meta's side (the
// /adimages lookup requires act_<id>), so hashes are grouped by their owning
// ad account before resolving; video ids are resolved in one global batch
// since the video-node lookup isn't account-scoped.
export async function resolveBatchMedia(
  adsWithCreatives: AdWithCreative[],
  token?: string
): Promise<{ items: ResolvedMediaItem[]; truncated: boolean; unresolvedCount: number }> {
  const imageHashToAccount = new Map<string, string>();
  const allVideoIds = new Set<string>();

  for (const { ad, creative } of adsWithCreatives) {
    const { imageHashes, videoIds } = resolveAdMediaRefs(ad, creative);
    const accountId = ad.account_id ?? creative?.account_id;
    for (const hash of imageHashes) {
      if (accountId && !imageHashToAccount.has(hash)) imageHashToAccount.set(hash, accountId);
    }
    for (const videoId of videoIds) allVideoIds.add(videoId);
  }

  const allImageHashes = [...imageHashToAccount.keys()];
  const totalRefs = allImageHashes.length + allVideoIds.size;
  const truncated = totalRefs > MAX_MEDIA_ITEMS;
  const cappedImageHashes = truncated ? allImageHashes.slice(0, MAX_MEDIA_ITEMS) : allImageHashes;
  const cappedVideoIds = truncated
    ? [...allVideoIds].slice(0, Math.max(0, MAX_MEDIA_ITEMS - cappedImageHashes.length))
    : [...allVideoIds];

  const hashesByAccount = new Map<string, string[]>();
  for (const hash of cappedImageHashes) {
    const accountId = imageHashToAccount.get(hash)!;
    const list = hashesByAccount.get(accountId) ?? [];
    list.push(hash);
    hashesByAccount.set(accountId, list);
  }

  const [imageUrlMaps, videoUrls] = await Promise.all([
    Promise.all(
      [...hashesByAccount.entries()].map(([accountId, hashes]) => fetchImageUrls(accountId, hashes, token))
    ),
    fetchVideoUrls(cappedVideoIds, token),
  ]);
  const imageUrls = new Map<string, string>();
  for (const map of imageUrlMaps) for (const [hash, url] of map) imageUrls.set(hash, url);

  const items: ResolvedMediaItem[] = [];
  for (const hash of cappedImageHashes) {
    const url = imageUrls.get(hash);
    if (url) items.push({ key: hash, type: "image", url });
  }
  for (const videoId of cappedVideoIds) {
    const url = videoUrls.get(videoId);
    if (url) items.push({ key: videoId, type: "video", url });
  }

  const attempted = cappedImageHashes.length + cappedVideoIds.length;
  return { items, truncated, unresolvedCount: attempted - items.length };
}
