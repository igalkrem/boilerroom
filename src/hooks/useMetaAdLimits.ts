"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface AdLimitPage {
  pageId: string;
  name: string;
  businessName: string | null;
  running: number;
}

const EMPTY_ROWS: AdLimitPage[] = [];

/**
 * Facebook Pages with their page-level running/in-review ad counts from Meta's
 * ads_volume API. This is the authoritative page list for the ad-limits table
 * (the /me/accounts pages edge is often empty). The numeric ad limit is NOT
 * returned by Meta — callers apply the default (250) or a per-page override to
 * derive "ads remaining".
 */
export function useMetaAdLimits() {
  const { data, error, isLoading } = useSWR("/api/meta/ad-limits", fetcher);

  const pages = (data?.pages ?? EMPTY_ROWS) as AdLimitPage[];
  const runningByPage: Record<string, number> = {};
  for (const p of pages) runningByPage[p.pageId] = p.running;

  return {
    pages,
    runningByPage,
    isLoading,
    error: error ?? (data?.error ? new Error(data.error) : null),
  };
}
