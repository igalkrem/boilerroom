"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface AuthState {
  authenticated: boolean;
  googleUserId?: string;
  googleEmail?: string;
  googleName?: string;
  googleAvatar?: string;
  snapConnected: boolean;
  snapUserId?: string;
  isLoading: boolean;
  error: unknown;
}

export function useSnapchatAuth(): AuthState {
  const { data, error, isLoading } = useSWR("/api/auth/session", fetcher, {
    refreshInterval: 60_000,
  });

  return {
    authenticated: data?.authenticated === true,
    googleUserId: data?.googleUserId,
    googleEmail: data?.googleEmail,
    googleName: data?.googleName,
    googleAvatar: data?.googleAvatar,
    snapConnected: data?.snapConnected === true,
    snapUserId: data?.snapUserId,
    isLoading,
    error,
  };
}
