"use client";

import { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/hooks/useCanvasStore";
import { getAssetById } from "@/lib/silo";
import type { SiloAsset } from "@/types/silo";

interface CreativeGroupNodeData {
  groupId: string;
  providerColorMap: Record<string, string>;
  onAddCreative: (groupId: string) => void;
  onRemoveGroup: (groupId: string) => void;
}

export function CreativeGroupNode({ data }: { data: CreativeGroupNodeData }) {
  const store = useCanvasStore();
  const [previewId, setPreviewId] = useState<string | null>(null);

  const group = store.creativeGroups.find((g) => g.id === data.groupId);
  if (!group) return null;

  const assets = group.creativeIds
    .map((id) => getAssetById(id))
    .filter((a): a is SiloAsset => a !== undefined);

  const connectedColors = store.edges.groupToProvider
    .filter((e) => e.groupId === data.groupId)
    .map((e) => data.providerColorMap[e.feedProviderId] ?? "#94a3b8");

  const connected = connectedColors.length > 0;
  const empty = assets.length === 0;

  let borderStyle: React.CSSProperties = {};
  let containerClass = "border-gray-200 bg-white";

  if (empty) {
    containerClass = "border-red-200 bg-red-50/30";
  } else if (connected && connectedColors.length > 1) {
    borderStyle = {
      border: "2px solid transparent",
      backgroundImage: `linear-gradient(white, white), linear-gradient(to right, ${connectedColors.join(", ")})`,
      backgroundClip: "padding-box, border-box",
      backgroundOrigin: "border-box",
    };
    containerClass = "";
  } else if (connected) {
    borderStyle = { borderColor: connectedColors[0], borderWidth: 2, backgroundColor: `${connectedColors[0]}18` };
    containerClass = "";
  }

  const previewAsset = previewId ? getAssetById(previewId) : null;
  const firstName = assets[0]?.name ?? assets[0]?.originalFileName ?? "";
  const displayName = assets.length > 1 ? `${firstName} +${assets.length - 1}` : firstName;

  return (
    <>
      <div
        style={borderStyle}
        className={`relative rounded-2xl border-2 shadow-sm w-52 ${containerClass}`}
      >
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className="!w-5 !h-5 !rounded-full !bg-gray-400 !border-2 !border-white"
        />

        {/* Remove group button */}
        <button
          type="button"
          onClick={() => data.onRemoveGroup(data.groupId)}
          className="nodrag absolute top-2 right-2 w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-400 text-xs z-10 rounded-full hover:bg-red-50 transition-colors"
        >
          ✕
        </button>

        <div className="p-3">
          {/* Thumbnail row */}
          {assets.length > 0 ? (
            <div className="flex gap-1.5 flex-wrap">
              {assets.map((asset) => (
                <div key={asset.id} className="relative group/thumb shrink-0">
                  {asset.thumbnailUrl ? (
                    <img
                      src={asset.thumbnailUrl}
                      alt={asset.name}
                      className="w-16 h-[88px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setPreviewId(asset.id)}
                    />
                  ) : (
                    <div
                      className="w-16 h-[88px] rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xl cursor-pointer"
                      onClick={() => setPreviewId(asset.id)}
                    >
                      {asset.mediaType === "VIDEO" ? "▶" : "🖼"}
                    </div>
                  )}
                  {/* Remove creative from group */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      store.removeCreativeFromGroup(data.groupId, asset.id);
                    }}
                    className="nodrag absolute top-1 right-1 w-4 h-4 rounded-full bg-black/50 text-white text-[9px] flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity hover:bg-red-500"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full h-[88px] rounded-lg border-2 border-dashed border-red-200 flex items-center justify-center text-xs text-red-300">
              No creatives
            </div>
          )}

          {/* Display name */}
          {displayName && (
            <p className="text-xs font-medium text-gray-700 mt-2 truncate">{displayName}</p>
          )}

          {/* Add creative button */}
          {assets.length < 5 && (
            <button
              type="button"
              onClick={() => data.onAddCreative(data.groupId)}
              className="nodrag mt-2 w-full text-xs text-blue-500 hover:text-blue-700 border border-dashed border-blue-200 hover:border-blue-400 rounded-lg py-1 text-center transition-colors"
            >
              + Add creative
            </button>
          )}
        </div>
      </div>

      {/* Preview modal */}
      {previewAsset && (
        <div
          className="nodrag fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setPreviewId(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewId(null)}
              className="absolute top-3 right-3 z-10 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
            >
              ✕
            </button>
            {previewAsset.mediaType === "VIDEO" ? (
              <video
                src={previewAsset.optimizedUrl ?? previewAsset.originalUrl}
                controls
                autoPlay
                loop
                className="max-w-full max-h-[90vh] rounded-2xl"
              />
            ) : (
              <img
                src={previewAsset.optimizedUrl ?? previewAsset.originalUrl}
                alt={previewAsset.name}
                className="max-w-full max-h-[90vh] object-contain rounded-2xl"
              />
            )}
            <p className="absolute bottom-3 left-3 text-white text-sm font-medium bg-black/50 px-3 py-1 rounded-full">
              {previewAsset.name}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
