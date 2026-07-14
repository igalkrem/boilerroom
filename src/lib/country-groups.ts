import { z } from "zod";
import type { CountryGroup } from "@/types/country-group";
import { syncToKV } from "@/lib/kv-sync";
import { loadPresets, upsertPreset } from "@/lib/presets";

const STORAGE_KEY = "boilerroom_country_groups_v1";
const KV_KEY = "br_country_groups";

const countryGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  countryCodes: z.array(z.string()),
  createdAt: z.string(),
});

export function loadCountryGroups(): CountryGroup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    return (parsed.filter((item) => countryGroupSchema.safeParse(item).success) as CountryGroup[])
      .map((g) => ({ ...g, countryCodes: g.countryCodes.map((c) => (c === "UK" ? "GB" : c)) }));
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  }
}

function saveCountryGroups(groups: CountryGroup[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  syncToKV(KV_KEY, groups);
}

export function upsertCountryGroup(group: CountryGroup): void {
  const groups = loadCountryGroups();
  const idx = groups.findIndex((g) => g.id === group.id);
  if (idx >= 0) {
    groups[idx] = group;
  } else {
    groups.push(group);
  }
  saveCountryGroups(groups);
}

export function deleteCountryGroup(id: string): void {
  saveCountryGroups(loadCountryGroups().filter((g) => g.id !== id));
}

export function getCountryGroupById(id: string): CountryGroup | undefined {
  return loadCountryGroups().find((g) => g.id === id);
}

export function countPresetsUsingGroup(groupId: string): number {
  return loadPresets().filter((p) => p.countryGroupId === groupId).length;
}

// Snapshot the group's current countries into each linked preset's own list
// and clear the link, so deleting the group doesn't leave presets pointing at
// nothing — they just become "custom" going forward.
export function unlinkPresetsFromGroup(groupId: string): void {
  const group = getCountryGroupById(groupId);
  const codes = group?.countryCodes ?? [];
  const presets = loadPresets().filter((p) => p.countryGroupId === groupId);
  for (const preset of presets) {
    const updated = { ...preset, countryGroupId: undefined };
    if (updated.adSquads[0]) {
      updated.adSquads = [{ ...updated.adSquads[0], geoCountryCodes: codes }, ...updated.adSquads.slice(1)];
    }
    if (updated.metaAdSet) {
      updated.metaAdSet = { ...updated.metaAdSet, geoCountryCodes: codes };
    }
    upsertPreset(updated);
  }
}
