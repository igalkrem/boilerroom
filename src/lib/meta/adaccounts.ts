import type { MetaAdAccount } from "@/types/meta";

const META_GRAPH_BASE = "https://graph.facebook.com/v19.0";

// Fetches all ad accounts accessible to the authenticated Meta user.
// Takes an explicit accessToken rather than reading from session so this
// function is usable both from API routes (session token) and from the cron (DB token).
export async function getMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const params = new URLSearchParams({
    fields: "id,name,account_status,currency,timezone_name",
    access_token: accessToken,
    limit: "200",
  });

  const accounts: MetaAdAccount[] = [];
  let url: string | null = `${META_GRAPH_BASE}/me/adaccounts?${params.toString()}`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Meta ad accounts fetch failed: ${res.status} ${body}`);
    }
    const data = await res.json() as {
      data: MetaAdAccount[];
      paging?: { next?: string };
    };
    accounts.push(...(data.data ?? []));
    url = data.paging?.next ?? null;
  }

  return accounts;
}
