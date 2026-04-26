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

export interface SiloAsset {
  id: string;
  name: string;
  tagId?: string;
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
}

export interface SiloTag {
  id: string;
  name: string;
  prefix: string;
  nextIndex: number;
  createdAt: string;
}
