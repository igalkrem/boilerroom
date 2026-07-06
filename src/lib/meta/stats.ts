import { metaFetch } from "./client";
import type { MetaInsightsRow } from "@/types/meta";

export async function getAdSetInsights(
  adSetId: string,
  startDate: string,
  endDate: string,
  token?: string
): Promise<MetaInsightsRow[]> {
  const params = new URLSearchParams({
    fields: "impressions,clicks,spend,actions",
    time_range: JSON.stringify({
      since: startDate,
      until: endDate,
    }),
    time_increment: "1",
    level: "adset",
  });

  const data = await metaFetch<{ data: MetaInsightsRow[] }>(
    `/${adSetId}/insights?${params}`,
    {},
    token
  );
  return data.data ?? [];
}

export async function getAccountInsights(
  adAccountId: string,
  startDate: string,
  endDate: string,
  token?: string
): Promise<MetaInsightsRow[]> {
  const params = new URLSearchParams({
    fields: "impressions,clicks,spend,actions",
    time_range: JSON.stringify({
      since: startDate,
      until: endDate,
    }),
    time_increment: "1",
    level: "adset",
  });

  const data = await metaFetch<{ data: MetaInsightsRow[] }>(
    `/act_${adAccountId.replace("act_", "")}/insights?${params}`,
    {},
    token
  );
  return data.data ?? [];
}
