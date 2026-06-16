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
  onPickProviders: (rowId: string) => void;
}

export const CARD_W = 160;
export const CARD_GAP = 12;
const CARD_H = Math.round(CARD_W * (16 / 9)); // 285

// Dock geometry — handle sits at the node's right edge, past the dock
export const DOCK_LEAD = 32;
export const DOCK_W = 142;
export const DOCK_TO_HANDLE = 22;

// Per-creative accent colours for multi-creative name pills (index-stable)
const CREATIVE_NAME_COLORS = [
  { stripe: "#3b82f6", bg: "rgba(59,130,246,0.2)",  border: "rgba(59,130,246,0.4)",  text: "#bfdbfe" },
  { stripe: "#818cf8", bg: "rgba(99,102,241,0.2)",   border: "rgba(99,102,241,0.4)",  text: "#c7d2fe" },
  { stripe: "#a78bfa", bg: "rgba(139,92,246,0.2)",   border: "rgba(139,92,246,0.4)",  text: "#ddd6fe" },
  { stripe: "#34d399", bg: "rgba(52,211,153,0.2)",   border: "rgba(52,211,153,0.4)",  text: "#a7f3d0" },
  { stripe: "#fb923c", bg: "rgba(251,146,60,0.2)",   border: "rgba(251,146,60,0.4)",  text: "#fed7aa" },
];

