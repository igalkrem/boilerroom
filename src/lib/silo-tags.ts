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
