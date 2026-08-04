import { type NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isAdAccountAllowed, isMetaAdAccountAllowed } from "@/lib/session";
import { runMigrations, sql } from "@/lib/db";
import { getEurToUsd, getRateToUsd } from "@/lib/fx-rate";
import { microToUsd, centsToUsd } from "@/lib/money";

export interface CombinedRow {
  ad_squad_id: string;
  ad_account_id: string;
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
  requests: number;
  feed_impressions: number;
  funnel_clicks: number;
  funnel_impressions: number;
  funnel_requests: number;
  domain_name: string;
  feed_provider_id: string;
  snap_results: number;
  snap_purchase_value_usd: number;
  platform: "snap" | "meta";
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
  const diffDays = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000;
  if (diffDays < 0 || diffDays > 366) {
    return NextResponse.json({ error: "date_range_too_large" }, { status: 400 });
  }
  const isSnap = isAdAccountAllowed(session, adAccountId);
  const isMeta = isMetaAdAccountAllowed(session, adAccountId);
  if (!isSnap && !isMeta) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await runMigrations();

  // Every feed_provider_channels read MUST be scoped to the caller. Without this
  // the LATERAL joins below read every tenant's channel rows, which both leaks
  // other tenants' revenue into this dashboard and lets a planted row displace a
  // victim's own attribution (the direct arm carries _p = 0 and wins).
  const userId = session.googleUserId ?? "";

  const snapQuery = isSnap
    ? sql`
      SELECT
        s.ad_squad_id,
        s.ad_account_id,
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
        FROM visymo_report
        GROUP BY custom_channel_name, record_date
      ) k
        ON  s.ad_squad_id  = k.custom_channel_name
        AND s.stat_date    = k.record_date
      LEFT JOIN LATERAL (
        SELECT channel_id, feed_provider_id
        FROM (
          SELECT channel_id, feed_provider_id, 0 AS _p
          FROM feed_provider_channels
          WHERE google_user_id = ${userId}
            AND LOWER(traffic_source) = 'snap'
            AND ad_squad_snap_id = s.ad_squad_id
          UNION ALL
          SELECT channel_id, feed_provider_id, 1 AS _p
          FROM feed_provider_channels
          WHERE google_user_id = ${userId}
            AND LOWER(traffic_source) = 'snap'
            AND channel_id != ''
            AND ad_squad_snap_id IS DISTINCT FROM s.ad_squad_id
            AND s.ad_squad_name ILIKE
                '%' || REPLACE(REPLACE(REPLACE(channel_id, '!', '!!'), '%', '!%'), '_', '!_') || '%'
                ESCAPE '!'
        ) _fpc_inner
        -- channel_id/feed_provider_id break ties within a priority tier. The unique
        -- constraint permits one channel_id under several feed_provider_ids, and an
        -- unordered LIMIT 1 let Postgres return a different provider between runs —
        -- which silently changes summary grouping, the provider filter, and which
        -- roasDisplayDivisor applies to an editable cell.
        ORDER BY _p, channel_id, feed_provider_id
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
        WHERE record_date BETWEEN ${startDate} AND ${endDate}
        GROUP BY custom_channel_id, record_date
      ) p
        ON  p.custom_channel_id = SPLIT_PART(fpc.channel_id, '+', 1)
        AND p.record_date       = s.stat_date
      WHERE s.ad_account_id = ${adAccountId}
        AND s.stat_date BETWEEN ${startDate} AND ${endDate}
        AND (s.impressions > 0 OR s.spend_micro > 0)
      ORDER BY s.stat_date DESC, s.spend_micro DESC
    `
    : Promise.resolve({ rows: [] });