function CardFace({
  asset,
  allAssets,
  accentColors,
  onPreview,
  onRemove,
}: {
  asset: SiloAsset;
  allAssets: SiloAsset[];
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

  const multi = allAssets.length > 1;

  return (
    <div className="relative w-full h-full group/card">
      {/* Left provider accent stripe */}
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

      {/* Bottom gradient — deeper when stacking multiple name pills */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: multi
            ? "linear-gradient(to bottom, transparent 20%, rgba(0,0,0,0.97) 100%)"
            : "linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.75) 100%)",
        }}
      />

      {/* Asset name area */}
      <div className="absolute bottom-2 left-2 right-2 z-10 flex flex-col gap-1">
        {multi ? (
          /* Stacked coloured pills — one per creative in the slot */
          allAssets.map((a, i) => {
            const c = CREATIVE_NAME_COLORS[i % CREATIVE_NAME_COLORS.length];
            return (
              <div
                key={a.id}
                className="flex items-stretch overflow-hidden rounded-[5px]"
                style={{ background: c.bg, border: `1px solid ${c.border}` }}
              >
                <div className="w-[3px] shrink-0 rounded-l-[5px]" style={{ background: c.stripe }} />
                <span className="text-[10px] font-bold px-1.5 py-[3px] truncate" style={{ color: c.text }}>
                  {a.name ?? a.originalFileName ?? ""}
                </span>
              </div>
            );
          })
        ) : (
          /* Single asset — subtle frosted pill */
          <div className="flex items-center overflow-hidden rounded-[5px] bg-white/[0.08] border border-white/[0.12]">
            <p
              className="text-[11px] font-semibold text-white px-1.5 py-[3px] truncate"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}
            >
              {asset.name ?? asset.originalFileName ?? ""}
            </p>
          </div>
        )}
      </div>

      {/* Slot-level remove (hover-reveal is fine — it's a destructive action on one slot) */}
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
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const row = store.creativeRows.find((r) => r.id === data.rowId);
  if (!row) return null;

  const groupsInDomOrder = row.groupIds;

  const connectedColors = store.edges.rowToProvider
    .filter((e) => e.rowId === data.rowId)
    .map((e) => data.providerColorMap[e.feedProviderId] ?? "#94a3b8");

  const previewAsset = previewId ? getAssetById(previewId) : null;
  const isEmpty = row.groupIds.length === 0;

  const rowWidth = row.groupIds.length * CARD_W + Math.max(0, row.groupIds.length - 1) * CARD_GAP;
  // nodeWidth extends past the dock so the handle (Position.Right) lands to the right of it
  const nodeWidth = isEmpty ? CARD_W : rowWidth + DOCK_LEAD + DOCK_W + DOCK_TO_HANDLE;

  return (
    <>
      <div className="relative" style={{ width: nodeWidth }}>

        {/* Row handle — anchored at right edge of nodeWidth, past the side dock */}
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className="!w-7 !h-7 !rounded-full !bg-white !border-[3px] !border-gray-700 !shadow-md !z-20"
        />

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
          /* ── Row of slot columns ── */
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
              const allGroupAssets = group.creativeIds
                .map((id) => getAssetById(id))
                .filter(Boolean) as SiloAsset[];

              return (
                /* Per-slot column: card on top, add-creative button below */
                <div key={groupId} className="flex flex-col gap-1.5" style={{ width: CARD_W }}>

                  {/* Card */}
                  <div
                    className="relative rounded-xl overflow-hidden shadow-xl shrink-0 group/slot"
                    style={{ width: CARD_W, aspectRatio: "9/16" }}
                  >
                    <CardFace
                      asset={asset}
                      allAssets={allGroupAssets}
                      accentColors={connectedColors}
                      onPreview={() => setPreviewId(asset.id)}
                      onRemove={() => store.removeGroupFromRow(data.rowId, groupId)}
                    />

                    {/* Multi-creative count badge — clickable to expand/collapse */}
                    {creativeCount > 1 && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setExpandedGroupId(expandedGroupId === groupId ? null : groupId); }}
                        title="Expand slot"
                        className={`nodrag absolute top-2 left-2 z-20 backdrop-blur-sm border rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white transition-colors ${
                          expandedGroupId === groupId
                            ? "bg-blue-600/80 border-blue-400/40"
                            : "bg-black/60 border-white/15 hover:bg-black/80"
                        }`}
                      >
                        ×{creativeCount}
                      </button>
                    )}

                    {/* Slot expansion overlay */}
                    {expandedGroupId === groupId && (
                      <div
                        className="nodrag absolute inset-0 z-25 bg-black/80 rounded-xl flex flex-col items-center justify-center gap-2 p-2"
                        onClick={(e) => { e.stopPropagation(); setExpandedGroupId(null); }}
                      >
                        <p className="text-[9px] text-gray-400 font-medium tracking-wide uppercase">Slot creatives</p>
                        <div className="flex gap-1.5 flex-wrap justify-center" onClick={(e) => e.stopPropagation()}>
                          {group.creativeIds.map((cId) => {
                            const cAsset = getAssetById(cId);
                            if (!cAsset) return null;
                            return (
                              <div key={cId} className="relative rounded-md overflow-hidden shrink-0 group/mini" style={{ width: 44, aspectRatio: "9/16" }}>
                                {cAsset.thumbnailUrl ? (
                                  <img
                                    src={cAsset.thumbnailUrl}
                                    alt={cAsset.name ?? ""}
                                    className="w-full h-full object-cover cursor-pointer"
                                    onClick={() => setPreviewId(cId)}
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gray-700 flex items-center justify-center text-gray-400 text-xs cursor-pointer" onClick={() => setPreviewId(cId)}>
                                    {cAsset.mediaType === "VIDEO" ? "▶" : "🖼"}
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); store.removeCreativeFromGroup(groupId, cId); }}
                                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-red-600/80 text-[8px] opacity-0 group-hover/mini:opacity-100 transition-all"
                                >
                                  ✕
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[9px] text-gray-500">tap outside to close</p>
                      </div>
                    )}
                  </div>

                  {/* Add creative to this slot — always visible below the card */}
                  {creativeCount < 5 && expandedGroupId !== groupId && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); data.onAddToSlot(groupId); }}
                      className="nodrag w-full flex items-center justify-center gap-1 h-8 rounded-lg text-[11px] font-semibold text-gray-500 bg-gray-900/80 border border-dashed border-gray-600 hover:bg-blue-900/20 hover:border-blue-500/40 hover:text-blue-400 transition-colors cursor-pointer"
                    >
                      <span className="text-sm leading-none">＋</span> Add creative
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Side dock — sits between cards and handle inside the wider nodeWidth */}
        {!isEmpty && (
          <div
            className="absolute flex flex-col justify-center gap-[5px]"
            style={{ left: rowWidth + DOCK_LEAD, top: 0, height: CARD_H, width: DOCK_W }}
          >
            {/* Group 1: creative / connection */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data.onAddToRow(data.rowId);
              }}
              disabled={row.groupIds.length >= 8}
              className="nodrag flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold bg-blue-900/30 border border-blue-500/40 text-blue-300 hover:bg-blue-800/40 hover:border-blue-400/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              <span>⊞</span> Add slot
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); data.onPickProviders(data.rowId); }}
              className="nodrag flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold bg-blue-900/20 border border-blue-500/30 text-blue-400 hover:bg-blue-800/30 hover:border-blue-400/50 transition-colors whitespace-nowrap"
            >
              <span>🔗</span> Provider
            </button>

            <div className="h-px bg-gray-700 mx-1" />

            {/* Group 2: row management */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); data.onNewRow(); }}
              className="nodrag flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold bg-gray-800 border border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors whitespace-nowrap"
            >
              <span>↓</span> New row
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); data.onDuplicateRow(data.rowId); }}
              className="nodrag flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold bg-gray-800 border border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors whitespace-nowrap"
            >
              <span>⧉</span> Duplicate
            </button>

            <div className="h-px bg-gray-700 mx-1" />

            {/* Group 3: destructive */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); data.onRemoveRow(data.rowId); }}
              className="nodrag flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold bg-red-900/10 border border-red-500/30 text-red-300 hover:bg-red-900/25 hover:border-red-400/50 transition-colors whitespace-nowrap"
            >
              <span>✕</span> Remove row
            </button>
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
