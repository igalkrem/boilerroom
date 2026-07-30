import type { MetaAdAccount } from "@/types/meta";

import { GRAPH_BASE } from "./graph-version";

export type { MetaAdAccount };

/**
 * The billing currency for one ad account. Needed by the reporting sync because
 * Insights reports spend and action values in this currency, not USD.
 *
 * Falls back to "USD" rather than throwing: a missing currency must not abort a
 * stats sync, and USD matches every account that has synced to date.
 */
export async function getAdAccountCurrency(adAccountId: string, accessToken: string): Promise<string> {
  const id = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${id}?fields=currency&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { currency?: string };
    return data.currency?.toUpperCase() || "USD";
  } catch (err) {
    console.warn(`[meta/adaccounts] currency lookup failed for ${id}, assuming USD:`, err);
    return "USD";
  }
}

export async function getMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const accounts: MetaAdAccount[] = [];
  let url: string | null =
    `${GRAPH_BASE}/me/adaccounts?fields=id,account_id,name,account_status,currency,timezone_name,business{id,name}&limit=100&access_token=${encodeURIComponent(accessToken)}`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Meta ad accounts fetch failed: ${body}`);
    }
    const data = (await res.json()) as {
      data: MetaAdAccount[];
      paging?: { next?: string };
    };
    accounts.push(...data.data);
    url = data.paging?.next ?? null;
  }

  return accounts;
}
