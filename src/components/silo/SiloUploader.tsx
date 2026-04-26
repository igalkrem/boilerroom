"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { upload } from "@vercel/blob/client";
import { v4 as uuid } from "uuid";
import { clsx } from "clsx";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import {
  computeHash,
  optimizeImage,
  generateThumbnail,
  getVideoDuration,
  getImageResolution,
  formatFileSize,
} from "@/lib/silo-utils";
import { findByHash, upsertAsset } from "@/lib/silo";
import { getTagById, consumeNextIndex, buildAssetName } from "@/lib/silo-tags";
import type { SiloAsset, AssetMediaType } from "@/types/silo";

type FileStage = "queued" | "hashing" | "processing" | "uploading" | "done" | "failed" | "duplicate";

interface FileProgress {
  id: string;
  file: File;
  stage: FileStage;
  progress: number; // 0–100 for uploading
  error?: string;
  existingAsset?: SiloAsset; // set when duplicate detected
}

interface SiloUploaderProps {
  tagId?: string;
  onComplete: (assets: SiloAsset[]) => void;
}

const CONCURRENCY = 3;

async function processAndUpload(
  fp: FileProgress,
  tagId: string | undefined,
  onUpdate: (patch: Partial<FileProgress>) => void
): Promise<SiloAsset | null> {
  const { file } = fp;
  const mediaType: AssetMediaType = file.type.startsWith("video/") ? "VIDEO" : "IMAGE";

  // 1. Hash
  onUpdate({ stage: "hashing" });
  let hash: string;
  try {
    hash = await computeHash(file);
  } catch {
    onUpdate({ stage: "failed", error: "Hash computation failed" });
    return null;
  }

  const existing = findByHash(hash);
  if (existing) {
    onUpdate({ stage: "duplicate", existingAsset: existing });
    return null;
  }

  // 2. Optimize + thumbnail in parallel
  onUpdate({ stage: "processing" });
  let optimizedFile: File | null = null;
  let thumbnailBlob: Blob;
  let resolution: string | undefined;
  let durationSeconds: number | undefined;

  try {
    const [thumbResult, metaResult] = await Promise.all([
      generateThumbnail(file, mediaType),
      mediaType === "IMAGE"
        ? Promise.all([optimizeImage(file), getImageResolution(file)]).then(([opt, res]) => ({ opt, res }))
        : getVideoDuration(file).then((dur) => ({ dur })),
    ]);
    thumbnailBlob = thumbResult;

    if (mediaType === "IMAGE" && "opt" in metaResult) {
      optimizedFile = metaResult.opt;
      resolution = metaResult.res;
    } else if ("dur" in metaResult) {
      durationSeconds = metaResult.dur;
    }
  } catch (err) {
    onUpdate({ stage: "failed", error: `Processing failed: ${String(err)}` });
    return null;
  }

  // 3. Upload to Vercel Blob — original, optimized (if image), thumbnail all in parallel
  onUpdate({ stage: "uploading", progress: 0 });
  const assetId = uuid();
  const safeBase = file.name.replace(/[^a-zA-Z0-9._\-]/g, "_").slice(0, 80);

  try {
    const uploadPromises: Promise<string>[] = [];

    // Original — multipart avoids single-PUT hang for large files
    uploadPromises.push(
      upload(`silo/${assetId}/original_${safeBase}`, file, {
        access: "public",
        handleUploadUrl: "/api/silo/upload",
        multipart: true,
        onUploadProgress: ({ percentage }) => {
          onUpdate({ progress: Math.round(percentage * 0.7) }); // original = 70% of progress
        },
      }).then((r) => r.url)
    );

    // Optimized image
    if (optimizedFile) {
      const optName = safeBase.replace(/\.[^.]+$/, ".jpg");
      uploadPromises.push(
        upload(`silo/${assetId}/optimized_${optName}`, optimizedFile, {
          access: "public",
          handleUploadUrl: "/api/silo/upload",
          multipart: true,
        }).then((r) => r.url)
      );
    }

    // Thumbnail
    uploadPromises.push(
      upload(`silo/${assetId}/thumb_${safeBase.replace(/\.[^.]+$/, ".jpg")}`, thumbnailBlob, {
        access: "public",
        handleUploadUrl: "/api/silo/upload",
        multipart: true,
      }).then((r) => r.url)
    );

    const urls = await Promise.all(uploadPromises);
    onUpdate({ progress: 95 });

    const originalUrl = urls[0];
    const optimizedUrl = optimizedFile ? urls[1] : undefined;
    const thumbnailUrl = urls[optimizedFile ? 2 : 1];

    // 4. Determine asset name
    let name = safeBase.replace(/\.[^.]+$/, "");
    if (tagId) {
      try {
        const tag = getTagById(tagId);
        if (tag) {
          const index = consumeNextIndex(tagId);
          name = buildAssetName(tag, index);
        }
      } catch { /* fall back to filename */ }
    }

    const asset: SiloAsset = {
      id: assetId,
      name,
      tagId,
      mediaType,
      fileFormat: file.type,
      fileSize: file.size,
      originalFileName: file.name,
      resolution,
      durationSeconds,
      hash,
      status: "ready",
      thumbnailUrl,
      originalUrl,
      optimizedUrl,
      uploadDate: new Date().toISOString(),
      usageHistory: [],
      snapchatUploads: [],
    };

    upsertAsset(asset);
    onUpdate({ stage: "done", progress: 100 });
    return asset;
  } catch (err) {
    onUpdate({ stage: "failed", error: `Upload failed: ${String(err)}` });
    return null;
  }
}

