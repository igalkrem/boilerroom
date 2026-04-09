"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useSnapchatAuth() {
  const { data, error, isLoading } = useSWR("/api/auth/session", fetcher, {
    refreshInterval: 60_000,
  });

  return {
    authenticated: data?.authenticated === true,
    isLoading,
    error,
  };
}
