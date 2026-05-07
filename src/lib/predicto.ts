const BASE_URL = "https://server.predicto.ai/api/v1/search/reporting";

function token(): string | null {
  return process.env.PREDICTO_API_TOKEN ?? null;
}

export interface PredictoRow {
  date: string;
  custom_channel_id: string;
  revenue_usd: number;
  clicks: number;
  funnel_clicks: number;
  funnel_impressions: number;
  funnel_requests: number;
  requests: number;
}

interface ApiRow {
  date: string;
  custom_channel_id: string;
  estimated_revenue?: number | string;
  clicks?: number | string;
  funnel_clicks?: number | string;
  funnel_impressions?: number | string;
  funnel_requests?: number | string;
  requests?: number | string;
}

interface ApiResponse {
  status: string;
  data: ApiRow[];
}

export async function fetchPredictoReport(startDate: string, endDate: string): Promise<PredictoRow[]> {
  const t = token();
  if (!t) {
    console.warn("[predicto] PREDICTO_API_TOKEN not set — skipping");
    return [];
  }

  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    metrics: "revenue,clicks,funnel_clicks,funnel_impressions,funnel_requests,requests",
    dimensions: "date,custom_channel_id",
  });

  const res = await fetch(`${BASE_URL}?${params}`, {
    headers: { Authorization: `Bearer ${t}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Predicto API error ${res.status}: ${body}`);
  }

  const json = await res.json() as ApiResponse;
  if (json.status !== "success") {
    throw new Error(`Predicto API returned status: ${json.status}`);
  }

  return (json.data ?? []).map((r) => ({
    date: r.date,
    custom_channel_id: r.custom_channel_id ?? "",
    revenue_usd: Number(r.estimated_revenue ?? 0),
    clicks: Number(r.clicks ?? 0),
    funnel_clicks: Number(r.funnel_clicks ?? 0),
    funnel_impressions: Number(r.funnel_impressions ?? 0),
    funnel_requests: Number(r.funnel_requests ?? 0),
    requests: Number(r.requests ?? 0),
  }));
}