  const metaQuery = isMeta
    ? sql`
      SELECT
        m.ad_set_id,
        m.ad_account_id,
        COALESCE(NULLIF(m.ad_set_name, ''), m.ad_set_id) AS ad_set_name,
        m.stat_date::text AS stat_date,
        m.impressions::bigint AS impressions,
        m.clicks::bigint AS clicks,
        m.spend_cents::bigint AS spend_cents,
        m.purchases::bigint AS purchases,
        m.purchase_value_cents::bigint AS purchase_value_cents,
        m.currency AS currency,
        COALESCE(pf.revenue_usd, 0)               AS pfb_revenue_usd,
        COALESCE(pf.clicks, 0)::bigint            AS pfb_clicks,
        COALESCE(pf.funnel_clicks, 0)::bigint     AS pfb_funnel_clicks,
        COALESCE(pf.funnel_impressions, 0)::bigint AS pfb_funnel_impressions,
        COALESCE(pf.funnel_requests, 0)::bigint   AS pfb_funnel_requests,
        COALESCE(pf.requests, 0)::bigint          AS pfb_requests,
        COALESCE(pf.impressions, 0)::bigint       AS pfb_impressions,
        COALESCE(k.earnings_eur, 0)               AS vsm_earnings_eur,
        COALESCE(k.clicks, 0)::bigint             AS vsm_clicks,
        COALESCE(k.funnel_clicks, 0)::bigint      AS vsm_funnel_clicks,
        COALESCE(k.funnel_impressions, 0)::bigint AS vsm_funnel_impressions,
        COALESCE(k.funnel_requests, 0)::bigint    AS vsm_funnel_requests,
        COALESCE(k.ad_requests, 0)::bigint        AS vsm_requests,
        COALESCE(k.individual_ad_impressions, 0)::bigint AS vsm_impressions,
        COALESCE(fpc.feed_provider_id, '')        AS feed_provider_id
      FROM meta_ad_set_stats m
      LEFT JOIN (
        SELECT
          custom_channel_name,
          record_date,
          SUM(earnings_eur)                       AS earnings_eur,
          SUM(clicks)::bigint                     AS clicks,
          SUM(ad_requests)::bigint                AS ad_requests,
          SUM(individual_ad_impressions)::bigint  AS individual_ad_impressions,
          SUM(funnel_clicks)::bigint              AS funnel_clicks,
          SUM(funnel_impressions)::bigint         AS funnel_impressions,
          SUM(funnel_requests)::bigint            AS funnel_requests
        FROM visymo_report
        WHERE record_date BETWEEN ${startDate} AND ${endDate}
        GROUP BY custom_channel_name, record_date
      ) k
        ON  k.custom_channel_name = m.ad_set_id
        AND k.record_date         = m.stat_date
      LEFT JOIN LATERAL (
        SELECT channel_id, feed_provider_id
        FROM (
          SELECT channel_id, feed_provider_id, 0 AS _p
          FROM feed_provider_channels
          WHERE google_user_id = ${userId}
            AND LOWER(traffic_source) IN ('meta', 'facebook')
            AND ad_squad_snap_id = m.ad_set_id
          UNION ALL
          SELECT channel_id, feed_provider_id, 1 AS _p
          FROM feed_provider_channels
          WHERE google_user_id = ${userId}
            AND LOWER(traffic_source) IN ('meta', 'facebook')
            AND channel_id != ''
            AND ad_squad_snap_id IS DISTINCT FROM m.ad_set_id
            AND m.ad_set_name ILIKE
                '%' || REPLACE(REPLACE(REPLACE(channel_id, '!', '!!'), '%', '!%'), '_', '!_') || '%'
                ESCAPE '!'
        ) _fpc_inner
        ORDER BY _p, channel_id, feed_provider_id
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
        FROM predicto_fb_report
        WHERE record_date BETWEEN ${startDate} AND ${endDate}
        GROUP BY custom_channel_id, record_date
      ) pf
        ON  pf.custom_channel_id = SPLIT_PART(fpc.channel_id, '+', 1)
        AND pf.record_date       = m.stat_date
      WHERE m.ad_account_id = ${adAccountId}
        AND m.stat_date BETWEEN ${startDate} AND ${endDate}
        AND (m.impressions > 0 OR m.spend_cents > 0)
      ORDER BY m.stat_date DESC, m.spend_cents DESC
    `
    : Promise.resolve({ rows: [] });

  const [eurToUsd, snapResult, metaResult] = await Promise.all([
    getEurToUsd(),
    snapQuery,
    metaQuery,
  ]);

  const combined: CombinedRow[] = [];

  // DR-7: both arms compute revenue as visymo + predicto, which is only correct while
  // an entity monetizes on exactly ONE feed — a provider uses one revenue source, and
  // a channel belongs to one provider. That invariant held across all 6,856 rows with
  // spend when this was checked (2026-07-30: 0 overlaps; 949 visymo-only and 1,211
  // predicto-only on Snap, 12 and 25 on Meta), but nothing enforces it.
  //
  // If both legs ever report for the same entity/date, the invariant has broken —
  // almost certainly a config error, e.g. an ad set id reused as a Visymo channel name
  // while its channel is also linked to a Predicto provider — and the row's revenue is
  // DOUBLE COUNTED, inflating ROI and profit on the numbers used to decide spend.
  //
  // Deliberately detect-and-report rather than pick a leg: choosing the "right" source
  // requires knowing which feed genuinely served the traffic, and guessing wrong would
  // silently DELETE real revenue — a worse failure than a flagged overstatement.
  let dualFeedRows = 0;
  const noteDualFeed = (arm: "snap" | "meta", entityId: string, date: string, visymo: number, predicto: number) => {
    if (visymo > 0 && predicto > 0) {
      dualFeedRows++;
      console.error(
        `[reporting/combined] DUAL-FEED REVENUE (${arm}) — ${entityId} on ${date} reports BOTH ` +
          `visymo=${visymo} and predicto=${predicto}. Revenue for this row is the sum and is ` +
          `therefore double counted. Check whether this entity's channel is mapped to two providers.`
      );
    }
  };

