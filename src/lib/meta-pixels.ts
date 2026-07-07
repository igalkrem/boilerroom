import { z } from "zod";
import type { SavedMetaPixel } from "@/types/meta-pixel";
import { syncToKV } from "@/lib/kv-sync";

const STORAGE_KEY = "boilerroom_meta_pixels_v1";
const KV_KEY = "br_meta_pixels";

const pixelSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  pixelId: z.string().min(1),
  createdAt: z.string(),
});

export function loadMetaPixels(): SavedMetaPixel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    return parsed.filter((item) => pixelSchema.safeParse(item).success) as SavedMetaPixel[];
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  }
}

function saveMetaPixels(pixels: SavedMetaPixel[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pixels));
  syncToKV(KV_KEY, pixels);
}

export function upsertMetaPixel(pixel: SavedMetaPixel): void {
  const pixels = loadMetaPixels();
  const idx = pixels.findIndex((p) => p.id === pixel.id);
  if (idx >= 0) {
    pixels[idx] = pixel;
  } else {
    pixels.push(pixel);
  }
  saveMetaPixels(pixels);
}

export function deleteMetaPixel(id: string): void {
  const pixels = loadMetaPixels().filter((p) => p.id !== id);
  saveMetaPixels(pixels);
}

export function getMetaPixelById(id: string): SavedMetaPixel | undefined {
  return loadMetaPixels().find((p) => p.id === id);
}
