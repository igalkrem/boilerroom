import { snapFetch } from "./client";

export interface AdSquadStatRow {
  date: string;        // YYYY-MM-DD
  country_code: string; // ISO-2, or '' for totals
  impressions: number;
  swipes: number;
  spend_micro: number;
  video_views: number;
}

interface SnapStatsTimeseries {
  start_time: string;
  end_time: string;
  dimension_stats?: Array<{
    dimension: { country?: string };
    stats: { impressions?: number; swipes?: number; spend?: number; video_views?: number };
  }>;
  stats?: { impressions?: number; swipes?: number; spend?: number; video_views?: number };
}

interface SnapStatsResponse {
  total_stats: Array<{
    id: string;
    type: string;
    granularity: string;
    stats: {
      timeseries: SnapStatsTimeseries[];
    };
    breakdown_stats?: {
      country?: Array<{
        country: string;
        timeseries: Array<{
          start_time: string;
          end_time: string;
          stats: { impressions?: number; swipes?: number; spend?: number; video_views?: number };
        }>;
      }>;
    };
  }>;
}

function toDate(isoString: string): string {
  return isoString.slice(0, 10);
}

function toMicro(spend: number | undefined): number {
  // Snapchat returns spend in dollars, not micro — convert.
  return Math.round((spend ?? 0) * 1_000_000);
}

export async function getAdSquadStats(
  adSquadId: string,
  startDate: string,
  endDate: string
): Promise<AdSquadStatRow[]> {
  // Request daily stats with country breakdown.
  const startTime = `${startDate}T00:00:00.000-0000`;
  const endTime = `${endDate}T23:59:59.000-0000`;

  const data = await snapFetch<SnapStatsResponse>(
    `/adsquads/${adSquadId}/stats?granularity=DAY&breakdown=country&fields=impressions,swipes,spend,video_views&start_time=${encodeURIComponent(startTime)}&end_time=${encodeURIComponent(endTime)}`
  );

  const rows: AdSquadStatRow[] = [];
  const entry = data.total_stats?.[0];
  if (!entry) return rows;

  // Snapchat returns country breakdowns in breakdown_stats.country when breakdown=country is set.
  if (entry.breakdown_stats?.country) {
    for (const countryEntry of entry.breakdown_stats.country) {
      const countryCode = countryEntry.country ?? "";
      for (const ts of countryEntry.timeseries ?? []) {
        rows.push({
          date: toDate(ts.start_time),
          country_code: countryCode,
          impressions: ts.stats.impressions ?? 0,
          swipes: ts.stats.swipes ?? 0,
          spend_micro: toMicro(ts.stats.spend),
          video_views: ts.stats.video_views ?? 0,
        });
      }
    }
  } else {
    // Fallback: no breakdown, store as '' country (totals).
    for (const ts of entry.stats?.timeseries ?? []) {
      if (ts.dimension_stats) {
        for (const dim of ts.dimension_stats) {
          rows.push({
            date: toDate(ts.start_time),
            country_code: dim.dimension.country ?? "",
            impressions: dim.stats.impressions ?? 0,
            swipes: dim.stats.swipes ?? 0,
            spend_micro: toMicro(dim.stats.spend),
            video_views: dim.stats.video_views ?? 0,
          });
        }
      } else {
        rows.push({
          date: toDate(ts.start_time),
          country_code: "",
          impressions: ts.stats?.impressions ?? 0,
          swipes: ts.stats?.swipes ?? 0,
          spend_micro: toMicro(ts.stats?.spend),
          video_views: ts.stats?.video_views ?? 0,
        });
      }
    }
  }

  return rows;
}
