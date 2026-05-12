import { runMigrations, sql } from "@/lib/db";
import { fetchKingsRoadReport } from "@/lib/kingsroad";
import { fetchPredictoReport } from "@/lib/predicto";
import { getAdSquadsByAccount } from "@/lib/snapchat/adsquads";
import { getAdSquadStats } from "@/lib/snapchat/stats";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function shouldSkip(source: string, date: string, adAccountId: string): Promise<boolean> {
  const { rows } = await sql`
    SELECT last_synced FROM report_sync_log
    WHERE source = ${source} AND sync_date = ${date} AND ad_account_id = ${adAccountId}
  `;
  if (rows.length === 0) return false;

  const raw = rows[0].last_synced;
  const lastSynced = (raw instanceof Date ? raw : new Date(raw as string)).getTime();
  const dateObj = new Date(date);
  const yesterday = new Date();
  yesterday.setUTCHours(0, 0, 0, 0);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  if (dateObj < yesterday) return true;
  return Date.now() - lastSynced < 60 * 60 * 1000;
}

async function markSynced(source: string, date: string, adAccountId: string) {
  await sql`
    INSERT INTO report_sync_log (source, sync_date, ad_account_id, last_synced)
    VALUES (${source}, ${date}, ${adAccountId}, NOW())
    ON CONFLICT (source, sync_date, ad_account_id)
    DO UPDATE SET last_synced = NOW()
  `;
}

export function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

