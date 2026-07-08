import { z } from "zod";
import type { PageConfig } from "@/types/page-config";
import { syncToKV } from "@/lib/kv-sync";

const STORAGE_KEY = "boilerroom_page_configs_v1";
const KV_KEY = "br_page_configs_v1";

const pageConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  hidden: z.boolean(),
  feedProviderIds: z.array(z.string()),
  updatedAt: z.string(),
});

export function loadPageConfigs(): PageConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => pageConfigSchema.safeParse(item).success) as PageConfig[];
  } catch {
    return [];
  }
}

function savePageConfigs(configs: PageConfig[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  syncToKV(KV_KEY, configs);
}

export function upsertPageConfig(config: PageConfig): void {
  const configs = loadPageConfigs();
  const idx = configs.findIndex((c) => c.id === config.id);
  if (idx >= 0) {
    configs[idx] = config;
  } else {
    configs.push(config);
  }
  savePageConfigs(configs);
}

export function getPageConfig(id: string): PageConfig | undefined {
  return loadPageConfigs().find((c) => c.id === id);
}
