import { z } from "zod";
import type { FeedProvider } from "@/types/feed-provider";
import { syncToKV } from "@/lib/kv-sync";

const STORAGE_KEY = "boilerroom_feed_providers_v1";

// Per-provider chip color, keyed by provider name (case-insensitive). Unknown
// providers fall back to cyan so new providers still render sensibly.
const PROVIDER_BADGE_COLORS: Record<string, string> = {
  vizymo:
    "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-700",
  predicto:
    "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700",
};
const PROVIDER_BADGE_FALLBACK =
  "bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-700";

export function getFeedProviderBadgeClasses(providerName: string): string {
  return PROVIDER_BADGE_COLORS[providerName.trim().toLowerCase()] ?? PROVIDER_BADGE_FALLBACK;
}
const KV_KEY = "br_feed_providers";

const legacySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string(),
});

function upcast(raw: Record<string, unknown>): FeedProvider {
  const snapConfig: FeedProvider["snapConfig"] = (raw.snapConfig as FeedProvider["snapConfig"]) ?? {
    allowedAdAccountIds: [],
    allowedPixelIds: [],
  };
  return {
    id: raw.id as string,
    name: raw.name as string,
    createdAt: (raw.createdAt as string) ?? new Date().toISOString(),
    snapConfig: {
      ...snapConfig,
      // Legacy stored value "kingsroad" → "visymo" (transparent self-heal on load).
      revenueSource:
        (snapConfig.revenueSource as unknown as string) === "kingsroad"
          ? "visymo"
          : snapConfig.revenueSource,
    },
    metaConfig: raw.metaConfig
      ? {
          ...(raw.metaConfig as NonNullable<FeedProvider["metaConfig"]>),
          allowedPageIds:
            (raw.metaConfig as NonNullable<FeedProvider["metaConfig"]>).allowedPageIds ?? [],
        }
      : {
          allowedAdAccountIds: [],
          allowedPixelIds: [],
          allowedPageIds: [],
        },
    urlConfig: (raw.urlConfig as FeedProvider["urlConfig"]) ?? {
      baseUrl: (raw.baseUrl as string) ?? "",
      parameters: [],
    },
    channelConfig: (raw.channelConfig as FeedProvider["channelConfig"]) ?? {
      type: "parameter-based",
    },
    domains: (raw.domains as FeedProvider["domains"]) ?? [],
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
