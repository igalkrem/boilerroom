import { countryNameToCode } from "@/lib/country-map";

const BASE_URL = "https://partnerhub-api.kingsroad.io/api/v3";

function token(): string {
  const t = process.env.KINGSROAD_API_TOKEN;
  if (!t) throw new Error("KINGSROAD_API_TOKEN not set");
  return t;
}

export interface KingsRoadRow {
  record_date: string;
  country_name: string;
  country_code: string;
  custom_channel_name: string;
  domain_name: string;
  ad_requests: number;
  clicks: number;
  earnings_eur: number;
  page_views: number;
  individual_ad_impressions: number;
  matched_ad_requests: number;
  funnel_clicks: number;
  funnel_impressions: number;
}

interface ApiRow {
  record_date: string;
  country_name: string;
  custom_channel_name: string;
  domain_name: string;
  ad_requests: number;
  clicks: number;
  earnings_eur: number;
  page_views: number;
  individual_ad_impressions: number;
  matched_ad_requests: number;
  funnel_clicks: number;
  funnel_impressions: number;
}

interface PageResponse {
  count: number;
  next: string | null;
  results: ApiRow[];
}

export async function fetchKingsRoadReport(startDate: string, endDate: string): Promise<KingsRoadRow[]> {
  const rows: KingsRoadRow[] = [];
  let url: string | null =
    `${BASE_URL}/report/?start_date=${startDate}&end_date=${endDate}&page_size=2000&page=1`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`KingsRoad API error ${res.status}: ${body}`);
    }
    const page = await res.json() as PageResponse;
    for (const r of page.results) {
      rows.push({
        record_date: r.record_date,
        country_name: r.country_name ?? "",
        country_code: countryNameToCode(r.country_name ?? ""),
        custom_channel_name: r.custom_channel_name ?? "",
        domain_name: r.domain_name ?? "",
        ad_requests: r.ad_requests ?? 0,
        clicks: r.clicks ?? 0,
        earnings_eur: r.earnings_eur ?? 0,
        page_views: r.page_views ?? 0,
        individual_ad_impressions: r.individual_ad_impressions ?? 0,
        matched_ad_requests: r.matched_ad_requests ?? 0,
        funnel_clicks: r.funnel_clicks ?? 0,
        funnel_impressions: r.funnel_impressions ?? 0,
      });
    }
    const nextUrl = page.next ?? null;
    if (nextUrl !== null) {
      try {
        const parsed = new URL(nextUrl);
        if (parsed.origin !== "https://partnerhub-api.kingsroad.io") {
          console.error("[kingsroad] unexpected pagination origin — aborting:", parsed.origin);
          break;
        }
        url = nextUrl;
      } catch {
        console.error("[kingsroad] invalid next URL — aborting:", nextUrl);
        break;
      }
    } else {
      url = null;
    }
  }
  return rows;
}
