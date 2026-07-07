export interface SavedMetaPixel {
  id: string;      // local UUID
  name: string;    // user-friendly label
  pixelId: string; // the actual Meta Pixel (dataset) ID
  createdAt: string;
}
