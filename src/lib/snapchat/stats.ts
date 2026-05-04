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

export async function getAdSquadStats(
  adSquadId: string,
  startDate: string,
  endDate: string
): Promise<AdSquadStatRow[]> {
  // Snapchat requires times at midnight in the ad account's timezone (America/Los_Angeles).
  // -07:00 = PDT (summer), -08:00 = PST (winter). Using -07:00 as a practical default.
  const startTime = `${startDate}T00:00:00.000-07:00`;
  const endDateExclusive = new Date(endDate + "T00:00:00Z");
  endDateExclusive.setUTCDate(endDateExclusive.getUTCDate() + 1);
  const endTime = endDateExclusive.toISOString().slice(0, 10) + "T00:00:00.000-07:00";

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
