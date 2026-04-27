import { z } from "zod";
import type { SiloAsset, SnapchatUploadStatus } from "@/types/silo";
import { syncToKV } from "@/lib/kv-sync";

const STORAGE_KEY = "boilerroom_silo_v1";
const KV_KEY = "br_silo_assets";

const usageRecordSchema = z.object({
  adAccountId: z.string(),
  campaignName: z.string(),
  creativeName: z.string(),
  usedAt: z.string(),
});

const snapchatUploadSchema = z.object({
  adAccountId: z.string(),
  adAccountName: z.string(),
  stage: z.enum(["queued", "uploading_chunks", "processing", "ready", "failed", "interrupted"]),
  snapMediaId: z.string().optional(),
  error: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

const assetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tagId: z.string().optional(),
  mediaType: z.enum(["IMAGE", "VIDEO"]),
  fileFormat: z.string().min(1),
  fileSize: z.number().positive(),
  originalFileName: z.string().min(1),
  resolution: z.string().optional(),
  durationSeconds: z.number().optional(),
  hash: z.string().min(1),
  status: z.enum(["processing", "ready", "failed", "archived"]),
  thumbnailUrl: z.string().min(1),
  originalUrl: z.string().min(1),
  optimizedUrl: z.string().optional(),
  uploadDate: z.string().min(1),
  usageHistory: z.array(usageRecordSchema),
  snapchatUploads: z.array(snapchatUploadSchema),
});

function saveAssets(assets: SiloAsset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
  syncToKV(KV_KEY, assets);
}

export function loadAssets(): SiloAsset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    return parsed.filter((item) => assetSchema.safeParse(item).success) as SiloAsset[];
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  }
}

export function upsertAsset(asset: SiloAsset): void {
  const assets = loadAssets();
  const idx = assets.findIndex((a) => a.id === asset.id);
  if (idx >= 0) {
    assets[idx] = asset;
  } else {
    assets.push(asset);
  }
  saveAssets(assets);
}

export function deleteAsset(id: string): void {
  saveAssets(loadAssets().filter((a) => a.id !== id));
}

export function getAssetById(id: string): SiloAsset | undefined {
  return loadAssets().find((a) => a.id === id);
}

export function findByHash(hash: string): SiloAsset | undefined {
  return loadAssets().find((a) => a.hash === hash);
}

export function getSnapMediaId(asset: SiloAsset, adAccountId: string): string | undefined {
  return asset.snapchatUploads.find(
    (s) => s.adAccountId === adAccountId && s.stage === "ready"
  )?.snapMediaId;
}

export function updateSnapchatUpload(
  assetId: string,
  adAccountId: string,
  patch: Partial<SnapchatUploadStatus>
): void {
  const asset = getAssetById(assetId);
  if (!asset) return;
  const uploads = asset.snapchatUploads.map((s) =>
    s.adAccountId === adAccountId ? { ...s, ...patch } : s
  );
  if (!uploads.find((s) => s.adAccountId === adAccountId)) {
    uploads.push({ adAccountId, adAccountName: adAccountId, stage: "queued", ...patch });
  }
  upsertAsset({ ...asset, snapchatUploads: uploads });
}
