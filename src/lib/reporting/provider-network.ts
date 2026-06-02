import { list, getDownloadUrl } from "@vercel/blob";

/**
 * Fetches the user's feed provider config from KV and returns a map of
 * adAccountId → "kingsroad" | "predicto" for accounts where revenueSource is set.
 * Non-fatal: returns an empty map on any error so callers fall back to DB joins.
 */
export async function getProviderNetworkMap(
  googleUserId: string
): Promise<Map<string, "kingsroad" | "predicto">> {
  const map = new Map<string, "kingsroad" | "predicto">();
  try {
    const path = `metadata/${googleUserId}/br_feed_providers.json`;
    const { blobs } = await list({ prefix: path });
    const blob = blobs.find((b) => b.pathname === path);
    if (!blob) return map;
    const downloadUrl = await getDownloadUrl(blob.url);
    const res = await fetch(downloadUrl, { cache: "no-store" });
    if (!res.ok) return map;
    const providers: Array<{
      snapConfig?: { revenueSource?: string; allowedAdAccountIds?: string[] };
    }> = await res.json();
    for (const p of providers) {
      const src = p.snapConfig?.revenueSource;
      if (src !== "kingsroad" && src !== "predicto") continue;
      for (const id of p.snapConfig?.allowedAdAccountIds ?? []) {
        map.set(id, src);
      }
    }
  } catch {
    // Non-fatal — callers fall back to DB join classification
  }
  return map;
}