  for (const r of snapResult.rows) {
    const spendUsd = microToUsd(Number(r.spend_micro));
    const revenueEur = Number(r.earnings_eur);
    noteDualFeed("snap", String(r.ad_squad_id), String(r.stat_date), revenueEur, Number(r.predicto_revenue_usd));
    const revenueUsd = revenueEur * eurToUsd + Number(r.predicto_revenue_usd);
    const roiPct = spendUsd > 0 ? (revenueUsd / spendUsd) * 100 : null;
    combined.push({
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
      snap_purchase_value_usd: microToUsd(Number(r.conversion_purchase_value)),
      platform: "snap",
    });
  }

  // Meta Insights amounts are denominated in the ad account's billing currency, which
  // is recorded per row. Resolve every distinct rate up front — the push loop below is
  // synchronous, and awaiting per row would serialise a fetch per stat row.
  const metaRates = new Map<string, number>();
  for (const cur of new Set(metaResult.rows.map((r) => String(r.currency ?? "USD").toUpperCase()))) {
    metaRates.set(cur, await getRateToUsd(cur));
  }

  for (const r of metaResult.rows) {
    const toUsd = metaRates.get(String(r.currency ?? "USD").toUpperCase()) ?? 1;
    const spendUsd = centsToUsd(Number(r.spend_cents)) * toUsd;
    const purchaseValueUsd = centsToUsd(Number(r.purchase_value_cents)) * toUsd;
    // Revenue/ROI come from the sell-side feeds for Facebook traffic — Predicto FB
    // (joined by channel) and Visymo (joined directly by ad_set_id; EUR→USD).
    // Summing relies on the one-feed-per-entity invariant enforced by noteDualFeed
    // above; it is checked per row rather than merely assumed. Meta's own pixel value
    // stays in snap_results / snap_purchase_value_usd (Results / Purchase Value).
    const visymoUsd = Number(r.vsm_earnings_eur) * eurToUsd;
    const revenueEur = Number(r.vsm_earnings_eur);
    noteDualFeed("meta", String(r.ad_set_id), String(r.stat_date), revenueEur, Number(r.pfb_revenue_usd));
    const revenueUsd = Number(r.pfb_revenue_usd) + visymoUsd;
    const roiPct = spendUsd > 0 ? (revenueUsd / spendUsd) * 100 : null;
    combined.push({
      ad_squad_id: r.ad_set_id as string,
      ad_account_id: r.ad_account_id as string,
      ad_squad_name: r.ad_set_name as string,
      stat_date: r.stat_date as string,
      country_code: "",
      impressions: Number(r.impressions),
      // `swipes` is the PLATFORM click metric (Snap swipes / Meta link clicks) and
      // `clicks` is SELL-SIDE only. Meta's own clicks previously went into `clicks`,
      // summing two unrelated funnels into one column and leaving swipes at 0 — which
      // also made per-row ctr/cpc/cvr/fill_rate permanently "—" for Meta rows and
      // diluted the portfolio CTR in KpiSummaryBar (Meta impressions in the
      // denominator, no Meta clicks in the numerator).
      swipes: Number(r.clicks),
      spend_usd: spendUsd,
      video_views: 0,
      clicks: Number(r.pfb_clicks) + Number(r.vsm_clicks),
      revenue_eur: revenueEur,
      revenue_usd: revenueUsd,
      roi_pct: roiPct,
      page_views: 0,
      ad_requests: 0,
      matched_ad_requests: 0,
      requests: Number(r.pfb_requests) + Number(r.vsm_requests),
      feed_impressions: Number(r.pfb_impressions) + Number(r.vsm_impressions),
      funnel_clicks: Number(r.pfb_funnel_clicks) + Number(r.vsm_funnel_clicks),
      funnel_impressions: Number(r.pfb_funnel_impressions) + Number(r.vsm_funnel_impressions),
      funnel_requests: Number(r.pfb_funnel_requests) + Number(r.vsm_funnel_requests),
      domain_name: "",
      feed_provider_id: r.feed_provider_id as string,
      snap_results: Number(r.purchases),
      snap_purchase_value_usd: purchaseValueUsd,
      platform: "meta",
    });
  }

  combined.sort((a, b) => {
    const dateCmp = b.stat_date.localeCompare(a.stat_date);
    if (dateCmp !== 0) return dateCmp;
    return b.spend_usd - a.spend_usd;
  });

  // One greppable aggregate in addition to the per-row detail above. Deliberately not
  // added to the response body: nothing in the UI consumes it, and an unread field is
  // the same half-built trap as the DEEP_LINK branch that was removed today.
  if (dualFeedRows > 0) {
    console.error(
      `[reporting/combined] ${dualFeedRows} of ${combined.length} rows had revenue from BOTH feeds ` +
        `and are double counted. ROI and profit are overstated for those rows.`
    );
  }

  return NextResponse.json({ rows: combined, eur_to_usd: eurToUsd });
}
