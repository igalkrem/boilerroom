import { snapFetch } from "./client";

export interface AdSquadStatRow {
  date: string;        // YYYY-MM-DD
  country_code: string; // ISO-2, or '' for totals
  impressions: number;
  swipes: number;
  spend_micro: number;
  video_views: number;
}

interface SnapTimeseriesEntry {
  start_time: string;
  end_time: string;
  stats: { impressions?: number; swipes?: number; spend?: number; video_views?: number };
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

function toDate(isoString: string): string {
  return isoString.slice(0, 10);
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
  timezone = "America/Los_Angeles"
): Promise<AdSquadStatRow[]> {
  const startTime = `${startDate}T00:00:00.000${tzOffset(startDate, timezone)}`;
  const endDateExclusive = new Date(endDate + "T00:00:00Z");
  endDateExclusive.setUTCDate(endDateExclusive.getUTCDate() + 1);
  const endDateStr = endDateExclusive.toISOString().slice(0, 10);
  const endTime = `${endDateStr}T00:00:00.000${tzOffset(endDateStr, timezone)}`;

  const data = await snapFetch<SnapStatsResponse>(
    `/adsquads/${adSquadId}/stats?granularity=DAY&fields=impressions,swipes,spend,video_views&start_time=${encodeURIComponent(startTime)}&end_time=${encodeURIComponent(endTime)}`
  );

  const rows: AdSquadStatRow[] = [];
  const stat = data.timeseries_stats?.[0]?.timeseries_stat;
  if (!stat) return rows;

  for (const ts of stat.timeseries ?? []) {
    rows.push({
      date: toDate(ts.start_time),
      country_code: "",
      impressions: ts.stats.impressions ?? 0,
      swipes: ts.stats.swipes ?? 0,
      spend_micro: toMicro(ts.stats.spend),
      video_views: ts.stats.video_views ?? 0,
    });
  }

  return rows;
}
