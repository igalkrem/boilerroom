import { put, list, getDownloadUrl } from "@vercel/blob";

// Server-side cache for the (call-heavy) Meta ad-limits result, so the FB Pages
// table doesn't re-hit ~35 Graph endpoints on every page load and trip the app
// rate limit (#4). Stored per user in the same public blob store as /api/data.

export const AD_LIMITS_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface AdLimitPageRow {
  pageId: string;
  name: string;
  businessName: string | null;
  running: number;
}

interface CachePayload {
  cachedAt: number;
  pages: AdLimitPageRow[];
}

function cachePath(userId: string): string {
  return `metadata/${userId}/meta_ad_limits_cache.json`;
}

export async function readAdLimitsCache(userId: string): Promise<CachePayload | null> {
  try {
    const path = cachePath(userId);
    const { blobs } = await list({ prefix: path });
    const blob = blobs.find((b) => b.pathname === path);
    if (!blob) return null;
    const downloadUrl = await getDownloadUrl(blob.url);
    const res = await fetch(downloadUrl, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as CachePayload;
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
    await put(cachePath(userId), JSON.stringify({ cachedAt, pages } satisfies CachePayload), {
      access: "public",
      allowOverwrite: true,
      addRandomSuffix: false,
    });
  } catch (err) {
    console.error("[meta/ad-limits] cache write failed:", err);
  }
}
