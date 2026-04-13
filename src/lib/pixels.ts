import type { SavedPixel } from "@/types/pixel";

const STORAGE_KEY = "boilerroom_pixels_v1";

function isValidPixelArray(value: unknown): value is SavedPixel[] {
  return Array.isArray(value) && value.every(
    (item) => typeof item === "object" && item !== null &&
      typeof (item as Record<string, unknown>).id === "string" &&
      typeof (item as Record<string, unknown>).pixelId === "string"
  );
}

export function loadPixels(): SavedPixel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!isValidPixelArray(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    return parsed;
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  }
}

function savePixels(pixels: SavedPixel[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pixels));
}

export function upsertPixel(pixel: SavedPixel): void {
  const pixels = loadPixels();
  const idx = pixels.findIndex((p) => p.id === pixel.id);
  if (idx >= 0) {
    pixels[idx] = pixel;
  } else {
    pixels.push(pixel);
  }
  savePixels(pixels);
}

export function deletePixel(id: string): void {
  const pixels = loadPixels().filter((p) => p.id !== id);
  savePixels(pixels);
}

export function getPixelById(id: string): SavedPixel | undefined {
  return loadPixels().find((p) => p.id === id);
}
