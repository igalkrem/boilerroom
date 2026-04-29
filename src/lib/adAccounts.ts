import { z } from "zod";
import type { AdAccountConfig } from "@/types/ad-account";
import { syncToKV } from "@/lib/kv-sync";

const STORAGE_KEY = "boilerroom_ad_accounts_v1";
const KV_KEY = "br_ad_accounts_v1";

const adAccountSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  hidden: z.boolean(),
  feedProviderIds: z.array(z.string()),
  updatedAt: z.string(),
});

export function loadAdAccountConfigs(): AdAccountConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => adAccountSchema.safeParse(item).success) as AdAccountConfig[];
  } catch {
    return [];
  }
}

function saveAdAccountConfigs(configs: AdAccountConfig[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  syncToKV(KV_KEY, configs);
}

export function upsertAdAccountConfig(config: AdAccountConfig): void {
  const configs = loadAdAccountConfigs();
  const idx = configs.findIndex((c) => c.id === config.id);
  if (idx >= 0) {
    configs[idx] = config;
  } else {
    configs.push(config);
  }
  saveAdAccountConfigs(configs);
}

export function getAdAccountConfig(id: string): AdAccountConfig | undefined {
  return loadAdAccountConfigs().find((c) => c.id === id);
}

/** Returns IDs of accounts assigned to a specific feed provider that are not hidden. */
export function getEffectiveAccountsForProvider(providerId: string): string[] {
  return loadAdAccountConfigs()
    .filter((c) => !c.hidden && c.feedProviderIds.includes(providerId))
    .map((c) => c.id);
}
