export type AssetStatus = "processing" | "ready" | "failed" | "archived";
export type AssetMediaType = "IMAGE" | "VIDEO";

export interface UsageRecord {
  adAccountId: string;
  campaignName: string;
  creativeName: string;
  usedAt: string;
}

// Internal stage labels — Snapchat's actual upload_status values are "PENDING_UPLOAD" and "READY".
export type SnapchatUploadStage =
  | "queued"
  | "uploading_chunks"
  | "processing"
  | "ready"
  | "failed"
  | "interrupted";

export interface SnapchatUploadStatus {
  adAccountId: string;
  adAccountName: string;
  stage: SnapchatUploadStage;
  snapMediaId?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

// Meta's media API (POST /api/meta/media) uploads an image hash or a video id
// and — for video — polls processing status server-side before responding, so
// there's no client-visible "processing" state like Snapchat's chunked path.
export type MetaUploadStage = "queued" | "uploading" | "ready" | "failed";

export interface MetaUploadStatus {
  adAccountId: string;
  adAccountName: string;
  stage: MetaUploadStage;
  imageHash?: string;
  videoId?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface SiloAsset {
  id: string;
  name: string;
  tagId?: string;
  vname?: string;
  mediaType: AssetMediaType;
  fileFormat: string;
  fileSize: number;
  originalFileName: string;
  resolution?: string;
  durationSeconds?: number;
  hash: string;
  status: AssetStatus;
  thumbnailUrl: string;
  originalUrl: string;
  optimizedUrl?: string;
  uploadDate: string;
  usageHistory: UsageRecord[];
  snapchatUploads: SnapchatUploadStatus[];
  metaUploads: MetaUploadStatus[];
}

export interface SiloTag {
  id: string;
  name: string;
  prefix: string;
  nextIndex: number;
  createdAt: string;
}
