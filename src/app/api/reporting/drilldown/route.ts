import { type NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isAdAccountAllowed } from "@/lib/session";
import { runMigrations, sql } from "@/lib/db";
import { getEurToUsd } from "@/lib/fx-rate";
import type { CombinedRow } from "@/app/api/reporting/combined/route";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const { searchParams } = request.nextUrl;
  const adAccountId = searchParams.get("adAccountId") ?? "";
  const adSquadId = searchParams.get("adSquadId") ?? "";

  if (!adAccountId || !adSquadId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }
  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await runMigrations();

  const [eurToUsd, { rows }] = await Promise.all([
    getEurToUsd(),
    sql`
      SELECT
        s.ad_squad_id,
        s.ad_account_id,
        COALESCE(NULLIF(s.ad_squad_name, ''), s.ad_squad_id) AS ad_squad_name,
        s.stat_date::text                         AS stat_date,
        ''                                        AS country_code, /* drilldown is per-squad, no country breakdown */
        s.impressions::bigint                     AS impressions,
        s.swipes::bigint                          AS swipes,
        s.spend_micro::bigint                     AS spend_micro,
        s.video_views::bigint                     AS video_views,
        COALESCE(k.clicks, 0)::bigint             AS clicks,
        COALESCE(k.earnings_eur, 0)               AS earnings_eur,
        COALESCE(k.page_views, 0)::bigint         AS page_views,
        COALESCE(k.ad_requests, 0)::bigint        AS ad_requests,
        COALESCE(k.matched_ad_requests, 0)::bigint AS matched_ad_requests,
        COALESCE(k.funnel_clicks, 0)::bigint      AS funnel_clicks,
        COALESCE(k.funnel_impressions, 0)::bigint AS funnel_impressions,
        COALESCE(k.funnel_requests, 0)::bigint    AS funnel_requests,
        COALESCE(k.domain_name, '')               AS domain_name,
        s.conversion_purchases::bigint            AS conversion_purchases,
        s.conversion_purchase_value::bigint       AS conversion_purchase_value,
        COALESCE(k.individual_ad_impressions, 0)::bigint AS individual_ad_impressions,
        COALESCE(p.revenue_usd, 0)               AS predicto_revenue_usd,
        COALESCE(p.clicks, 0)::bigint            AS predicto_clicks,
        COALESCE(p.funnel_clicks, 0)::bigint     AS predicto_funnel_clicks,
        COALESCE(p.funnel_impressions, 0)::bigint AS predicto_funnel_impressions,
        COALESCE(p.funnel_requests, 0)::bigint   AS predicto_funnel_requests,
        COALESCE(p.requests, 0)::bigint          AS predicto_requests,
        COALESCE(p.impressions, 0)::bigint       AS predicto_impressions,
        COALESCE(fpc.feed_provider_id, '')       AS feed_provider_id
      FROM snapchat_ad_squad_stats s
      LEFT JOIN (
        SELECT
          custom_channel_name,
          record_date,
          SUM(clicks)::bigint                AS clicks,
          SUM(earnings_eur)                  AS earnings_eur,
          SUM(page_views)::bigint            AS page_views,
          SUM(ad_requests)::bigint                AS ad_requests,
          SUM(matched_ad_requests)::bigint        AS matched_ad_requests,
          SUM(individual_ad_impressions)::bigint  AS individual_ad_impressions,
          SUM(funnel_clicks)::bigint              AS funnel_clicks,
          SUM(funnel_impressions)::bigint         AS funnel_impressions,
          SUM(funnel_requests)::bigint            AS funnel_requests,
          MIN(NULLIF(domain_name, ''))            AS domain_name
        FROM kingsroad_report
        GROUP BY custom_channel_name, record_date
      ) k
        ON  s.ad_squad_id  = k.custom_channel_name
        AND s.stat_date    = k.record_date
      LEFT JOIN LATERAL (
        SELECT channel_id, feed_provider_id
        FROM (
          SELECT channel_id, feed_provider_id, 0 AS _p
          FROM feed_provider_channels
          WHERE ad_squad_snap_id = s.ad_squad_id
          UNION ALL
          SELECT channel_id, feed_provider_id, 1 AS _p
          FROM feed_provider_channels
          WHERE channel_id != ''
            AND ad_squad_snap_id IS DISTINCT FROM s.ad_squad_id
            AND s.ad_squad_name ILIKE '%' || REPLACE(REPLACE(channel_id, '%', '\%'), '_', '\_') || '%'
        ) _fpc_inner
        ORDER BY _p
        LIMIT 1
      ) fpc ON true
      LEFT JOIN (
        SELECT
          custom_channel_id,
          record_date,
          SUM(revenue_usd)               AS revenue_usd,
          SUM(clicks)::bigint            AS clicks,
          SUM(funnel_clicks)::bigint     AS funnel_clicks,
          SUM(funnel_impressions)::bigint AS funnel_impressions,
          SUM(funnel_requests)::bigint   AS funnel_requests,
          SUM(requests)::bigint          AS requests,
          SUM(impressions)::bigint       AS impressions
        FROM predicto_report
        GROUP BY custom_channel_id, record_date
      ) p
        ON  p.custom_channel_id = SPLIT_PART(fpc.channel_id, '+', 1)
        AND p.record_date       = s.stat_date
      WHERE s.ad_account_id = ${adAccountId}
        AND s.ad_squad_id   = ${adSquadId}
      ORDER BY s.stat_date DESC
    `,
  ]);

  const combined: CombinedRow[] = rows.map((r) => {
    const spendUsd = Number(r.spend_micro) / 1_000_000;
    const revenueEur = Number(r.earnings_eur);
    const revenueUsd = revenueEur * eurToUsd + Number(r.predicto_revenue_usd);
    const roiPct = spendUsd > 0 ? (revenueUsd / spendUsd) * 100 : null;
    return {
      ad_squad_id: r.ad_squad_id as string,
      ad_account_id: r.ad_account_id as string,
      ad_squad_name: r.ad_squad_name as string,
      stat_date: r.stat_date as string,
      country_code: r.country_code as string,
      impressions: Number(r.impressions),
      swipes: Number(r.swipes),
      spend_usd: spendUsd,
      video_views: Number(r.video_views),
      clicks: Number(r.clicks) + Number(r.predicto_clicks),
      revenue_eur: revenueEur,
      revenue_usd: revenueUsd,
      roi_pct: roiPct,
      page_views: Number(r.page_views),
      ad_requests: Number(r.ad_requests),
      matched_ad_requests: Number(r.matched_ad_requests),
      requests: Number(r.ad_requests) + Number(r.predicto_requests),
      feed_impressions: Number(r.individual_ad_impressions) + Number(r.predicto_impressions),
      funnel_clicks: Number(r.funnel_clicks) + Number(r.predicto_funnel_clicks),
      funnel_impressions: Number(r.funnel_impressions) + Number(r.predicto_funnel_impressions),
      funnel_requests: Number(r.funnel_requests) + Number(r.predicto_funnel_requests),
      domain_name: r.domain_name as string,
      feed_provider_id: r.feed_provider_id as string,
      snap_results: Number(r.conversion_purchases),
      snap_purchase_value_usd: Number(r.conversion_purchase_value) / 1_000_000,
    };
  });

  return NextResponse.json({ rows: combined, eur_to_usd: eurToUsd });
}
