import { z } from "zod";
import type { FeedProvider } from "@/types/feed-provider";
import { syncToKV } from "@/lib/kv-sync";

const STORAGE_KEY = "boilerroom_feed_providers_v1";
const KV_KEY = "br_feed_providers";

const legacySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string(),
});

function upcast(raw: Record<string, unknown>): FeedProvider {
  return {
    id: raw.id as string,
    name: raw.name as string,
    createdAt: (raw.createdAt as string) ?? new Date().toISOString(),
    snapConfig: (raw.snapConfig as FeedProvider["snapConfig"]) ?? {
      allowedAdAccountIds: [],
      allowedPixelIds: [],
    },
    urlConfig: (raw.urlConfig as FeedProvider["urlConfig"]) ?? {
      baseUrl: (raw.baseUrl as string) ?? "",
      parameters: [],
    },
    channelConfig: (raw.channelConfig as FeedProvider["channelConfig"]) ?? {
      type: "parameter-based",
    },
    domains: (raw.domains as FeedProvider["domains"]) ?? [],
    combos: (raw.combos as FeedProvider["combos"]) ?? [],
  };
}

export function loadFeedProviders(): FeedProvider[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    return parsed
      .filter((item) => legacySchema.safeParse(item).success)
      .map((item) => upcast(item as Record<string, unknown>));
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  }
}

function saveFeedProviders(providers: FeedProvider[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
  syncToKV(KV_KEY, providers);
}

export function upsertFeedProvider(provider: FeedProvider): void {
  const providers = loadFeedProviders();
  const idx = providers.findIndex((p) => p.id === provider.id);
  if (idx >= 0) {
    providers[idx] = provider;
  } else {
    providers.push(provider);
  }
  saveFeedProviders(providers);
}

export function deleteFeedProvider(id: string): void {
  const providers = loadFeedProviders().filter((p) => p.id !== id);
  saveFeedProviders(providers);
}

export function getFeedProviderById(id: string): FeedProvider | undefined {
  return loadFeedProviders().find((p) => p.id === id);
}
