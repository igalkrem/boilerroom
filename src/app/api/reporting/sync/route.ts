import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, isSessionValid, isSnapchatConnected, isAdAccountAllowed } from "@/lib/session";
import { runMigrations, sql } from "@/lib/db";
import { fetchKingsRoadReport } from "@/lib/kingsroad";
import { getCampaigns } from "@/lib/snapchat/campaigns";
import { getAdSquads } from "@/lib/snapchat/adsquads";
import type { SnapAdSquad } from "@/types/snapchat";
import { getAdSquadStats } from "@/lib/snapchat/stats";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const syncBodySchema = z.object({
  adAccountId: z.string().min(1),
  startDate: z.string().regex(DATE_RE, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(DATE_RE, "endDate must be YYYY-MM-DD"),
  timezone: z.string().optional(),
  force: z.boolean().optional(),
}).refine((d) => {
  const start = new Date(d.startDate);
  const end = new Date(d.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 90;
}, { message: "Date range must be between 0 and 90 days" });

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

  const raw = rows[0].last_synced;
  const lastSynced = (raw instanceof Date ? raw : new Date(raw as string)).getTime();
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

function buildRanges(dates: string[]): Array<[string, string]> {
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

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
  }


  const rawBody = await request.json().catch(() => null);
  const parsed = syncBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { adAccountId, startDate, endDate, timezone = "America/Los_Angeles", force = false } = parsed.data;

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

  // ── Snapchat: list all ad squads, always backfill names, fetch stats if needed ──
  const snapDatesToFetch: string[] = [];
  for (const date of dates) {
    if (!force && await shouldSkip("snapchat", date, adAccountId)) {
      snapchatSkipped++;
    } else {
      snapDatesToFetch.push(date);
    }
  }

  let debugCampaigns: string[] = [];
  let debugSquads: Array<{ id: string; name: string }> = [];
  let debugStatRows = 0;
  let snapchatError: string | null = null;
  const debugSquadErrors: Array<{ id: string; error: string }> = [];

  try {
    const campaigns = await getCampaigns(adAccountId);
    debugCampaigns = campaigns.map((c) => c.id);
    const adSquadLists = await Promise.allSettled(
      campaigns.map((c) => getAdSquads(c.id))
    );
    const adSquads = adSquadLists
      .filter((r): r is PromiseFulfilledResult<SnapAdSquad[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);
    debugSquads = adSquads.map((s) => ({ id: s.id, name: s.name }));

    // Always backfill names for existing rows that were synced before this column existed.
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

      await Promise.all(
        adSquads.map(async (squad) => {
          try {
            const statRows = await getAdSquadStats(squad.id, snapStart, snapEnd, timezone);
            debugStatRows += statRows.length;
            for (const r of statRows) {
              await sql`
                INSERT INTO snapchat_ad_squad_stats
                  (ad_squad_id, ad_account_id, ad_squad_name, stat_date, country_code,
                   impressions, swipes, spend_micro, video_views, fetched_at)
                VALUES
                  (${squad.id}, ${adAccountId}, ${squad.name}, ${r.date}, ${r.country_code},
                   ${r.impressions}, ${r.swipes}, ${r.spend_micro}, ${r.video_views}, NOW())
                ON CONFLICT (ad_squad_id, stat_date, country_code)
                DO UPDATE SET
                  ad_squad_name = EXCLUDED.ad_squad_name,
                  impressions = EXCLUDED.impressions,
                  swipes = EXCLUDED.swipes,
                  spend_micro = EXCLUDED.spend_micro,
                  video_views = EXCLUDED.video_views,
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

  return NextResponse.json({
    snapchat: { synced: snapchatSynced, skipped: snapchatSkipped, error: snapchatError },
    kingsroad: { synced: kingsroadSynced, skipped: kingsroadSkipped },
    debug: {
      campaigns_found: debugCampaigns.length,
      squads_found: debugSquads.length,
      squad_ids: debugSquads,
      stat_rows_fetched: debugStatRows,
      squad_errors: debugSquadErrors,
      dates_attempted: snapDatesToFetch,
    },
  });
}