export function buildRanges(dates: string[]): Array<[string, string]> {
  if (dates.length === 0) return [];
  const ranges: Array<[string, string]> = [];
  let rangeStart = dates[0];
  let rangeEnd = dates[0];
  for (let i = 1; i < dates.length; i++) {
    const gapDays = (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86_400_000;
    if (gapDays === 1) {
      rangeEnd = dates[i];
    } else {
      ranges.push([rangeStart, rangeEnd]);
      rangeStart = dates[i];
      rangeEnd = dates[i];
    }
  }
  ranges.push([rangeStart, rangeEnd]);
  return ranges;
}

// ── Core sync function ───────────────────────────────────────────────────────

export interface SyncResult {
  snapchat: { synced: number; skipped: number; error: string | null };
  kingsroad: { synced: number; skipped: number };
  predicto: { synced: number; skipped: number };
  debug: {
    squads_found: number;
    squad_ids: Array<{ id: string; name: string }>;
    stat_rows_fetched: number;
    squad_errors: Array<{ id: string; error: string }>;
    dates_attempted: string[];
  };
}

export async function syncAccount(
  adAccountId: string,
  startDate: string,
  endDate: string,
  timezone: string,
  accessToken?: string, // undefined = use session (normal user request); string = cron token
  force = false
): Promise<SyncResult> {
  await runMigrations();

  const dates = dateRange(startDate, endDate);
  let snapchatSynced = 0;
  let snapchatSkipped = 0;
  let kingsroadSynced = 0;
  let kingsroadSkipped = 0;
  let predictoSynced = 0;
  let predictoSkipped = 0;

  // ── KingsRoad ─────────────────────────────────────────────────────────────
  const kingsroadDatesToFetch: string[] = [];
  for (const date of dates) {
    if (!force && await shouldSkip("kingsroad", date, "")) {
      kingsroadSkipped++;
    } else {
      kingsroadDatesToFetch.push(date);
    }
  }

  if (kingsroadDatesToFetch.length > 0) {
    const ranges = buildRanges(kingsroadDatesToFetch);
    try {
      for (const [krStart, krEnd] of ranges) {
        const rows = await fetchKingsRoadReport(krStart, krEnd);
        for (const r of rows) {
          await sql`
            INSERT INTO kingsroad_report
              (record_date, custom_channel_name, country_code, domain_name,
               ad_requests, clicks, earnings_eur, page_views,
               individual_ad_impressions, matched_ad_requests,
               funnel_clicks, funnel_impressions, funnel_requests, fetched_at)
            VALUES
              (${r.record_date}, ${r.custom_channel_name}, ${r.country_code}, ${r.domain_name},
               ${r.ad_requests}, ${r.clicks}, ${r.earnings_eur}, ${r.page_views},
               ${r.individual_ad_impressions}, ${r.matched_ad_requests},
               ${r.funnel_clicks}, ${r.funnel_impressions}, ${r.funnel_requests}, NOW())
            ON CONFLICT (record_date, custom_channel_name, country_code, domain_name)
            DO UPDATE SET
              ad_requests = EXCLUDED.ad_requests,
              clicks = EXCLUDED.clicks,
              earnings_eur = EXCLUDED.earnings_eur,
              page_views = EXCLUDED.page_views,
              individual_ad_impressions = EXCLUDED.individual_ad_impressions,
              matched_ad_requests = EXCLUDED.matched_ad_requests,
              funnel_clicks = EXCLUDED.funnel_clicks,
              funnel_impressions = EXCLUDED.funnel_impressions,
              funnel_requests = EXCLUDED.funnel_requests,
              fetched_at = NOW()
          `;
        }
      }
      for (const date of kingsroadDatesToFetch) {
        await markSynced("kingsroad", date, "");
        kingsroadSynced++;
      }
    } catch (err) {
      console.error("[reporting/sync] KingsRoad fetch error:", err);
    }
  }

  // ── Predicto ──────────────────────────────────────────────────────────────
  const predictoDatesToFetch: string[] = [];
  for (const date of dates) {
    if (!force && await shouldSkip("predicto", date, "")) {
      predictoSkipped++;
    } else {
      predictoDatesToFetch.push(date);
    }
  }

  if (predictoDatesToFetch.length > 0) {
    const ranges = buildRanges(predictoDatesToFetch);
    try {
      for (const [pStart, pEnd] of ranges) {
        const rows = await fetchPredictoReport(pStart, pEnd);
        for (const r of rows) {
          await sql`
            INSERT INTO predicto_report
              (record_date, custom_channel_id,
               revenue_usd, clicks, funnel_clicks, funnel_impressions, funnel_requests, requests, impressions,
               fetched_at)
            VALUES
              (${r.date}, ${r.custom_channel_id},
               ${r.revenue_usd}, ${r.clicks}, ${r.funnel_clicks}, ${r.funnel_impressions},
               ${r.funnel_requests}, ${r.requests}, ${r.impressions}, NOW())
            ON CONFLICT (record_date, custom_channel_id)
            DO UPDATE SET
              revenue_usd        = EXCLUDED.revenue_usd,
              clicks             = EXCLUDED.clicks,
              funnel_clicks      = EXCLUDED.funnel_clicks,
              funnel_impressions = EXCLUDED.funnel_impressions,
              funnel_requests    = EXCLUDED.funnel_requests,
              requests           = EXCLUDED.requests,
              impressions        = EXCLUDED.impressions,
              fetched_at         = NOW()
          `;
        }
      }
      for (const date of predictoDatesToFetch) {
        await markSynced("predicto", date, "");
        predictoSynced++;
      }
    } catch (err) {
      console.error("[reporting/sync] Predicto fetch error:", err);
    }
  }

  // ── Snapchat ──────────────────────────────────────────────────────────────
  const snapDatesToFetch: string[] = [];
  for (const date of dates) {
    if (!force && await shouldSkip("snapchat", date, adAccountId)) {
      snapchatSkipped++;
    } else {
      snapDatesToFetch.push(date);
    }
  }

  let debugSquads: Array<{ id: string; name: string }> = [];
  let debugStatRows = 0;
  let snapchatError: string | null = null;
  const debugSquadErrors: Array<{ id: string; error: string }> = [];

  try {
    const adSquads = await getAdSquadsByAccount(adAccountId, accessToken);
    debugSquads = adSquads.map((s) => ({ id: s.id, name: s.name }));

    // Always backfill names for existing rows.
    await Promise.allSettled(
      adSquads.map((squad) =>
        sql`UPDATE snapchat_ad_squad_stats
            SET ad_squad_name = ${squad.name}
            WHERE ad_squad_id = ${squad.id} AND ad_account_id = ${adAccountId} AND ad_squad_name = ''`
      )
    );

    if (snapDatesToFetch.length > 0) {
      const snapStart = snapDatesToFetch[0];
      const snapEnd = snapDatesToFetch[snapDatesToFetch.length - 1];

      // Fetch stats for all squads (active and paused) — a paused squad may have
      // un-synced historical spend from dates when it was still active.
      await Promise.all(
        adSquads.map(async (squad) => {
          try {
            const statRows = await getAdSquadStats(squad.id, snapStart, snapEnd, timezone, accessToken);
            debugStatRows += statRows.length;
            for (const r of statRows) {
              await sql`
                INSERT INTO snapchat_ad_squad_stats
                  (ad_squad_id, ad_account_id, ad_squad_name, stat_date, country_code,
                   impressions, swipes, spend_micro, video_views,
                   conversion_purchases, conversion_purchase_value, fetched_at)
                VALUES
                  (${squad.id}, ${adAccountId}, ${squad.name}, ${r.date}, ${r.country_code},
                   ${r.impressions}, ${r.swipes}, ${r.spend_micro}, ${r.video_views},
                   ${r.conversion_purchases}, ${r.conversion_purchase_value_micro}, NOW())
                ON CONFLICT (ad_squad_id, stat_date, country_code)
                DO UPDATE SET
                  ad_squad_name = EXCLUDED.ad_squad_name,
                  impressions = EXCLUDED.impressions,
                  swipes = EXCLUDED.swipes,
                  spend_micro = EXCLUDED.spend_micro,
                  video_views = EXCLUDED.video_views,
                  conversion_purchases = EXCLUDED.conversion_purchases,
                  conversion_purchase_value = EXCLUDED.conversion_purchase_value,
                  fetched_at = NOW()
              `;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[reporting/sync] stats error for squad ${squad.id}:`, err);
            debugSquadErrors.push({ id: squad.id, error: msg });
          }
        })
      );

      const allSquadsFailed = adSquads.length > 0 && debugSquadErrors.length === adSquads.length;
      if (!allSquadsFailed) {
        for (const date of snapDatesToFetch) {
          await markSynced("snapchat", date, adAccountId);
          snapchatSynced++;
        }
      }
    }
  } catch (err) {
    snapchatError = err instanceof Error ? err.message : String(err);
    console.error("[reporting/sync] Snapchat fetch error:", err);
  }

  return {
    snapchat: { synced: snapchatSynced, skipped: snapchatSkipped, error: snapchatError },
    kingsroad: { synced: kingsroadSynced, skipped: kingsroadSkipped },
    predicto: { synced: predictoSynced, skipped: predictoSkipped },
    debug: {
      squads_found: debugSquads.length,
      squad_ids: debugSquads,
      stat_rows_fetched: debugStatRows,
      squad_errors: debugSquadErrors,
      dates_attempted: snapDatesToFetch,
    },
  };
}
