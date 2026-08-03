import { readUserMetadata, writeUserMetadata, GLOBAL_OWNER } from "@/lib/db/user-metadata";

// A page's page-backed Instagram account never changes once created, so this
// cache has no TTL (unlike ad-limits-cache.ts) — a page id is resolved via
// Meta at most once, ever, regardless of user. Shared globally (not per-user)
// since the value is a property of the Page itself, not of who's asking — hence the
// GLOBAL_OWNER sentinel rather than a real google_user_id (SEC-8 moved this out of the
// public blob store along with the rest of the metadata).

const CACHE_KEY = "meta_instagram_actor_cache";

type CacheMap = Record<string, string>; // pageId -> instagramActorId

export async function readInstagramActorCache(): Promise<CacheMap> {
  return readCache();
}

export async function writeInstagramActorCacheEntries(entries: Record<string, string>): Promise<void> {
  if (Object.keys(entries).length === 0) return;
  try {
    const cache = await readCache();
    Object.assign(cache, entries);
    await writeUserMetadata(GLOBAL_OWNER, CACHE_KEY, cache);
  } catch (err) {
    console.error("[meta/instagram-actor-cache] bulk write failed:", err);
  }
}

async function readCache(): Promise<CacheMap> {
  try {
    const data = (await readUserMetadata(GLOBAL_OWNER, CACHE_KEY)) as CacheMap | null;
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
    await writeUserMetadata(GLOBAL_OWNER, CACHE_KEY, cache);
  } catch (err) {
    console.error("[meta/instagram-actor-cache] write failed:", err);
  }
}
