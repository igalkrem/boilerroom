export interface SavedPixel {
  id: string;      // local UUID
  name: string;    // user-friendly label (e.g. "Main Website Pixel")
  pixelId: string; // the actual Snap Pixel ID
  createdAt: string; // ISO timestamp
}
