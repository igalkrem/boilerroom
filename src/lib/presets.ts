import type { CampaignPreset } from "@/types/preset";

const STORAGE_KEY = "boilerroom_presets_v1";

function isValidPresetArray(value: unknown): value is CampaignPreset[] {
  return Array.isArray(value) && value.every(
    (item) => typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).id === "string"
  );
}

export function loadPresets(): CampaignPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!isValidPresetArray(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    return parsed;
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  }
}

function savePresets(presets: CampaignPreset[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
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
