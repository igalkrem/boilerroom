import { type NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isAdAccountAllowed } from "@/lib/session";
import { runMigrations, sql } from "@/lib/db";
import { fetchKingsRoadReport } from "@/lib/kingsroad";
import { getCampaigns } from "@/lib/snapchat/campaigns";
import { getAdSquads } from "@/lib/snapchat/adsquads";
import { getAdSquadStats } from "@/lib/snapchat/stats";

// Returns true if the date is finalized (older than 1 day) and already synced,
// OR if it was synced within the last hour (recent data — throttle re-fetches).
async function shouldSkip(
  source: string,
  date: string,
  adAccountId: string
): Promise<boolean> {
  const { rows } = await sql`
    SELECT last_synced FROM report_sync_log
    WHERE source = ${source} AND sync_date = ${date} AND ad_account_id = ${adAccountId}
  `;
  if (rows.length === 0) return false;

  const lastSynced = new Date(rows[0].last_synced as string).getTime();
  const dateObj = new Date(date);
  const yesterday = new Date();
  yesterday.setUTCHours(0, 0, 0, 0);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  // Finalized (older than yesterday): never re-fetch.
  if (dateObj < yesterday) return true;

  // Recent: re-fetch at most once per hour.
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

function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await request.json() as { adAccountId?: string; startDate?: string; endDate?: string };
  const { adAccountId, startDate, endDate } = body;

  if (!adAccountId || !startDate || !endDate) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }
  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await runMigrations();

  const dates = dateRange(startDate, endDate);
  let snapchatSynced = 0;
  let snapchatSkipped = 0;
  let kingsroadSynced = 0;
  let kingsroadSkipped = 0;

  // ── KingsRoad: fetch per-date if needed ──────────────────────────────────
  const kingsroadDatesToFetch: string[] = [];
  for (const date of dates) {
    if (await shouldSkip("kingsroad", date, "")) {
      kingsroadSkipped++;
    } else {
      kingsroadDatesToFetch.push(date);
    }
  }

  if (kingsroadDatesToFetch.length > 0) {
    const krStart = kingsroadDatesToFetch[0];
    const krEnd = kingsroadDatesToFetch[kingsroadDatesToFetch.length - 1];
    try {
      const rows = await fetchKingsRoadReport(krStart, krEnd);
      for (const r of rows) {
        await sql`
          INSERT INTO kingsroad_report
            (record_date, custom_channel_name, country_code, domain_name,
             ad_requests, clicks, earnings_eur, page_views,
             individual_ad_impressions, matched_ad_requests,
             funnel_clicks, funnel_impressions, fetched_at)
          VALUES
            (${r.record_date}, ${r.custom_channel_name}, ${r.country_code}, ${r.domain_name},
             ${r.ad_requests}, ${r.clicks}, ${r.earnings_eur}, ${r.page_views},
             ${r.individual_ad_impressions}, ${r.matched_ad_requests},
             ${r.funnel_clicks}, ${r.funnel_impressions}, NOW())
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
            fetched_at = NOW()
        `;
      }
      for (const date of kingsroadDatesToFetch) {
        await markSynced("kingsroad", date, "");
        kingsroadSynced++;
      }
    } catch (err) {
      console.error("[reporting/sync] KingsRoad fetch error:", err);
    }
  }

  // ── Snapchat: list all ad squads, fetch stats per squad ──────────────────
  const snapDatesToFetch: string[] = [];
  for (const date of dates) {
    if (await shouldSkip("snapchat", date, adAccountId)) {
      snapchatSkipped++;
    } else {
      snapDatesToFetch.push(date);
    }
  }

  if (snapDatesToFetch.length > 0) {
    const snapStart = snapDatesToFetch[0];
    const snapEnd = snapDatesToFetch[snapDatesToFetch.length - 1];
    try {
      const campaigns = await getCampaigns(adAccountId);
      const adSquadLists = await Promise.all(
        campaigns.map((c) => getAdSquads(c.id))
      );
      const adSquads = adSquadLists.flat();

      await Promise.all(
        adSquads.map(async (squad) => {
          try {
            const statRows = await getAdSquadStats(squad.id, snapStart, snapEnd);
            for (const r of statRows) {
              await sql`
                INSERT INTO snapchat_ad_squad_stats
                  (ad_squad_id, ad_account_id, stat_date, country_code,
                   impressions, swipes, spend_micro, video_views, fetched_at)
                VALUES
                  (${squad.id}, ${adAccountId}, ${r.date}, ${r.country_code},
                   ${r.impressions}, ${r.swipes}, ${r.spend_micro}, ${r.video_views}, NOW())
                ON CONFLICT (ad_squad_id, stat_date, country_code)
                DO UPDATE SET
                  impressions = EXCLUDED.impressions,
                  swipes = EXCLUDED.swipes,
                  spend_micro = EXCLUDED.spend_micro,
                  video_views = EXCLUDED.video_views,
                  fetched_at = NOW()
              `;
            }
          } catch (err) {
            console.error(`[reporting/sync] stats error for squad ${squad.id}:`, err);
          }
        })
      );

      for (const date of snapDatesToFetch) {
        await markSynced("snapchat", date, adAccountId);
        snapchatSynced++;
      }
    } catch (err) {
      console.error("[reporting/sync] Snapchat fetch error:", err);
    }
  }

  return NextResponse.json({
    snapchat: { synced: snapchatSynced, skipped: snapchatSkipped },
    kingsroad: { synced: kingsroadSynced, skipped: kingsroadSkipped },
  });
}
