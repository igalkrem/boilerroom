"use client";

import { useState } from "react";
import { useCanvasStore } from "@/hooks/useCanvasStore";
import { getAssetById } from "@/lib/silo";
import type { SiloAsset } from "@/types/silo";
import type { FeedProvider } from "@/types/feed-provider";
import type { Article } from "@/types/article";
import type { CampaignPreset } from "@/types/preset";

interface CreativeRowNodeData {
  rowId: string;
  providerColorMap: Record<string, string>;
  providers: FeedProvider[];
  articles: Article[];
  accounts: Array<{ id: string; name: string }>;
  presets: CampaignPreset[];
  onAddToRow: (rowId: string) => void;
  onAddToSlot: (groupId: string) => void;
  onRemoveRow: (rowId: string) => void;
  onNewRow: () => void;
  onDuplicateRow: (rowId: string) => void;
}

const CARD_W = 160;
const CARD_GAP = 12;

const CTA_OPTIONS = [
  "MORE",
  "SHOP_NOW",
  "SIGN_UP",
  "DOWNLOAD",
  "WATCH",
  "GET_NOW",
  "ORDER_NOW",
  "BOOK_NOW",
  "APPLY_NOW",
  "BUY_NOW",
];

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

type PickerKind = "provider" | "article" | "account" | "preset";

function PickerModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="nodrag fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-4 w-80 max-h-[70vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto flex-1 space-y-1">{children}</div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors w-full"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function CheckboxRow({
  selected,
  onClick,
  label,
  leading,
}: {
  selected: boolean;
  onClick: () => void;
  label: React.ReactNode;
  leading?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
        selected
          ? "bg-blue-600/20 border border-blue-500/40 text-blue-300"
          : "bg-gray-800 border border-transparent text-gray-300 hover:bg-gray-700"
      }`}
    >
      <span
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
          selected ? "bg-blue-600 border-blue-500" : "border-gray-600"
        }`}
      >
        {selected && <span className="text-white text-[10px]">✓</span>}
      </span>
      {leading}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function CreativeGroupNode({ data }: { data: CreativeRowNodeData }) {
  const store = useCanvasStore();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [activePicker, setActivePicker] = useState<PickerKind | null>(null);
  const [expandedArticleKey, setExpandedArticleKey] = useState<string | null>(null);
  const [editingDupesPresetId, setEditingDupesPresetId] = useState<string | null>(null);

  const row = store.creativeRows.find((r) => r.id === data.rowId);
  const config = store.rowConfigs.find((c) => c.rowId === data.rowId);
  if (!row || !config) return null;

  // groupIds[0] = newest (prepended on add) = leftmost.
  const groupsInDomOrder = row.groupIds;

  const connectedColors = config.feedProviderIds.map(
    (id) => data.providerColorMap[id] ?? "#94a3b8"
  );

  const previewAsset = previewId ? getAssetById(previewId) : null;
  const isEmpty = row.groupIds.length === 0;

  const rowWidth = isEmpty ? CARD_W : row.groupIds.length * CARD_W + (row.groupIds.length - 1) * CARD_GAP;
  const panelWidth = Math.max(rowWidth, 420);

  const hasProvider = config.feedProviderIds.length > 0;
  const hasArticle = config.articles.length > 0;
  const hasAccount = config.adAccountIds.length > 0;

  // Articles filtered by selected providers
  const eligibleArticles = data.articles.filter((a) =>
    config.feedProviderIds.includes(a.feedProviderId)
  );
  // Presets filtered by selected providers (or unbound presets)
  const eligiblePresets = data.presets.filter(
    (p) => !p.feedProviderId || config.feedProviderIds.includes(p.feedProviderId)
  );

  return (
    <>
      <div className="relative group/node" style={{ width: Math.max(rowWidth, panelWidth) }}>
        {/* Whole-row remove button — top-right, visible on row hover */}
        <button
          type="button"
          onClick={() => data.onRemoveRow(data.rowId)}
          title="Remove row"
          className="nodrag absolute -top-2 z-30 w-6 h-6 rounded-full bg-gray-900 border border-gray-600 flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-600 hover:border-red-500 text-[10px] opacity-0 group-hover/node:opacity-100 transition-all"
          style={{ right: -2 }}
        >
          ✕
        </button>

        {/* Cards row container — fixed to rowWidth so cards stay at left edge of node */}
        <div className="relative" style={{ width: rowWidth }}>
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

                    {creativeCount < 5 && expandedGroupId !== groupId && (
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
        </div>

        {/* ── Inline config panel ── */}
        <div
          className="nodrag mt-3 rounded-xl border border-gray-700 bg-gray-900/90 backdrop-blur-sm p-3 space-y-2 shadow-md"
          style={{ minWidth: panelWidth }}
        >
          {/* Feed row */}
          <ConfigRow
            label="Feed"
            onAdd={() => setActivePicker("provider")}
          >
            {config.feedProviderIds.map((pid) => {
              const provider = data.providers.find((p) => p.id === pid);
              const color = data.providerColorMap[pid] ?? "#94a3b8";
              return (
                <Pill
                  key={pid}
                  onRemove={() => store.removeProviderFromRow(data.rowId, pid)}
                  leading={
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ backgroundColor: color }}
                    />
                  }
                >
                  {provider?.name ?? pid}
                </Pill>
              );
            })}
          </ConfigRow>

          {/* Articles row */}
          {hasProvider && (
            <>
              <ConfigRow label="Articles" onAdd={() => setActivePicker("article")}>
                {config.articles.map((a) => {
                  const article = data.articles.find((x) => x.id === a.articleId);
                  const key = `${a.feedProviderId}-${a.articleId}`;
                  const color = data.providerColorMap[a.feedProviderId] ?? "#94a3b8";
                  return (
                    <Pill
                      key={key}
                      onClick={() => setExpandedArticleKey(expandedArticleKey === key ? null : key)}
                      onRemove={() =>
                        store.toggleArticleInRow(data.rowId, a.feedProviderId, a.articleId)
                      }
                      active={expandedArticleKey === key}
                      leading={
                        <span
                          className="w-1.5 h-1.5 rounded-full inline-block"
                          style={{ backgroundColor: color }}
                        />
                      }
                    >
                      {article?.slug ?? a.articleId}
                    </Pill>
                  );
                })}
              </ConfigRow>

              {/* Inline headline/CTA editor */}
              {expandedArticleKey &&
                (() => {
                  const parts = expandedArticleKey.split("-");
                  const fpid = parts[0];
                  const aid = parts.slice(1).join("-");
                  const sel = config.articles.find(
                    (x) => x.feedProviderId === fpid && x.articleId === aid
                  );
                  const article = data.articles.find((x) => x.id === aid);
                  if (!sel || !article) return null;
                  return (
                    <div className="ml-[60px] rounded-lg bg-gray-800/80 border border-gray-700 p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase tracking-wide text-gray-400 w-16 shrink-0">
                          Headline
                        </label>
                        {article.allowedHeadlines.length > 0 ? (
                          <select
                            value={sel.headline}
                            onChange={(e) => {
                              const text = e.target.value;
                              const h = article.allowedHeadlines.find((h) => h.text === text);
                              store.setRowArticleContent(
                                data.rowId,
                                fpid,
                                aid,
                                text,
                                sel.callToAction,
                                h?.rac ?? ""
                              );
                            }}
                            className="flex-1 text-xs px-2 py-1 rounded-md bg-gray-900 border border-gray-700 text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">— Select —</option>
                            {article.allowedHeadlines.map((h, i) => (
                              <option key={i} value={h.text}>
                                {h.text}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            maxLength={34}
                            value={sel.headline}
                            onChange={(e) =>
                              store.setRowArticleContent(
                                data.rowId,
                                fpid,
                                aid,
                                e.target.value,
                                sel.callToAction,
                                sel.headlineRac
                              )
                            }
                            className="flex-1 text-xs px-2 py-1 rounded-md bg-gray-900 border border-gray-700 text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase tracking-wide text-gray-400 w-16 shrink-0">
                          CTA
                        </label>
                        <select
                          value={sel.callToAction}
                          onChange={(e) =>
                            store.setRowArticleContent(
                              data.rowId,
                              fpid,
                              aid,
                              sel.headline,
                              e.target.value,
                              sel.headlineRac
                            )
                          }
                          className="flex-1 text-xs px-2 py-1 rounded-md bg-gray-900 border border-gray-700 text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {CTA_OPTIONS.map((cta) => (
                            <option key={cta} value={cta}>
                              {cta}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })()}
            </>
          )}

          {/* Accounts row */}
          {hasArticle && (
            <ConfigRow label="Accounts" onAdd={() => setActivePicker("account")}>
              {config.adAccountIds.map((aid) => {
                const acc = data.accounts.find((a) => a.id === aid);
                return (
                  <Pill
                    key={aid}
                    onRemove={() => store.toggleAdAccountInRow(data.rowId, aid)}
                  >
                    {acc?.name ?? aid}
                  </Pill>
                );
              })}
            </ConfigRow>
          )}

          {/* Preset row */}
          {hasAccount && (
            <ConfigRow label="Preset" onAdd={() => setActivePicker("preset")}>
              {config.presets.map(({ presetId, duplications }) => {
                const preset = data.presets.find((p) => p.id === presetId);
                return (
                  <span
                    key={presetId}
                    className="inline-flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-full pl-2.5 pr-1 py-0.5 text-[11px] text-gray-200"
                  >
                    <span className="truncate max-w-[140px]">{preset?.name ?? presetId}</span>
                    {editingDupesPresetId === presetId ? (
                      <input
                        type="number"
                        min={1}
                        max={10}
                        autoFocus
                        defaultValue={duplications}
                        onBlur={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (!Number.isNaN(n)) {
                            store.setRowPresetDuplications(data.rowId, presetId, n);
                          }
                          setEditingDupesPresetId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const n = parseInt((e.target as HTMLInputElement).value, 10);
                            if (!Number.isNaN(n)) {
                              store.setRowPresetDuplications(data.rowId, presetId, n);
                            }
                            setEditingDupesPresetId(null);
                          } else if (e.key === "Escape") {
                            setEditingDupesPresetId(null);
                          }
                        }}
                        className="w-10 text-[11px] px-1 py-0 rounded bg-gray-900 border border-gray-600 text-gray-100"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingDupesPresetId(presetId)}
                        title="Click to change duplication count"
                        className="px-1.5 py-0.5 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-200 text-[10px] font-semibold hover:bg-blue-600/50"
                      >
                        ×{duplications}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => store.togglePresetInRow(data.rowId, presetId)}
                      className="ml-0.5 w-4 h-4 rounded-full bg-gray-700/60 hover:bg-red-600/70 flex items-center justify-center text-[9px] text-gray-300 hover:text-white"
                    >
                      ✕
                    </button>
                  </span>
                );
              })}
            </ConfigRow>
          )}
        </div>

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

      {/* ── Picker modals ── */}
      {activePicker === "provider" && (
        <PickerModal title="Feed providers" onClose={() => setActivePicker(null)}>
          {data.providers.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">No feed providers configured</p>
          ) : (
            data.providers.map((p) => {
              const selected = config.feedProviderIds.includes(p.id);
              const color = data.providerColorMap[p.id] ?? "#94a3b8";
              return (
                <CheckboxRow
                  key={p.id}
                  selected={selected}
                  onClick={() =>
                    selected
                      ? store.removeProviderFromRow(data.rowId, p.id)
                      : store.addProviderToRow(data.rowId, p.id)
                  }
                  label={p.name}
                  leading={
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                      style={{ backgroundColor: color }}
                    />
                  }
                />
              );
            })
          )}
        </PickerModal>
      )}

      {activePicker === "article" && (
        <PickerModal title="Articles" onClose={() => setActivePicker(null)}>
          {eligibleArticles.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">
              No articles for the selected provider(s)
            </p>
          ) : (
            eligibleArticles.map((article) => {
              const selected = config.articles.some(
                (a) => a.feedProviderId === article.feedProviderId && a.articleId === article.id
              );
              const color = data.providerColorMap[article.feedProviderId] ?? "#94a3b8";
              return (
                <CheckboxRow
                  key={article.id}
                  selected={selected}
                  onClick={() => {
                    const dh =
                      article.defaultHeadlineIndex !== undefined
                        ? article.allowedHeadlines[article.defaultHeadlineIndex]
                        : undefined;
                    store.toggleArticleInRow(
                      data.rowId,
                      article.feedProviderId,
                      article.id,
                      dh?.text,
                      dh?.rac
                    );
                  }}
                  label={article.slug}
                  leading={
                    <span
                      className="w-2 h-2 rounded-full inline-block shrink-0"
                      style={{ backgroundColor: color }}
                    />
                  }
                />
              );
            })
          )}
        </PickerModal>
      )}

      {activePicker === "account" && (
        <PickerModal title="Ad accounts" onClose={() => setActivePicker(null)}>
          {data.accounts.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">No ad accounts available</p>
          ) : (
            data.accounts.map((acc) => {
              const selected = config.adAccountIds.includes(acc.id);
              return (
                <CheckboxRow
                  key={acc.id}
                  selected={selected}
                  onClick={() => store.toggleAdAccountInRow(data.rowId, acc.id)}
                  label={acc.name}
                />
              );
            })
          )}
        </PickerModal>
      )}

      {activePicker === "preset" && (
        <PickerModal title="Presets" onClose={() => setActivePicker(null)}>
          {eligiblePresets.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">
              No presets for the selected provider(s)
            </p>
          ) : (
            eligiblePresets.map((preset) => {
              const selected = config.presets.some((p) => p.presetId === preset.id);
              return (
                <CheckboxRow
                  key={preset.id}
                  selected={selected}
                  onClick={() => store.togglePresetInRow(data.rowId, preset.id)}
                  label={preset.name}
                />
              );
            })
          )}
        </PickerModal>
      )}

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

// ─── Config-panel helpers ─────────────────────────────────────────────────────

function ConfigRow({
  label,
  children,
  onAdd,
}: {
  label: string;
  children: React.ReactNode;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-14 shrink-0 pt-0.5 text-[10px] uppercase tracking-wider font-semibold text-gray-400">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 flex-1">
        {children}
        <button
          type="button"
          onClick={onAdd}
          className="nodrag px-2 py-0.5 rounded-full border border-dashed border-gray-600 text-[11px] text-gray-400 hover:text-gray-200 hover:border-gray-400 hover:bg-gray-800 transition-colors"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

function Pill({
  children,
  onRemove,
  onClick,
  active,
  leading,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  onClick?: () => void;
  active?: boolean;
  leading?: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full pl-2 pr-1 py-0.5 text-[11px] border transition-colors ${
        active
          ? "bg-blue-600/20 border-blue-500/40 text-blue-200"
          : "bg-gray-800 border-gray-700 text-gray-200"
      }`}
    >
      {leading}
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="nodrag truncate max-w-[140px] hover:underline"
        >
          {children}
        </button>
      ) : (
        <span className="truncate max-w-[140px]">{children}</span>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="nodrag w-4 h-4 rounded-full bg-gray-700/60 hover:bg-red-600/70 flex items-center justify-center text-[9px] text-gray-300 hover:text-white"
      >
        ✕
      </button>
    </span>
  );
}
