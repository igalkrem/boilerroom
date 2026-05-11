"use client";

import { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/hooks/useCanvasStore";
import { getAssetById } from "@/lib/silo";
import type { SiloAsset } from "@/types/silo";

interface CreativeRowNodeData {
  rowId: string;
  providerColorMap: Record<string, string>;
  onAddToRow: (rowId: string) => void;
  onAddToSlot: (groupId: string) => void;
  onRemoveRow: (rowId: string) => void;
  onNewRow: () => void;
  onDuplicateRow: (rowId: string) => void;
}

const CARD_W = 160;
const CARD_GAP = 12;

function CardFace({
  asset,
  accentColors,
  onPreview,
  onRemove,
}: {
  asset: SiloAsset;
  accentColors: string[];
  onPreview: () => void;
  onRemove: () => void;
}) {
  const stripeStyle: React.CSSProperties =
    accentColors.length > 1
      ? { background: `linear-gradient(to bottom, ${accentColors.join(", ")})` }
      : accentColors.length === 1
      ? { background: accentColors[0] }
      : {};

  return (
    <div className="relative w-full h-full group/card">
      {/* Left accent stripe */}
      {accentColors.length > 0 && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] z-10" style={stripeStyle} />
      )}

      {/* Thumbnail */}
      {asset.thumbnailUrl ? (
        <img
          src={asset.thumbnailUrl}
          alt={asset.name ?? asset.originalFileName ?? ""}
          className="w-full h-full object-cover cursor-pointer"
          onClick={onPreview}
        />
      ) : (
        <div
          className="w-full h-full bg-gray-700 flex items-center justify-center text-gray-400 text-2xl cursor-pointer"
          onClick={onPreview}
        >
          {asset.mediaType === "VIDEO" ? "▶" : "🖼"}
        </div>
      )}

      {/* Bottom gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/75 pointer-events-none" />

      {/* Asset name */}
      <p
        className="absolute bottom-2 left-3 right-3 z-10 text-white text-[11px] font-semibold truncate pointer-events-none"
        style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
      >
        {asset.name ?? asset.originalFileName ?? ""}
      </p>

      {/* Per-card remove button — visible on card hover */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="nodrag absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-black/55 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-red-600/80 text-[10px] opacity-0 group-hover/card:opacity-100 transition-all"
      >
        ✕
      </button>
    </div>
  );
}

