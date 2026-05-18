// Meta ad account config storage — mirrors lib/adAccounts.ts but uses a
// separate localStorage key so Snap configs are never touched.

const STORAGE_KEY = "boilerroom_meta_ad_accounts_v1";

export interface MetaAdAccountConfig {
  id: string;              // Meta ad account ID (e.g. "act_XXXXXXXXX")
  name: string;
  hidden: boolean;
  feedProviderIds: string[];
  updatedAt: string;
}

export function loadMetaAdAccountConfigs(): MetaAdAccountConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MetaAdAccountConfig[]) : [];
  } catch {
    return [];
  }
}

function saveMetaAdAccountConfigs(configs: MetaAdAccountConfig[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

export function upsertMetaAdAccountConfig(config: MetaAdAccountConfig): void {
  const configs = loadMetaAdAccountConfigs();
  const idx = configs.findIndex((c) => c.id === config.id);
  if (idx >= 0) {
    configs[idx] = config;
  } else {
    configs.push(config);
  }
  saveMetaAdAccountConfigs(configs);
}

export function getEffectiveMetaAccountsForProvider(providerId: string): string[] {
  return loadMetaAdAccountConfigs()
    .filter((c) => !c.hidden && c.feedProviderIds.includes(providerId))
    .map((c) => c.id);
}
