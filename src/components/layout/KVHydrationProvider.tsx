"use client";

import { useEffect, useState } from "react";
import { hydrateFromKV } from "@/lib/kv-sync";

const HYDRATION_KEYS = [
  { key: "br_silo_assets", storageKey: "boilerroom_silo_v1" },
  { key: "br_silo_tags", storageKey: "boilerroom_silo_tags_v1" },
  { key: "br_pixels", storageKey: "boilerroom_pixels_v1" },
  { key: "br_presets", storageKey: "boilerroom_presets_v1" },
  { key: "br_feed_providers", storageKey: "boilerroom_feed_providers_v1" },
  { key: "br_articles", storageKey: "boilerroom_articles_v1" },
  { key: "br_ad_accounts_v1", storageKey: "boilerroom_ad_accounts_v1" },
] as const;

function mergeByIdIntoLocal(local: unknown[], remote: unknown[]): unknown[] | null {
  const localIds = new Set(
    (local as { id?: string }[]).map((i) => i.id).filter(Boolean)
  );
  const extras = (remote as { id?: string }[]).filter(
    (i) => i.id && !localIds.has(i.id)
  );
  if (extras.length === 0) return null;
  return [...local, ...extras];
}

export function KVHydrationProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hasAllLocal = HYDRATION_KEYS.every(
      ({ storageKey }) => localStorage.getItem(storageKey) !== null
    );

    async function hydrate() {
      await Promise.all(
        HYDRATION_KEYS.map(async ({ key, storageKey }) => {
          try {
            const remote = await hydrateFromKV(key);
            if (!remote || !Array.isArray(remote)) return;
            const localRaw = localStorage.getItem(storageKey);
            if (!localRaw) {
              localStorage.setItem(storageKey, JSON.stringify(remote));
              return;
            }
            const local = JSON.parse(localRaw);
            if (!Array.isArray(local)) {
              localStorage.setItem(storageKey, JSON.stringify(remote));
              return;
            }
            const merged = mergeByIdIntoLocal(local, remote);
            if (merged) localStorage.setItem(storageKey, JSON.stringify(merged));
          } catch {
            // ignore — localStorage unchanged on any error
          }
        })
      );
      setReady(true);
    }

    if (hasAllLocal) {
      setReady(true);
      hydrate(); // background merge — already showing UI
    } else {
      hydrate(); // blocking — show spinner until KV hydrated
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400" />
      </div>
    );
  }

  return <>{children}</>;
}