export function CreativeGroupNode({ data }: { data: CreativeRowNodeData }) {
  const store = useCanvasStore();
  const [previewId, setPreviewId] = useState<string | null>(null);

  const row = store.creativeRows.find((r) => r.id === data.rowId);
  if (!row) return null;

  // groupIds[0] = newest (prepended on add) = leftmost.
  // groupIds[last] = oldest = rightmost, closest to the handle.
  const groupsInDomOrder = row.groupIds;

  const connectedColors = store.edges.rowToProvider
    .filter((e) => e.rowId === data.rowId)
    .map((e) => data.providerColorMap[e.feedProviderId] ?? "#94a3b8");

  const previewAsset = previewId ? getAssetById(previewId) : null;
  const isEmpty = row.groupIds.length === 0;

  // The visible row width helps us position the "+" button above the
  // rightmost card. With CARD_W and CARD_GAP, the rightmost card's right
  // edge sits at the container's right edge (the handle is anchored there).
  const rowWidth = isEmpty ? CARD_W : row.groupIds.length * CARD_W + (row.groupIds.length - 1) * CARD_GAP;

  return (
    <>
      <div className="relative group/node" style={{ width: rowWidth }}>
        {/* Shared row handle — anchored at right edge */}
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className="!w-7 !h-7 !rounded-full !bg-white !border-[3px] !border-gray-700 !shadow-md !z-20"
        />

        {/* Whole-row remove button — top-right, visible on row hover */}
        <button
          type="button"
          onClick={() => data.onRemoveRow(data.rowId)}
          title="Remove row"
          className="nodrag absolute -top-2 -right-2 z-30 w-6 h-6 rounded-full bg-gray-900 border border-gray-600 flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-600 hover:border-red-500 text-[10px] opacity-0 group-hover/node:opacity-100 transition-all"
        >
          ✕
        </button>

        {/* "+" button — above the rightmost card, visible on row hover */}
        {!isEmpty && row.groupIds.length < 8 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); data.onAddToRow(data.rowId); }}
            title="Add creative slot"
            className="nodrag absolute z-30 w-8 h-8 rounded-full bg-gray-900 border border-gray-600 flex items-center justify-center text-gray-300 hover:text-white hover:bg-blue-600 hover:border-blue-500 text-lg leading-none opacity-0 group-hover/node:opacity-100 transition-all shadow-md"
            style={{ top: -36, right: (CARD_W - 32) / 2 }}
          >
            +
          </button>
        )}

        {isEmpty ? (
          /* ── Empty state ── */
          <div
            className="nodrag rounded-xl border-2 border-dashed border-gray-600 bg-gray-900/80 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-gray-500 hover:bg-gray-800/60 transition-colors"
            style={{ width: CARD_W, aspectRatio: "9/16" }}
            onClick={() => data.onAddToRow(data.rowId)}
          >
            <div className="w-9 h-9 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center text-gray-500 text-xl">
              +
            </div>
            <span className="text-xs text-gray-600 font-medium">Add creative</span>
          </div>
        ) : (
          /* ── Row of cards ── */
          <div className="flex flex-row" style={{ gap: CARD_GAP }}>
            {groupsInDomOrder.map((groupId) => {
              const group = store.creativeGroups.find((g) => g.id === groupId);
              if (!group) return null;
              const firstAssetId = group.creativeIds[0];
              const asset = firstAssetId ? getAssetById(firstAssetId) : undefined;
              if (!asset) {
                return (
                  <div
                    key={groupId}
                    className="rounded-xl border-2 border-dashed border-gray-700 bg-gray-900/50 flex items-center justify-center text-[10px] text-gray-500"
                    style={{ width: CARD_W, aspectRatio: "9/16" }}
                  >
                    missing asset
                  </div>
                );
              }
              const creativeCount = group.creativeIds.length;
              return (
                <div
                  key={groupId}
                  className="relative rounded-xl overflow-hidden shadow-xl shrink-0 group/slot"
                  style={{ width: CARD_W, aspectRatio: "9/16" }}
                >
                  <CardFace
                    asset={asset}
                    accentColors={connectedColors}
                    onPreview={() => setPreviewId(asset.id)}
                    onRemove={() => store.removeGroupFromRow(data.rowId, groupId)}
                  />

                  {/* Multi-creative count badge */}
                  {creativeCount > 1 && (
                    <div className="absolute top-2 left-2 z-20 bg-black/60 backdrop-blur-sm border border-white/15 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white pointer-events-none">
                      ×{creativeCount}
                    </div>
                  )}

                  {/* Add-to-slot button — bottom center, visible on slot hover */}
                  {creativeCount < 5 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); data.onAddToSlot(groupId); }}
                      title="Add creative to this slot"
                      className="nodrag absolute bottom-8 left-1/2 -translate-x-1/2 z-20 w-7 h-7 rounded-full bg-black/55 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white/70 hover:text-white hover:bg-blue-600/80 text-sm leading-none opacity-0 group-hover/slot:opacity-100 transition-all"
                    >
                      +
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* "New row" / "Duplicate" — below row, visible on row hover */}
        <div className="absolute left-0 right-0 flex justify-center gap-2 opacity-0 group-hover/node:opacity-100 transition-opacity" style={{ bottom: -36 }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); data.onNewRow(); }}
            className="nodrag px-2.5 py-1 text-[11px] font-medium text-gray-300 bg-gray-900/90 hover:bg-gray-800 border border-gray-600 hover:border-gray-500 rounded-md shadow-sm transition-colors"
          >
            ↓ New row
          </button>
          {!isEmpty && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); data.onDuplicateRow(data.rowId); }}
              className="nodrag px-2.5 py-1 text-[11px] font-medium text-gray-300 bg-gray-900/90 hover:bg-gray-800 border border-gray-600 hover:border-gray-500 rounded-md shadow-sm transition-colors"
            >
              ⧉ Duplicate
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
