import { z } from "zod";
import type { CatalogueItem } from "@/types/catalogue";
import { syncToKV } from "@/lib/kv-sync";

const STORAGE_KEY = "boilerroom_catalogue_v1";
const KV_KEY = "br_catalogue_v1";

const itemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fileFormat: z.string().min(1),
  fileSize: z.number().positive(),
  url: z.string().min(1),
  uploadDate: z.string().min(1),
});

function saveItems(items: CatalogueItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  syncToKV(KV_KEY, items);
}

export function loadCatalogue(): CatalogueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    return parsed.filter((item) => itemSchema.safeParse(item).success) as CatalogueItem[];
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  }
}

export function addCatalogueItem(item: CatalogueItem): void {
  const items = loadCatalogue();
  saveItems([item, ...items]);
}

export function deleteCatalogueItem(id: string): void {
  saveItems(loadCatalogue().filter((i) => i.id !== id));
}
