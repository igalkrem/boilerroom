import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession, isSessionValid } from "@/lib/session";
import { getProviderNetworkMap } from "@/lib/reporting/provider-network";

export const dynamic = "force-dynamic";

async function getNetworkForAccount(
  id: string,
  providerMap: Map<string, "visymo" | "predicto">
): Promise<"visymo" | "predicto" | "unknown"> {
  // 1. Explicit provider config (authoritative)
  const fromProvider = providerMap.get(id);
  if (fromProvider) return fromProvider;

  // 2. DB join fallback
  const [kr, pred] = await Promise.all([
    sql`SELECT 1 FROM snapchat_ad_squad_stats sas
        INNER JOIN visymo_report kr ON kr.custom_channel_name = sas.ad_squad_id
        WHERE sas.ad_account_id = ${id} LIMIT 1`,
    sql`SELECT 1 FROM snapchat_ad_squad_stats sas
        INNER JOIN feed_provider_channels fpc ON fpc.ad_squad_snap_id = sas.ad_squad_id
        WHERE sas.ad_account_id = ${id} LIMIT 1`,
  ]);
  if (kr.rows.length > 0) return "visymo";
  if (pred.rows.length > 0) return "predicto";
  return "unknown";
}

async function maxSnapSyncForAccounts(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const results = await Promise.all(
    ids.map((id) =>
      sql`SELECT MAX(last_synced) as ts FROM report_sync_log
          WHERE source = 'snapchat' AND ad_account_id = ${id} AND sync_date >= CURRENT_DATE - 1`
    )
  );
  const timestamps = results.flatMap((r) =>
    r.rows[0]?.ts ? [new Date(r.rows[0].ts as string).getTime()] : []
  );
  return timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;
}

export async function GET() {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const accountIds: string[] = session.allowedAdAccountIds ?? [];

  const [krFeed, predFeed] = await Promise.all([
    sql`SELECT MAX(last_synced) as ts FROM report_sync_log
        WHERE source = 'visymo' AND sync_date >= CURRENT_DATE - 1`,
    sql`SELECT MAX(last_synced) as ts FROM report_sync_log
        WHERE source = 'predicto' AND sync_date >= CURRENT_DATE - 1`,
  ]);

  const visymoFeedTs: string | null = krFeed.rows[0]?.ts
    ? new Date(krFeed.rows[0].ts as string).toISOString()
    : null;
  const predictoFeedTs: string | null = predFeed.rows[0]?.ts
    ? new Date(predFeed.rows[0].ts as string).toISOString()
    : null;

  const providerMap = await getProviderNetworkMap(session.googleUserId ?? "");
  const networkMap = await Promise.all(accountIds.map((id) => getNetworkForAccount(id, providerMap).then((n) => ({ id, n }))));
  const krAccountIds = networkMap.filter((x) => x.n === "visymo").map((x) => x.id);
  const predAccountIds = networkMap.filter((x) => x.n === "predicto").map((x) => x.id);
  // Accounts not yet classified by DB data — include in both groups so they show some status
  const unknownIds = networkMap.filter((x) => x.n === "unknown").map((x) => x.id);

  const [krSnapTs, predSnapTs] = await Promise.all([
    maxSnapSyncForAccounts([...krAccountIds, ...unknownIds]),
    maxSnapSyncForAccounts([...predAccountIds, ...unknownIds]),
  ]);

  function inSync(feedTs: string | null, snapTs: string | null): boolean {
    if (!feedTs || !snapTs) return false;
    return new Date(snapTs) >= new Date(feedTs);
  }

  return NextResponse.json({
    visymo: {
      feedLastSynced: visymoFeedTs,
      snapLastSynced: krSnapTs,
      inSync: inSync(visymoFeedTs, krSnapTs),
    },
    predicto: {
      feedLastSynced: predictoFeedTs,
      snapLastSynced: predSnapTs,
      inSync: inSync(predictoFeedTs, predSnapTs),
    },
  });
}
