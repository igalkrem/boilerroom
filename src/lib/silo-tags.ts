import { z } from "zod";
import type { SiloTag } from "@/types/silo";
import { syncToKV } from "@/lib/kv-sync";

const STORAGE_KEY = "boilerroom_silo_tags_v1";
const KV_KEY = "br_silo_tags";

const tagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  prefix: z.string().min(1),
  nextIndex: z.number().int().min(1),
  createdAt: z.string().min(1),
});

function saveTags(tags: SiloTag[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
  syncToKV(KV_KEY, tags);
}

export function loadTags(): SiloTag[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    return parsed.filter((item) => tagSchema.safeParse(item).success) as SiloTag[];
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  }
}

export function upsertTag(tag: SiloTag): void {
  const tags = loadTags();
  const idx = tags.findIndex((t) => t.id === tag.id);
  if (idx >= 0) {
    tags[idx] = tag;
  } else {
    tags.push(tag);
  }
  saveTags(tags);
}

export function deleteTag(id: string): void {
  saveTags(loadTags().filter((t) => t.id !== id));
}

export function getTagById(id: string): SiloTag | undefined {
  return loadTags().find((t) => t.id === id);
}

export function consumeNextIndex(tagId: string): number {
  const tags = loadTags();
  const idx = tags.findIndex((t) => t.id === tagId);
  if (idx < 0) throw new Error(`Tag ${tagId} not found`);
  const index = tags[idx].nextIndex;
  tags[idx] = { ...tags[idx], nextIndex: index + 1 };
  saveTags(tags);
  return index;
}

export function buildAssetName(tag: SiloTag, index: number): string {
  return `${tag.prefix}_v_${String(index).padStart(3, "0")}`;
}

// Deterministic per-tag color, hashed from the tag id so the same tag always
// renders the same color without needing a stored `color` field.
const TAG_COLOR_PALETTE = [
  { dot: "bg-indigo-500", active: "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700" },
  { dot: "bg-emerald-500", active: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700" },
  { dot: "bg-orange-500", active: "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700" },
  { dot: "bg-fuchsia-500", active: "bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-700" },
  { dot: "bg-rose-500", active: "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-700" },
  { dot: "bg-sky-500", active: "bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-700" },
  { dot: "bg-amber-500", active: "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700" },
  { dot: "bg-teal-500", active: "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-700" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function getTagColorClasses(tagId: string): { dot: string; active: string } {
  return TAG_COLOR_PALETTE[hashString(tagId) % TAG_COLOR_PALETTE.length];
}
