"use client";

import useSWR from "swr";
import type { MetaPage } from "@/lib/meta/pages";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const EMPTY_PAGES: MetaPage[] = [];

export function useMetaPages() {
  const { data, error, isLoading } = useSWR("/api/meta/pages", fetcher);

  return {
    pages: (data?.pages ?? EMPTY_PAGES) as MetaPage[],
    isLoading,
    error: error ?? (data?.error ? new Error(data.error) : null),
  };
}
