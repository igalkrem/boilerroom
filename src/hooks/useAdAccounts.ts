"use client";

import useSWR from "swr";
import type { SnapAdAccount } from "@/types/snapchat";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useAdAccounts() {
  const { data, error, isLoading } = useSWR("/api/snapchat/ad-accounts", fetcher);

  return {
    accounts: (data?.accounts ?? []) as SnapAdAccount[],
    isLoading,
    error: error ?? (data?.error ? new Error(data.error) : null),
  };
}
