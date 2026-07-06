import type { MetaAdAccount } from "@/types/meta";

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

export type { MetaAdAccount };

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
