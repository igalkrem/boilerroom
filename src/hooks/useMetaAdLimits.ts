"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface AdLimitRow {
  pageId: string;
  running: number;
}

const EMPTY_ROWS: AdLimitRow[] = [];

/**
 * Page-level running/in-review ad counts from Meta's ads_volume API, keyed by
 * page id. The numeric ad limit is NOT returned by Meta — callers apply the
 * default (250) or a per-page override to derive "ads remaining".
 */
export function useMetaAdLimits() {
  const { data, error, isLoading } = useSWR("/api/meta/ad-limits", fetcher);

  const rows = (data?.pages ?? EMPTY_ROWS) as AdLimitRow[];
  const runningByPage: Record<string, number> = {};
  for (const r of rows) runningByPage[r.pageId] = r.running;

  return {
    runningByPage,
    isLoading,
    error: error ?? (data?.error ? new Error(data.error) : null),
  };
}
