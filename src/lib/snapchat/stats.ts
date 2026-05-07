import { snapFetch } from "./client";

export interface AdSquadStatRow {
  date: string;        // YYYY-MM-DD
  country_code: string; // ISO-2, or '' for totals
  impressions: number;
  swipes: number;
  spend_micro: number;
  video_views: number;
  conversion_purchases: number;
  conversion_purchase_value_micro: number;
}

interface SnapTimeseriesEntry {
  start_time: string;
  end_time: string;
  stats: {
    impressions?: number;
    swipes?: number;
    spend?: number;
    video_views?: number;
    conversion_purchases?: number;
    conversion_purchase_value?: number;
  };
}

interface SnapStatsResponse {
  timeseries_stats: Array<{
    sub_request_status: string;
    timeseries_stat: {
      id: string;
      type: string;
      granularity: string;
      start_time: string;
      end_time: string;
      timeseries: SnapTimeseriesEntry[];
    };
  }>;
}

function toLocalDate(isoString: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(isoString));
}

function toMicro(spend: number | undefined): number {
  return Math.round(spend ?? 0);
}

function tzOffset(dateStr: string, timezone: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
  }).formatToParts(d);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  // Parse "GMT-7", "GMT+3", "GMT+5:30", etc.
  const m = tz.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!m) return "+00:00";
  const sign = m[1];
  const hours = m[2].padStart(2, "0");
  const mins = (m[3] ?? "0").padStart(2, "0");
  return `${sign}${hours}:${mins}`;
}

export async function getAdSquadStats(
  adSquadId: string,
  startDate: string,
  endDate: string,
  timezone = "America/Los_Angeles",
  token?: string
): Promise<AdSquadStatRow[]> {
  const startTime = `${startDate}T00:00:00.000${tzOffset(startDate, timezone)}`;
  const endDateExclusive = new Date(endDate + "T00:00:00Z");
  endDateExclusive.setUTCDate(endDateExclusive.getUTCDate() + 1);
  const endDateStr = endDateExclusive.toISOString().slice(0, 10);
  const endTime = `${endDateStr}T00:00:00.000${tzOffset(endDateStr, timezone)}`;

  const baseFields = "impressions,swipes,spend,video_views";
  const conversionFields = "conversion_purchases,conversion_purchase_value";
  const buildUrl = (fields: string) =>
    `/adsquads/${adSquadId}/stats?granularity=DAY&fields=${fields}&start_time=${encodeURIComponent(startTime)}&end_time=${encodeURIComponent(endTime)}`;

  let data: SnapStatsResponse;
  try {
    data = await snapFetch<SnapStatsResponse>(buildUrl(`${baseFields},${conversionFields}`), {}, token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("E1004") && msg.includes("conversion_purchase_value")) {
      data = await snapFetch<SnapStatsResponse>(buildUrl(baseFields), {}, token);
    } else {
      throw err;
    }
  }

  const rows: AdSquadStatRow[] = [];
  const stat = data.timeseries_stats?.[0]?.timeseries_stat;
  if (!stat) return rows;

  for (const ts of stat.timeseries ?? []) {
    rows.push({
      date: toLocalDate(ts.start_time, timezone),
      country_code: "",
      impressions: ts.stats.impressions ?? 0,
      swipes: ts.stats.swipes ?? 0,
      spend_micro: toMicro(ts.stats.spend),
      video_views: ts.stats.video_views ?? 0,
      conversion_purchases: ts.stats.conversion_purchases ?? 0,
      conversion_purchase_value_micro: toMicro(ts.stats.conversion_purchase_value),
    });
  }

  return rows;
}
