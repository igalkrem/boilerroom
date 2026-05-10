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

const CARD_W = 160;
const FAN_STEP = 172; // card width + 12px gap

function CardFace({
  asset,
  accentColors,
  showRemoveButton,
  onPreview,
  onRemove,
  addButton,
}: {
  asset: SiloAsset;
  accentColors: string[];
  showRemoveButton: boolean;
  onPreview: () => void;
  onRemove: () => void;
  addButton?: React.ReactNode;
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
        className="absolute bottom-2 left-3 right-10 z-10 text-white text-[11px] font-semibold truncate pointer-events-none"
        style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
      >
        {asset.name ?? asset.originalFileName ?? ""}
      </p>

      {/* Add creative button (slot) */}
      {addButton}

      {/* Per-creative remove button — appears on hover when shown */}
      {showRemoveButton && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="nodrag absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-black/55 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-red-600/80 text-[10px] opacity-0 group-hover/card:opacity-100 transition-all"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function CreativeGroupNode({ data }: { data: CreativeGroupNodeData }) {
  const store = useCanvasStore();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [fanned, setFanned] = useState(false);

  const group = store.creativeGroups.find((g) => g.id === data.groupId);
  if (!group) return null;

  const assets = group.creativeIds
    .map((id) => getAssetById(id))
    .filter((a): a is SiloAsset => a !== undefined);

  const connectedColors = store.edges.groupToProvider
    .filter((e) => e.groupId === data.groupId)
    .map((e) => data.providerColorMap[e.feedProviderId] ?? "#94a3b8");

  const multi = assets.length > 1;
  const previewAsset = previewId ? getAssetById(previewId) : null;

  const addBtn = assets.length < 5 ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); data.onAddCreative(data.groupId); }}
      className="nodrag absolute bottom-2 right-2 z-20 w-7 h-7 rounded-full bg-white/20 backdrop-blur-sm border border-white/25 flex items-center justify-center text-white text-lg leading-none hover:bg-white/30 transition-colors"
    >
      +
    </button>
  ) : undefined;

  return (
    <>
      <div className="relative group/node" style={{ width: CARD_W }}>
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className="!w-7 !h-7 !rounded-full !bg-white !border-[3px] !border-gray-700 !shadow-md !z-20"
        />

        {/* Group-level remove button — ghost, appears on hover */}
        <button
          type="button"
          onClick={() => data.onRemoveGroup(data.groupId)}
          className="nodrag absolute -top-2 -right-2 z-30 w-6 h-6 rounded-full bg-gray-900 border border-gray-600 flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-600 hover:border-red-500 text-[10px] opacity-0 group-hover/node:opacity-100 transition-all"
        >
          ✕
        </button>

        {assets.length === 0 ? (
          /* ── Empty state ── */
          <div
            className="nodrag rounded-xl border-2 border-dashed border-gray-600 bg-gray-900/80 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-gray-500 hover:bg-gray-800/60 transition-colors"
            style={{ width: CARD_W, aspectRatio: "9/16" }}
            onClick={() => data.onAddCreative(data.groupId)}
          >
            <div className="w-9 h-9 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center text-gray-500 text-xl">
              +
            </div>
            <span className="text-xs text-gray-600 font-medium">Add creative</span>
          </div>
        ) : (
          /* ── Card stack ── */
          <div className="relative" style={{ width: CARD_W, aspectRatio: "9/16" }}>

            {/* Back cards (index 1, 2, 3…) */}
            {assets.slice(1).map((asset, i) => {
              const idx = i + 1;
              return (
                <div
                  key={asset.id}
                  className="absolute inset-0 rounded-xl overflow-hidden shadow-lg"
                  style={{
                    zIndex: assets.length - idx,
                    transform: fanned
                      ? `translateX(${idx * FAN_STEP}px) translateY(${idx * 8}px)`
                      : `translateX(${idx * 7}px) scale(${1 - idx * 0.05})`,
                    transformOrigin: "top left",
                    transition: "transform 0.42s cubic-bezier(0.34, 1.3, 0.64, 1)",
                  }}
                >
                  <CardFace
                    asset={asset}
                    accentColors={connectedColors}
                    showRemoveButton={fanned}
                    onPreview={() => setPreviewId(asset.id)}
                    onRemove={() => store.removeCreativeFromGroup(data.groupId, asset.id)}
                  />
                </div>
              );
            })}

            {/* Front card */}
            <div
              className="absolute inset-0 rounded-xl overflow-hidden shadow-xl"
              style={{ zIndex: assets.length }}
            >
              <CardFace
                asset={assets[0]}
                accentColors={connectedColors}
                showRemoveButton={fanned}
                onPreview={() => setPreviewId(assets[0].id)}
                onRemove={() => store.removeCreativeFromGroup(data.groupId, assets[0].id)}
                addButton={addBtn}
              />

              {/* Count badge / fan toggle */}
              {multi && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFanned((f) => !f); }}
                  className="nodrag absolute top-2 left-2 z-20 bg-black/55 backdrop-blur-sm border border-white/15 rounded-lg px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-black/70 transition-colors select-none"
                >
                  {fanned ? "✕" : `${assets.length} ▾`}
                </button>
              )}
            </div>

          </div>
        )}
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
