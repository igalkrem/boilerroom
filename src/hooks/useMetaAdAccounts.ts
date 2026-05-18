"use client";

import useSWR from "swr";
import type { MetaAdAccount } from "@/types/meta";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Module-level constant keeps the fallback reference stable across renders
// (same pattern as useAdAccounts.ts — avoids render-loop hazards in consumers).
const EMPTY_ACCOUNTS: MetaAdAccount[] = [];

export function useMetaAdAccounts() {
  const { data, error, isLoading } = useSWR("/api/meta/ad-accounts", fetcher);

  return {
    accounts: (data?.accounts ?? EMPTY_ACCOUNTS) as MetaAdAccount[],
    isLoading,
    error: error ?? (data?.error ? new Error(data.error) : null),
  };
}
