"use client";

import { useState, useEffect } from "react";
import { loadAssets, getSnapMediaId } from "@/lib/silo";
import { loadTags } from "@/lib/silo-tags";
import { AssetCard } from "./AssetCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { SiloAsset, SiloTag } from "@/types/silo";

interface SiloBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: SiloAsset) => void;
  adAccountId: string;
  multiSelect?: boolean;
  onMultiSelect?: (assets: SiloAsset[]) => void;
}

export function SiloBrowser({ isOpen, onClose, onSelect, adAccountId, multiSelect, onMultiSelect }: SiloBrowserProps) {
  const [assets, setAssets] = useState<SiloAsset[]>([]);
  const [tags, setTags] = useState<SiloTag[]>([]);
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterType, setFilterType] = useState<"" | "IMAGE" | "VIDEO">("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    setAssets(loadAssets().filter((a) => a.status !== "archived"));
    setTags(loadTags());
    setSelectedIds(new Set());
  }, [isOpen]);

  if (!isOpen) return null;

  const tagMap = Object.fromEntries(tags.map((t) => [t.id, t.name]));

  const filtered = assets.filter((a) => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterTag && a.tagId !== filterTag) return false;
    if (filterType && a.mediaType !== filterType) return false;
    return true;
  });

  // Sort: cached for this ad account first, then by upload date desc
  const sorted = [...filtered].sort((a, b) => {
    const aReady = !!getSnapMediaId(a, adAccountId);
    const bReady = !!getSnapMediaId(b, adAccountId);
    if (aReady && !bReady) return -1;
    if (!aReady && bReady) return 1;
    return new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime();
  });

  const toggleSelect = (asset: SiloAsset) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(asset.id)) next.delete(asset.id);
      else next.add(asset.id);
      return next;
    });
  };

  const handleConfirmMulti = () => {
    const selectedAssets = assets.filter((a) => selectedIds.has(a.id));
    onMultiSelect?.(selectedAssets);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Select from Silo</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {multiSelect
                ? "Click assets to select — then confirm below"
                : "Assets with ✓ are already cached for this ad account — no upload needed"}
            </p>
          </div>
          <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl" onClick={onClose}>✕</button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-700 flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <Input
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
          >
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as "" | "IMAGE" | "VIDEO")}
          >
            <option value="">All types</option>
            <option value="IMAGE">Images</option>
            <option value="VIDEO">Videos</option>
          </select>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {sorted.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <p className="text-gray-500 text-sm">
                {assets.length === 0 ? "No assets in Silo yet." : "No assets match your filters."}
              </p>
              {assets.length === 0 && (
                <p className="text-xs text-gray-400">Upload media from Dashboard → Silo first.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {sorted.map((asset) => (
                <div key={asset.id} className="relative">
                  <AssetCard
                    asset={asset}
                    tagName={asset.tagId ? tagMap[asset.tagId] : undefined}
                    selectMode
                    selectedAdAccountId={adAccountId}
                    onPreview={() => {}}
                    onSelect={multiSelect ? () => toggleSelect(asset) : onSelect}
                  />
                  {multiSelect && selectedIds.has(asset.id) && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center pointer-events-none z-10">
                      <span className="text-white text-[11px] font-bold">✓</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Multi-select confirm */}
        {multiSelect && selectedIds.size > 0 && (
          <div className="px-6 pt-3 pb-3 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={handleConfirmMulti}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Add {selectedIds.size} creative{selectedIds.size !== 1 ? "s" : ""}
            </button>
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
          <p className="text-xs text-gray-400">{sorted.length} asset{sorted.length !== 1 ? "s" : ""}</p>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
