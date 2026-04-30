"use client";

import useSWR from "swr";
import type { SnapAdAccount } from "@/types/snapchat";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Module-level constant so the fallback is always the same reference.
// Inline `[]` would create a new array every render while SWR is loading,
// destabilizing any useMemo/useCallback that depends on the accounts array.
const EMPTY_ACCOUNTS: SnapAdAccount[] = [];

export function useAdAccounts() {
  const { data, error, isLoading } = useSWR("/api/snapchat/ad-accounts", fetcher);

  return {
    accounts: (data?.accounts ?? EMPTY_ACCOUNTS) as SnapAdAccount[],
    isLoading,
    error: error ?? (data?.error ? new Error(data.error) : null),
  };
}
