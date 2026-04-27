import { type NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isAdAccountAllowed } from "@/lib/session";
import { sql } from "@/lib/db";
import { getEurToUsd } from "@/lib/fx-rate";
import { getCampaigns } from "@/lib/snapchat/campaigns";
import { getAdSquads } from "@/lib/snapchat/adsquads";

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
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const adAccountId = searchParams.get("adAccountId") ?? "";
  const startDate = searchParams.get("startDate") ?? "";
  const endDate = searchParams.get("endDate") ?? "";
  const country = searchParams.get("country") ?? "";

  if (!adAccountId || !startDate || !endDate) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }
  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [eurToUsd, { rows }] = await Promise.all([
    getEurToUsd(),
    sql`
      SELECT
        s.ad_squad_id,
        s.stat_date::text                    AS stat_date,
        s.country_code,
        SUM(s.impressions)::bigint           AS impressions,
        SUM(s.swipes)::bigint                AS swipes,
        SUM(s.spend_micro)::bigint           AS spend_micro,
        SUM(s.video_views)::bigint           AS video_views,
        COALESCE(SUM(k.clicks), 0)::bigint   AS clicks,
        COALESCE(SUM(k.earnings_eur), 0)     AS earnings_eur,
        COALESCE(SUM(k.page_views), 0)::bigint AS page_views
      FROM snapchat_ad_squad_stats s
      LEFT JOIN kingsroad_report k
        ON  s.ad_squad_id  = k.custom_channel_name
        AND s.stat_date    = k.record_date
        AND s.country_code = k.country_code
      WHERE s.ad_account_id = ${adAccountId}
        AND s.stat_date BETWEEN ${startDate} AND ${endDate}
        AND (${country} = '' OR s.country_code = ${country})
      GROUP BY s.ad_squad_id, s.stat_date, s.country_code
      ORDER BY s.stat_date DESC, SUM(s.spend_micro) DESC
    `,
  ]);

  // Resolve ad squad names from Snapchat API.
  const nameMap = new Map<string, string>();
  try {
    const campaigns = await getCampaigns(adAccountId);
    const adSquadLists = await Promise.all(campaigns.map((c) => getAdSquads(c.id)));
    for (const squad of adSquadLists.flat()) {
      nameMap.set(squad.id, squad.name);
    }
  } catch (err) {
    console.error("[reporting/combined] name resolution failed:", err);
  }

  const combined: CombinedRow[] = rows.map((r) => {
    const spendUsd = Number(r.spend_micro) / 1_000_000;
    const revenueEur = Number(r.earnings_eur);
    const revenueUsd = revenueEur * eurToUsd;
    const roiPct = spendUsd > 0 ? ((revenueUsd - spendUsd) / spendUsd) * 100 : null;
    return {
      ad_squad_id: r.ad_squad_id as string,
      ad_squad_name: nameMap.get(r.ad_squad_id as string) ?? r.ad_squad_id as string,
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
    };
  });

  return NextResponse.json({ rows: combined, eur_to_usd: eurToUsd });
}
