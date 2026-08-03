import { readUserMetadata } from "@/lib/db/user-metadata";

/**
 * Fetches the user's feed provider config and returns a map of
 * adAccountId → "visymo" | "predicto" for accounts where revenueSource is set.
 * Non-fatal: returns an empty map on any error so callers fall back to DB joins.
 */
export async function getProviderNetworkMap(
  googleUserId: string
): Promise<Map<string, "visymo" | "predicto">> {
  const map = new Map<string, "visymo" | "predicto">();
  try {
    const raw = await readUserMetadata(googleUserId, "br_feed_providers");
    if (!Array.isArray(raw)) {
      console.log(`[provider-network] no feed provider config stored for ${googleUserId}`);
      return map;
    }
    const providers = raw as Array<{
      snapConfig?: { revenueSource?: string; allowedAdAccountIds?: string[] };
    }>;
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
