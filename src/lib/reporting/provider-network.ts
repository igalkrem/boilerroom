import { list, getDownloadUrl } from "@vercel/blob";

/**
 * Fetches the user's feed provider config from KV and returns a map of
 * adAccountId → "visymo" | "predicto" for accounts where revenueSource is set.
 * Non-fatal: returns an empty map on any error so callers fall back to DB joins.
 */
export async function getProviderNetworkMap(
  googleUserId: string
): Promise<Map<string, "visymo" | "predicto">> {
  const map = new Map<string, "visymo" | "predicto">();
  try {
    const path = `metadata/${googleUserId}/br_feed_providers.json`;
    const { blobs } = await list({ prefix: path });
    const blob = blobs.find((b) => b.pathname === path);
    if (!blob) {
      console.log(`[provider-network] no blob found at ${path} (${blobs.length} blobs with prefix)`);
      return map;
    }
    const downloadUrl = getDownloadUrl(blob.url);
    const res = await fetch(downloadUrl, { cache: "no-store" });
    if (!res.ok) {
      console.error(`[provider-network] fetch failed: ${res.status}`);
      return map;
    }
    const providers: Array<{
      snapConfig?: { revenueSource?: string; allowedAdAccountIds?: string[] };
    }> = await res.json();
    for (const p of providers) {
      const src = p.snapConfig?.revenueSource;
      // Accept the legacy "kingsroad" value too, in case this provider hasn't
      // been re-saved through the UI since the Visymo rename (upcast() only
      // normalizes on load through loadFeedProviders(), which this KV read bypasses).
      if (src !== "visymo" && src !== "kingsroad" && src !== "predicto") continue;
      const normalized = src === "kingsroad" ? "visymo" : src;
      for (const id of p.snapConfig?.allowedAdAccountIds ?? []) {
        map.set(id, normalized);
      }
    }
    console.log(`[provider-network] mapped ${map.size} accounts from ${providers.length} providers`);
  } catch (err) {
    console.error("[provider-network] error:", err);
  }
  return map;
}