export function SiloUploader({ tagId, onComplete }: SiloUploaderProps) {
  const [files, setFiles] = useState<FileProgress[]>([]);
  const [running, setRunning] = useState(false);

  const tagName = tagId ? getTagById(tagId)?.name : undefined;

  function updateFile(id: string, patch: Partial<FileProgress>) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  const onDrop = useCallback((accepted: File[]) => {
    const newFiles: FileProgress[] = accepted.map((file) => ({
      id: uuid(),
      file,
      stage: "queued" as FileStage,
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [], "video/*": [] },
    disabled: running,
  });

  async function startUpload() {
    const queued = files.filter((f) => f.stage === "queued");
    if (queued.length === 0) return;
    setRunning(true);

    const results: SiloAsset[] = [];
    const queue = [...queued];

    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const fp = queue.shift();
        if (!fp) break;
        const asset = await processAndUpload(fp, tagId, (patch) => updateFile(fp.id, patch));
        if (asset) results.push(asset);
      }
    });

    await Promise.all(workers);
    setRunning(false);
    if (results.length > 0) onComplete(results);
  }

  function retryFile(id: string) {
    setFiles((prev) => prev.map((f) => f.id === id ? { ...f, stage: "queued", error: undefined } : f));
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function forceAddDuplicate(fp: FileProgress) {
    // Override duplicate check by re-queuing with a modified File whose content will produce a new hash
    // We handle this by letting the user keep the file but skip dedup
    setFiles((prev) => prev.map((f) =>
      f.id === fp.id ? { ...f, stage: "queued", existingAsset: undefined } : f
    ));
  }

  const queuedCount = files.filter((f) => f.stage === "queued").length;
  const doneCount = files.filter((f) => f.stage === "done").length;
  const failedCount = files.filter((f) => f.stage === "failed").length;
  const dupCount = files.filter((f) => f.stage === "duplicate").length;

  function stageLabel(f: FileProgress): string {
    switch (f.stage) {
      case "queued": return "Queued";
      case "hashing": return "Checking…";
      case "processing": return "Optimizing…";
      case "uploading": return `Uploading ${f.progress}%`;
      case "done": return "Done ✅";
      case "failed": return `Failed ❌`;
      case "duplicate": return "Duplicate ⚠️";
    }
  }

  function stageColor(stage: FileStage): string {
    if (stage === "done") return "text-green-600";
    if (stage === "failed") return "text-red-600";
    if (stage === "duplicate") return "text-yellow-600";
    return "text-gray-500";
  }

  return (
    <div className="space-y-4">
      {tagName && (
        <p className="text-sm text-gray-600">
          Uploading under tag <span className="font-semibold text-gray-900">{tagName}</span> — files will be auto-named <span className="font-mono text-gray-700">{tagName}_v_001</span>, <span className="font-mono text-gray-700">{tagName}_v_002</span>…
        </p>
      )}

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={clsx(
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
          isDragActive ? "border-cyan-400 bg-cyan-50" : "border-gray-300 hover:border-gray-400",
          running && "opacity-50 cursor-default"
        )}
      >
        <input {...getInputProps()} />
        <div className="text-3xl mb-2">↑</div>
        <p className="text-sm text-gray-600 font-medium">Drag & drop images or videos here, or click to browse</p>
        <p className="text-xs text-gray-400 mt-1">PNG/JPG/MP4 · Batch upload supported · Max 500 MB per file</p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
          {files.map((fp) => (
            <div key={fp.id} className="flex items-center gap-3 px-4 py-3 bg-white">
              <div className="text-lg shrink-0">
                {fp.file.type.startsWith("video/") ? "🎬" : "🖼"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{fp.file.name}</p>
                <p className="text-xs text-gray-400">{formatFileSize(fp.file.size)}</p>
                {fp.stage === "uploading" && (
                  <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 transition-all duration-300"
                      style={{ width: `${fp.progress}%` }}
                    />
                  </div>
                )}
                {fp.stage === "duplicate" && fp.existingAsset && (
                  <p className="text-xs text-yellow-700 mt-0.5">
                    Already in library as <span className="font-semibold">{fp.existingAsset.name}</span>
                  </p>
                )}
                {fp.stage === "failed" && fp.error && (
                  <p className="text-xs text-red-600 mt-0.5">{fp.error}</p>
                )}
              </div>
              <span className={clsx("text-xs font-medium shrink-0", stageColor(fp.stage))}>
                {stageLabel(fp)}
              </span>
              <div className="flex gap-1 shrink-0">
                {fp.stage === "failed" && (
                  <Button size="sm" variant="ghost" onClick={() => retryFile(fp.id)}>↺</Button>
                )}
                {fp.stage === "duplicate" && (
                  <Button size="sm" variant="ghost" onClick={() => forceAddDuplicate(fp)}>Add anyway</Button>
                )}
                {(fp.stage === "queued" || fp.stage === "done" || fp.stage === "failed" || fp.stage === "duplicate") && (
                  <Button size="sm" variant="ghost" onClick={() => removeFile(fp.id)}>✕</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary + actions */}
      {files.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {files.length} file{files.length !== 1 ? "s" : ""}
            {doneCount > 0 && ` · ${doneCount} done`}
            {failedCount > 0 && ` · ${failedCount} failed`}
            {dupCount > 0 && ` · ${dupCount} duplicate${dupCount !== 1 ? "s" : ""}`}
          </p>
          {queuedCount > 0 && !running && (
            <Button onClick={startUpload}>
              Upload {queuedCount} file{queuedCount !== 1 ? "s" : ""}
            </Button>
          )}
          {running && (
            <Button disabled loading>Uploading…</Button>
          )}
        </div>
      )}

      {failedCount > 0 && (
        <Alert type="error">
          {failedCount} file{failedCount !== 1 ? "s" : ""} failed. Check the errors above and retry.
        </Alert>
      )}
    </div>
  );
}
