import type { FeedProvider } from "@/types/feed-provider";

interface ProviderKeyRow {
  feed_provider_id: string;
  domain_name: string;
  ad_account_id: string;
}

// Three-tier provider resolution used by both PerformanceTable and PerformanceSummaryTables.
// Tier 1: feed_provider_id from DB (set via feed_provider_channels LATERAL JOIN)
// Tier 2: domain_name matched against provider.domains[].baseDomain (Visymo campaigns)
// Tier 3: ad_account_id matched against provider.snapConfig.allowedAdAccountIds (all others)
export function resolveProviderKey(r: ProviderKeyRow, providers: FeedProvider[]): string {
  if (r.feed_provider_id) return r.feed_provider_id;
  if (r.domain_name) {
    const dn = r.domain_name.toLowerCase();
    const match = providers.find(p =>
      p.domains?.some(d => {
        const base = d.baseDomain?.toLowerCase();
        return base && (dn === base || dn.endsWith("." + base));
      })
    );
    if (match) return match.id;
  }
  if (r.ad_account_id) {
    const match = providers.find(p =>
      p.snapConfig?.allowedAdAccountIds?.includes(r.ad_account_id)
    );
    if (match) return match.id;
  }
  return "__unknown__";
}
