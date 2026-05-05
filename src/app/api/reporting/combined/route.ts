import { type NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isAdAccountAllowed } from "@/lib/session";
import { runMigrations, sql } from "@/lib/db";
import { getEurToUsd } from "@/lib/fx-rate";

export interface CombinedRow {
  ad_squad_id: string;
  ad_squad_name: string;
  stat_date: string;
  country_code: string;
  impressions: number;
  swipes: number;
  spend_usd: number;
  video_views: number;
  clicks: number;
  revenue_eur: number;
  revenue_usd: number;
  roi_pct: number | null;
  page_views: number;
  ad_requests: number;
  matched_ad_requests: number;
  funnel_clicks: number;
  funnel_impressions: number;
  funnel_requests: number;
  domain_name: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const adAccountId = searchParams.get("adAccountId") ?? "";
  const startDate = searchParams.get("startDate") ?? "";
  const endDate = searchParams.get("endDate") ?? "";

  if (!adAccountId || !DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
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
        COALESCE(NULLIF(s.ad_squad_name, ''), s.ad_squad_id) AS ad_squad_name,
        s.stat_date::text                         AS stat_date,
        s.country_code,
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
        COALESCE(k.domain_name, '')               AS domain_name
      FROM snapchat_ad_squad_stats s
      LEFT JOIN (
        SELECT
          custom_channel_name,
          record_date,
          SUM(clicks)::bigint                AS clicks,
          SUM(earnings_eur)                  AS earnings_eur,
          SUM(page_views)::bigint            AS page_views,
          SUM(ad_requests)::bigint           AS ad_requests,
          SUM(matched_ad_requests)::bigint   AS matched_ad_requests,
          SUM(funnel_clicks)::bigint         AS funnel_clicks,
          SUM(funnel_impressions)::bigint    AS funnel_impressions,
          SUM(funnel_requests)::bigint       AS funnel_requests,
          MIN(NULLIF(domain_name, ''))        AS domain_name
        FROM kingsroad_report
        GROUP BY custom_channel_name, record_date
      ) k
        ON  s.ad_squad_id  = k.custom_channel_name
        AND s.stat_date    = k.record_date
      WHERE s.ad_account_id = ${adAccountId}
        AND s.stat_date BETWEEN ${startDate} AND ${endDate}
      ORDER BY s.stat_date DESC, s.spend_micro DESC
    `,
  ]);

  const combined: CombinedRow[] = rows.map((r) => {
    const spendUsd = Number(r.spend_micro) / 1_000_000;
    const revenueEur = Number(r.earnings_eur);
    const revenueUsd = revenueEur * eurToUsd;
    const roiPct = spendUsd > 0 ? (revenueUsd / spendUsd) * 100 : null;
    return {
      ad_squad_id: r.ad_squad_id as string,
      ad_squad_name: r.ad_squad_name as string,
      stat_date: r.stat_date as string,
      country_code: r.country_code as string,
      impressions: Number(r.impressions),
      swipes: Number(r.swipes),
      spend_usd: spendUsd,
      video_views: Number(r.video_views),
      clicks: Number(r.clicks),
      revenue_eur: revenueEur,
      revenue_usd: revenueUsd,
      roi_pct: roiPct,
      page_views: Number(r.page_views),
      ad_requests: Number(r.ad_requests),
      matched_ad_requests: Number(r.matched_ad_requests),
      funnel_clicks: Number(r.funnel_clicks),
      funnel_impressions: Number(r.funnel_impressions),
      funnel_requests: Number(r.funnel_requests),
      domain_name: r.domain_name as string,
    };
  });

  return NextResponse.json({ rows: combined, eur_to_usd: eurToUsd });
}
