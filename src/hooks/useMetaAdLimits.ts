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
 * Facebook Pages with page-level running/in-review ad counts (from ads_volume)
 * and their owning Business Manager (from the business page list). Server-side
 * cached (~10 min) so the FB Pages table doesn't re-hit ~35 Graph endpoints on
 * every load. `refresh()` forces a live recompute (bypasses the cache).
 */
export function useMetaAdLimits() {
  const { data, error, isLoading, mutate } = useSWR("/api/meta/ad-limits", fetcher);

  const pages = (data?.pages ?? EMPTY_ROWS) as AdLimitPage[];
  const runningByPage: Record<string, number> = {};
  for (const p of pages) runningByPage[p.pageId] = p.running;

  // Force a fresh recompute server-side, then update the cached SWR entry.
  const refresh = () =>
    mutate(fetch("/api/meta/ad-limits?refresh=1").then((r) => r.json()), { revalidate: false });

  return {
    pages,
    runningByPage,
    cachedAt: (data?.cachedAt as number | undefined) ?? null,
    isLoading,
    error: error ?? (data?.error ? new Error(data.error) : null),
    refresh,
  };
}
