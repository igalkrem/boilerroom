"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatFileSize } from "@/lib/silo-utils";
import type { SiloAsset } from "@/types/silo";
import { clsx } from "clsx";

interface AssetCardProps {
  asset: SiloAsset;
  tagName?: string;
  selectMode?: boolean;
  selectedAdAccountId?: string;
  onPreview: (asset: SiloAsset) => void;
  onDelete?: (asset: SiloAsset) => void;
  onSelect?: (asset: SiloAsset) => void;
  onUploadToSnapchat?: (asset: SiloAsset) => void;
}

function statusBadge(asset: SiloAsset) {
  switch (asset.status) {
    case "ready": return <Badge variant="green">Ready</Badge>;
    case "processing": return <Badge variant="yellow">Processing</Badge>;
    case "failed": return <Badge variant="red">Failed</Badge>;
    case "archived": return <Badge variant="gray">Archived</Badge>;
  }
}

function snapAccountBadges(asset: SiloAsset, highlightAdAccountId?: string) {
  const ready = asset.snapchatUploads.filter((s) => s.stage === "ready");
  if (ready.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {ready.map((s) => (
        <span
          key={s.adAccountId}
          className={clsx(
            "text-[10px] px-1.5 py-0.5 rounded font-medium",
            s.adAccountId === highlightAdAccountId
              ? "bg-cyan-100 text-cyan-800"
              : "bg-gray-100 text-gray-500"
          )}
          title={`Snapchat: ${s.adAccountName}`}
        >
          {s.adAccountId === highlightAdAccountId ? "✓ Cached" : "Snap ✓"}
        </span>
      ))}
    </div>
  );
}

export function AssetCard({
  asset,
  tagName,
  selectMode,
  selectedAdAccountId,
  onPreview,
  onDelete,
  onSelect,
  onUploadToSnapchat,
}: AssetCardProps) {
  return (
    <div
      className={clsx(
        "bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col",
        selectMode && "cursor-pointer hover:border-cyan-400 hover:shadow-md transition-all"
      )}
      onClick={selectMode ? () => onSelect?.(asset) : undefined}
    >
      {/* Thumbnail */}
      <div className="relative bg-gray-900 aspect-[9/16] overflow-hidden max-h-[280px]">
        {asset.thumbnailUrl ? (
          <img
            src={asset.thumbnailUrl}
            alt={asset.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
            {asset.mediaType === "VIDEO" ? "🎬" : "🖼"} No preview
          </div>
        )}
        <div className="absolute top-2 left-2">
          <span className="text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded font-medium">
            {asset.mediaType}
          </span>
        </div>
        {asset.mediaType === "VIDEO" && asset.durationSeconds != null && (
          <div className="absolute bottom-2 right-2 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
            {Math.floor(asset.durationSeconds / 60)}:{String(Math.round(asset.durationSeconds % 60)).padStart(2, "0")}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="text-sm font-semibold text-gray-900 leading-snug truncate" title={asset.name}>
          {asset.name}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {statusBadge(asset)}
          {tagName && <Badge variant="gray">{tagName}</Badge>}
        </div>
        <p className="text-xs text-gray-400">
          {formatFileSize(asset.fileSize)} · {new Date(asset.uploadDate).toLocaleDateString()}
        </p>
        {snapAccountBadges(asset, selectedAdAccountId)}
      </div>

      {/* Actions */}
      {!selectMode && (
        <div className="px-3 pb-3 flex gap-1.5 flex-wrap border-t border-gray-100 pt-2.5">
          <Button size="sm" variant="secondary" onClick={() => onPreview(asset)}>
            Preview
          </Button>
          {onUploadToSnapchat && (
            <Button size="sm" variant="secondary" onClick={() => onUploadToSnapchat(asset)}>
              → Snapchat
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-red-500 hover:text-red-700"
              onClick={() => onDelete(asset)}
            >
              Delete
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
