"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatFileSize } from "@/lib/silo-utils";
import { upsertAsset } from "@/lib/silo";
import type { SiloAsset } from "@/types/silo";

interface AssetPreviewModalProps {
  asset: SiloAsset;
  tagName?: string;
  isOpen: boolean;
  onClose: () => void;
  onUploadToSnapchat: (asset: SiloAsset) => void;
  onAssetUpdated: (asset: SiloAsset) => void;
}

export function AssetPreviewModal({
  asset,
  tagName,
  isOpen,
  onClose,
  onUploadToSnapchat,
  onAssetUpdated,
}: AssetPreviewModalProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(asset.name);

  if (!isOpen) return null;

  function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === asset.name) { setEditingName(false); return; }
    const updated = { ...asset, name: trimmed };
    upsertAsset(updated);
    onAssetUpdated(updated);
    setEditingName(false);
  }

  const readyUploads = asset.snapchatUploads.filter((s) => s.stage === "ready");
  const pendingUploads = asset.snapchatUploads.filter((s) => s.stage !== "ready" && s.stage !== "failed");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          {editingName ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                autoFocus
              />
              <Button size="sm" onClick={saveName}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">{asset.name}</h2>
              <button
                className="text-gray-400 hover:text-gray-600 text-sm"
                onClick={() => { setNameInput(asset.name); setEditingName(true); }}
                title="Edit name"
              >
                ✏️
              </button>
            </div>
          )}
          <button className="text-gray-400 hover:text-gray-600 text-xl ml-4" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

          {/* Preview pane */}
          <div className="md:w-1/2 bg-gray-950 flex items-center justify-center p-4 min-h-[300px]">
            {asset.mediaType === "VIDEO" ? (
              <video
                src={asset.originalUrl}
                controls
                className="max-w-full max-h-[60vh] rounded-lg"
              />
            ) : (
              <img
                src={asset.originalUrl}
                alt={asset.name}
                className="max-w-full max-h-[60vh] rounded-lg object-contain"
              />
            )}
          </div>

          {/* Metadata pane */}
          <div className="md:w-1/2 p-6 overflow-y-auto space-y-5">

            {/* Basic metadata */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Details</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-gray-500">Type</dt>
                <dd className="text-gray-900 font-medium">{asset.mediaType}</dd>
                <dt className="text-gray-500">Format</dt>
                <dd className="text-gray-900">{asset.fileFormat}</dd>
                <dt className="text-gray-500">Size</dt>
                <dd className="text-gray-900">{formatFileSize(asset.fileSize)}</dd>
                {asset.resolution && (
                  <>
                    <dt className="text-gray-500">Resolution</dt>
                    <dd className="text-gray-900">{asset.resolution}</dd>
                  </>
                )}
                {asset.durationSeconds != null && (
                  <>
                    <dt className="text-gray-500">Duration</dt>
                    <dd className="text-gray-900">
                      {Math.floor(asset.durationSeconds / 60)}m {Math.round(asset.durationSeconds % 60)}s
                    </dd>
                  </>
                )}
                {tagName && (
                  <>
                    <dt className="text-gray-500">Tag</dt>
                    <dd><Badge variant="gray">{tagName}</Badge></dd>
                  </>
                )}
                <dt className="text-gray-500">Uploaded</dt>
                <dd className="text-gray-900">{new Date(asset.uploadDate).toLocaleString()}</dd>
              </dl>
            </div>

            {/* Snapchat status */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Snapchat</h3>
              {readyUploads.length === 0 && pendingUploads.length === 0 ? (
                <p className="text-sm text-gray-400">Not yet uploaded to any ad account.</p>
              ) : (
                <ul className="space-y-1">
                  {readyUploads.map((s) => (
                    <li key={s.adAccountId} className="flex items-center gap-2 text-sm">
                      <span className="text-green-600">✅</span>
                      <span className="text-gray-700">{s.adAccountName}</span>
                      <span className="text-xs text-gray-400 font-mono truncate">{s.snapMediaId}</span>
                    </li>
                  ))}
                  {pendingUploads.map((s) => (
                    <li key={s.adAccountId} className="flex items-center gap-2 text-sm">
                      <span className="text-yellow-500">⏳</span>
                      <span className="text-gray-700">{s.adAccountName}</span>
                      <span className="text-xs text-gray-500">{s.stage}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Button size="sm" variant="secondary" onClick={() => onUploadToSnapchat(asset)}>
                Upload to Snapchat…
              </Button>
            </div>

            {/* Usage history */}
            {asset.usageHistory.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Usage History</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-100">
                        <th className="text-left pb-1 font-medium">Campaign</th>
                        <th className="text-left pb-1 font-medium">Creative</th>
                        <th className="text-left pb-1 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {asset.usageHistory.map((u, i) => (
                        <tr key={i}>
                          <td className="py-1 text-gray-700 truncate max-w-[120px]">{u.campaignName}</td>
                          <td className="py-1 text-gray-700 truncate max-w-[100px]">{u.creativeName}</td>
                          <td className="py-1 text-gray-400 whitespace-nowrap">{new Date(u.usedAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Downloads */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Download</h3>
              <div className="flex gap-2 flex-wrap">
                <a href={asset.originalUrl} download={asset.originalFileName} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="secondary">Original</Button>
                </a>
                {asset.optimizedUrl && (
                  <a href={asset.optimizedUrl} download={`optimized_${asset.originalFileName}`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="secondary">Optimized (1080×1920)</Button>
                  </a>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
