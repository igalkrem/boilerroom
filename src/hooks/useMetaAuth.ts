"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface MetaAuthState {
  metaConnected: boolean;
  metaUserId?: string;
  metaExpiresAt?: number;
  isLoading: boolean;
  error: unknown;
}

export function useMetaAuth(): MetaAuthState {
  const { data, error, isLoading } = useSWR("/api/auth/session", fetcher, {
    refreshInterval: 60_000,
  });

  return {
    metaConnected: data?.metaConnected === true,
    metaUserId: data?.metaUserId,
    metaExpiresAt: data?.metaExpiresAt,
    isLoading,
    error,
  };
}
