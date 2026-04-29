"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AssetCard } from "@/components/silo/AssetCard";
import { AssetPreviewModal } from "@/components/silo/AssetPreviewModal";
import { SnapchatUploadModal } from "@/components/silo/SnapchatUploadModal";
import { loadAssets, deleteAsset, upsertAsset } from "@/lib/silo";
import { loadTags } from "@/lib/silo-tags";
import type { SiloAsset, SiloTag } from "@/types/silo";
import { Input } from "@/components/ui/Input";

export default function SiloPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<SiloAsset[]>([]);
  const [tags, setTags] = useState<SiloTag[]>([]);
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterType, setFilterType] = useState<"" | "IMAGE" | "VIDEO">("");
  const [filterStatus, setFilterStatus] = useState<"" | "ready" | "processing" | "failed" | "archived">("");
  const [previewAsset, setPreviewAsset] = useState<SiloAsset | null>(null);
  const [snapUploadAsset, setSnapUploadAsset] = useState<SiloAsset | null>(null);

  function reload() {
    setAssets(loadAssets());
    setTags(loadTags());
  }

  useEffect(() => { reload(); }, []);

  function handleDelete(asset: SiloAsset) {
    if (!window.confirm(`Delete "${asset.name}"? This will permanently remove the files from storage.`)) return;
    // Delete Blob files via server route
    const urls = [asset.originalUrl, asset.optimizedUrl, asset.thumbnailUrl].filter(Boolean) as string[];
    fetch("/api/silo/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    }).catch(console.error);
    deleteAsset(asset.id);
    reload();
    if (previewAsset?.id === asset.id) setPreviewAsset(null);
  }

  const tagMap = Object.fromEntries(tags.map((t) => [t.id, t.name]));

  const filtered = assets.filter((a) => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterTag && a.tagId !== filterTag) return false;
    if (filterType && a.mediaType !== filterType) return false;
    if (filterStatus && a.status !== filterStatus) return false;
    return true;
  }).sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Silo</h1>
          <p className="text-sm text-gray-500 mt-1">Your media library. Upload once, reuse everywhere.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.push("/dashboard/silo/tags")}>
            Tags
          </Button>
          <Button onClick={() => router.push("/dashboard/silo/upload")}>
            + Upload Media
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
        >
          <option value="">All tags</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as "" | "IMAGE" | "VIDEO")}
        >
          <option value="">All types</option>
          <option value="IMAGE">Images</option>
          <option value="VIDEO">Videos</option>
        </select>
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
        >
          <option value="">All statuses</option>
          <option value="ready">Ready</option>
          <option value="processing">Processing</option>
          <option value="failed">Failed</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Empty state */}
      {assets.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-16 text-center space-y-3">
          <p className="text-gray-500 text-sm">No media in your library yet.</p>
          <Button variant="secondary" onClick={() => router.push("/dashboard/silo/upload")}>
            Upload your first file
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <p className="text-gray-500 text-sm">No assets match your filters.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400">{filtered.length} asset{filtered.length !== 1 ? "s" : ""}</p>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(180px,240px))]">
            {filtered.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                tagName={asset.tagId ? tagMap[asset.tagId] : undefined}
                onPreview={setPreviewAsset}
                onDelete={handleDelete}
                onUploadToSnapchat={setSnapUploadAsset}
              />
            ))}
          </div>
        </>
      )}

      {previewAsset && (
        <AssetPreviewModal
          asset={previewAsset}
          tagName={previewAsset.tagId ? tagMap[previewAsset.tagId] : undefined}
          isOpen
          onClose={() => setPreviewAsset(null)}
          onUploadToSnapchat={(a) => { setPreviewAsset(null); setSnapUploadAsset(a); }}
          onAssetUpdated={(updated) => {
            upsertAsset(updated);
            setPreviewAsset(updated);
            reload();
          }}
        />
      )}

      {snapUploadAsset && (
        <SnapchatUploadModal
          asset={snapUploadAsset}
          isOpen
          onClose={() => setSnapUploadAsset(null)}
          onComplete={(updated) => {
            upsertAsset(updated);
            setSnapUploadAsset(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
