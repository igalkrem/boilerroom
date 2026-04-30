import { z } from "zod";
import type { CampaignPreset } from "@/types/preset";
import { syncToKV } from "@/lib/kv-sync";

const STORAGE_KEY = "boilerroom_presets_v1";
const KV_KEY = "br_presets";

const presetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  createdAt: z.string(),
  campaign: z.object({
    objective: z.string().min(1),
    spendCapType: z.string().min(1),
    status: z.string(),
  }).passthrough(),
  adSquads: z.array(
    z.object({ optimizationGoal: z.string().min(1) }).passthrough()
  ),
});

export function loadPresets(): CampaignPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    // Filter out corrupted entries rather than wiping the entire store.
    return parsed
      .filter((item) => presetSchema.safeParse(item).success)
      .map((item) => ({ trafficSource: "snap" as const, ...item })) as CampaignPreset[];
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  }
}

function savePresets(presets: CampaignPreset[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  syncToKV(KV_KEY, presets);
}

export function upsertPreset(preset: CampaignPreset): void {
  const presets = loadPresets();
  const idx = presets.findIndex((p) => p.id === preset.id);
  if (idx >= 0) {
    presets[idx] = preset;
  } else {
    presets.push(preset);
  }
  savePresets(presets);
}

export function deletePreset(id: string): void {
  const presets = loadPresets().filter((p) => p.id !== id);
  savePresets(presets);
}

export function getPresetById(id: string): CampaignPreset | undefined {
  return loadPresets().find((p) => p.id === id);
}

export function duplicatePreset(id: string): CampaignPreset | null {
  const original = getPresetById(id);
  if (!original) return null;
  const copy = structuredClone(original) as CampaignPreset;
  copy.id = crypto.randomUUID();
  copy.name = `Copy of ${original.name}`;
  copy.createdAt = new Date().toISOString();
  upsertPreset(copy);
  return copy;
}
