import { put, list, getDownloadUrl } from "@vercel/blob";

// A page's page-backed Instagram account never changes once created, so this
// cache has no TTL (unlike ad-limits-cache.ts) — a page id is resolved via
// Meta at most once, ever, regardless of user. Shared globally (not per-user)
// since the value is a property of the Page itself, not of who's asking.

const CACHE_PATH = "metadata/global/meta_instagram_actor_cache.json";

type CacheMap = Record<string, string>; // pageId -> instagramActorId

async function readCache(): Promise<CacheMap> {
  try {
    const { blobs } = await list({ prefix: CACHE_PATH });
    const blob = blobs.find((b) => b.pathname === CACHE_PATH);
    if (!blob) return {};
    const downloadUrl = await getDownloadUrl(blob.url);
    const res = await fetch(downloadUrl, { cache: "no-store" });
    if (!res.ok) return {};
    const data = (await res.json()) as CacheMap;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export async function getCachedInstagramActorId(pageId: string): Promise<string | undefined> {
  const cache = await readCache();
  return cache[pageId];
}

export async function setCachedInstagramActorId(pageId: string, instagramActorId: string): Promise<void> {
  try {
    const cache = await readCache();
    cache[pageId] = instagramActorId;
    await put(CACHE_PATH, JSON.stringify(cache), {
      access: "public",
      allowOverwrite: true,
      addRandomSuffix: false,
    });
  } catch (err) {
    console.error("[meta/instagram-actor-cache] write failed:", err);
  }
}
