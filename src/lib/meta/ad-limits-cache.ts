import { readUserMetadata, writeUserMetadata } from "@/lib/db/user-metadata";

// Server-side cache for the (call-heavy) Meta ad-limits result, so the FB Pages
// table doesn't re-hit ~35 Graph endpoints on every page load and trip the app
// rate limit (#4). Stored per user in `user_metadata` — it moved out of the public
// blob store with the rest of the config (SEC-8), since page names, owning Business
// Manager names and running-ad counts were being served to anyone.
// No TTL — cache is served indefinitely until the user explicitly clicks
// "Refresh" (?refresh=1). Pre-launch ad counts use a separate live endpoint
// (/api/meta/page-ad-counts).

export interface AdLimitPageRow {
  pageId: string;
  name: string;
  businessName: string | null;
  running: number;
  instagramActorId: string | null;
}

interface CachePayload {
  cachedAt: number;
  pages: AdLimitPageRow[];
}

const CACHE_KEY = "meta_ad_limits_cache";

export async function readAdLimitsCache(userId: string): Promise<CachePayload | null> {
  try {
    const data = (await readUserMetadata(userId, CACHE_KEY)) as CachePayload | null;
    if (!data || typeof data.cachedAt !== "number" || !Array.isArray(data.pages)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function writeAdLimitsCache(
  userId: string,
  pages: AdLimitPageRow[],
  cachedAt: number
): Promise<void> {
  try {
    await writeUserMetadata(userId, CACHE_KEY, { cachedAt, pages } satisfies CachePayload);
  } catch (err) {
    console.error("[meta/ad-limits] cache write failed:", err);
  }
}
