"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { updateSnapchatUpload, getAssetById } from "@/lib/silo";
import { uploadBlobToSnapchat, PollTimeoutError } from "@/lib/uploadMediaToSnapchat";
import type { SiloAsset, SnapchatUploadStatus, SnapchatUploadStage } from "@/types/silo";
import type { SnapAdAccount } from "@/types/snapchat";

interface SnapchatUploadModalProps {
  assets: SiloAsset[];
  isOpen: boolean;
  onClose: () => void;
  onComplete: (updatedAssets: SiloAsset[]) => void;
}

type AccountRow = SnapAdAccount & { uploadStatus?: SnapchatUploadStatus };

const CONCURRENCY = 2;

function stageBadge(stage: SnapchatUploadStage | undefined) {
  if (!stage) return null;
  const map: Record<SnapchatUploadStage, { label: string; color: string }> = {
    queued: { label: "Queued", color: "text-gray-500" },
    uploading_chunks: { label: "Uploading…", color: "text-cyan-600" },
    processing: { label: "Processing on Snapchat…", color: "text-yellow-600" },
    ready: { label: "Ready ✅", color: "text-green-600" },
    failed: { label: "Failed ❌", color: "text-red-600" },
    interrupted: { label: "Interrupted ⚠️", color: "text-orange-500" },
  };
  const entry = map[stage];
  return <span className={`text-xs font-medium ${entry.color}`}>{entry.label}</span>;
}

export function SnapchatUploadModal({ assets, isOpen, onClose, onComplete }: SnapchatUploadModalProps) {
  const isBulk = assets.length > 1;
  // Single-asset mode: track the one asset's live state
  const [currentAsset, setCurrentAsset] = useState<SiloAsset>(assets[0]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [progressMsg, setProgressMsg] = useState<Record<string, string>>({});
  // Bulk mode: plain progress log
  const [bulkLog, setBulkLog] = useState<string[]>([]);
  const [bulkDone, setBulkDone] = useState(false);

  useEffect(() => {
    if (!isBulk) setCurrentAsset(assets[0]);
  }, [assets, isBulk]);

  useEffect(() => {
    if (!isOpen) return;
    setLoadingAccounts(true);
    fetch("/api/snapchat/ad-accounts")
      .then((r) => r.json())
      .then((data) => {
        const rows: AccountRow[] = (data.accounts ?? []).map((a: SnapAdAccount) => ({
          ...a,
          uploadStatus: isBulk
            ? undefined
            : currentAsset.snapchatUploads.find((s) => s.adAccountId === a.id),
        }));
        setAccounts(rows);
      })
      .catch(() => setAccounts([]))
      .finally(() => setLoadingAccounts(false));
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  // ── Single-asset helpers ──────────────────────────────────────────────────

  function toggleAccount(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function uploadAssetToAccount(asset: SiloAsset, account: AccountRow): Promise<SiloAsset> {
    const adAccountId = account.id;

    updateSnapchatUpload(asset.id, adAccountId, {
      adAccountName: account.name,
      stage: "uploading_chunks",
      startedAt: new Date().toISOString(),
      completedAt: undefined,
      error: undefined,
      snapMediaId: undefined,
    });

    if (!isBulk) setCurrentAsset({ ...getAssetById(asset.id)! });

    try {
      const sourceUpload = asset.snapchatUploads.find((s) => s.stage === "ready");
      if (sourceUpload?.snapMediaId) {
        if (!isBulk) setProgressMsg((p) => ({ ...p, [adAccountId]: "Copying from existing Snapchat media…" }));
        const copyRes = await fetch("/api/snapchat/media/copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceAdAccountId: sourceUpload.adAccountId,
            destinationAdAccountId: adAccountId,
            mediaIds: [sourceUpload.snapMediaId],
          }),
        });
        const copyData = await copyRes.json();
        if (!copyData.orgMismatch && copyData.results?.[0]?.newMediaId) {
          updateSnapchatUpload(asset.id, adAccountId, {
            stage: "ready",
            snapMediaId: copyData.results[0].newMediaId,
            completedAt: new Date().toISOString(),
          });
          const refreshed = getAssetById(asset.id)!;
          if (!isBulk) {
            setCurrentAsset({ ...refreshed });
            setAccounts((prev) => prev.map((a) =>
              a.id === adAccountId
                ? { ...a, uploadStatus: refreshed.snapchatUploads.find((s) => s.adAccountId === adAccountId) }
                : a
            ));
          }
          return refreshed;
        }
      }

      updateSnapchatUpload(asset.id, adAccountId, { stage: "uploading_chunks" });
      if (!isBulk) setCurrentAsset({ ...getAssetById(asset.id)! });

      const blobUrl = asset.optimizedUrl ?? asset.originalUrl;
      const snapMediaId = await uploadBlobToSnapchat(
        blobUrl,
        asset.originalFileName,
        adAccountId,
        asset.mediaType,
        (msg) => { if (!isBulk) setProgressMsg((p) => ({ ...p, [adAccountId]: msg })); }
      );

      updateSnapchatUpload(asset.id, adAccountId, {
        stage: "ready",
        snapMediaId,
        completedAt: new Date().toISOString(),
      });
      const refreshed = getAssetById(asset.id)!;
      if (!isBulk) {
        setCurrentAsset({ ...refreshed });
        setAccounts((prev) => prev.map((a) =>
          a.id === adAccountId
            ? { ...a, uploadStatus: refreshed.snapchatUploads.find((s) => s.adAccountId === adAccountId) }
            : a
        ));
      }
      return refreshed;
    } catch (err) {
      if (err instanceof PollTimeoutError) {
        updateSnapchatUpload(asset.id, adAccountId, { stage: "processing", snapMediaId: err.mediaId });
      } else {
        updateSnapchatUpload(asset.id, adAccountId, {
          stage: "failed",
          error: String(err),
          completedAt: new Date().toISOString(),
        });
      }
      if (!isBulk) setCurrentAsset({ ...getAssetById(asset.id)! });
      return getAssetById(asset.id)!;
    } finally {
      if (!isBulk) setProgressMsg((p) => { const n = { ...p }; delete n[adAccountId]; return n; });
    }
  }

  async function startUpload() {
    const targets = accounts.filter((a) => selected.has(a.id));
    if (targets.length === 0) return;
    setRunning(true);
    setSelected(new Set());

    if (isBulk) {
      // Bulk: upload each asset to each selected account sequentially
      setBulkLog([]);
      setBulkDone(false);
      const updatedAssets: SiloAsset[] = [];
      for (const asset of assets) {
        const queue = [...targets];
        const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
          while (queue.length > 0) {
            const account = queue.shift();
            if (!account) break;
            setBulkLog((l) => [...l, `Uploading "${asset.name}" → ${account.name}…`]);
            const updated = await uploadAssetToAccount(asset, account);
            setBulkLog((l) => {
              const next = [...l];
              next[next.length - 1] = `✓ "${asset.name}" → ${account.name}`;
              return next;
            });
            if (!updatedAssets.find((a) => a.id === updated.id)) {
              updatedAssets.push(updated);
            } else {
              const idx = updatedAssets.findIndex((a) => a.id === updated.id);
              updatedAssets[idx] = updated;
            }
          }
        });
        await Promise.all(workers);
      }
      setBulkDone(true);
      setRunning(false);
      onComplete(updatedAssets);
    } else {
      // Single asset: original logic
      const queue = [...targets];
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length > 0) {
          const account = queue.shift();
          if (!account) break;
          await uploadAssetToAccount(currentAsset, account);
        }
      });
      await Promise.all(workers);
      setRunning(false);
      onComplete([getAssetById(currentAsset.id) ?? currentAsset]);
    }
  }

  async function resumeUpload(account: AccountRow) {
    setRunning(true);
    await uploadAssetToAccount(currentAsset, account);
    setRunning(false);
    onComplete([getAssetById(currentAsset.id) ?? currentAsset]);
  }

  async function checkStatus(account: AccountRow) {
    const upload = currentAsset.snapchatUploads.find((s) => s.adAccountId === account.id);
    if (!upload?.snapMediaId && upload?.stage !== "processing") return;
    const pollRes = await fetch("/api/snapchat/media/poll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId: upload.snapMediaId ?? "", adAccountId: account.id }),
    });
    const pollData = await pollRes.json();
    if (pollData.status === "READY") {
      updateSnapchatUpload(currentAsset.id, account.id, {
        stage: "ready",
        snapMediaId: upload.snapMediaId,
        completedAt: new Date().toISOString(),
      });
      setCurrentAsset({ ...getAssetById(currentAsset.id)! });
    }
  }

  const uploadableSelected = [...selected].filter((id) => {
    const row = accounts.find((a) => a.id === id);
    return isBulk ? true : row?.uploadStatus?.stage !== "ready";
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Upload to Snapchat</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
              {isBulk ? `${assets.length} assets selected` : currentAsset.name}
            </p>
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={onClose}>✕</button>
        </div>

        <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* Bulk progress log */}
          {isBulk && bulkLog.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              {bulkLog.map((line, i) => (
                <p key={i} className="text-xs text-gray-600 font-mono">{line}</p>
              ))}
            </div>
          )}

          {/* Account list */}
          {!bulkDone && (
            <>
              {loadingAccounts && <p className="text-sm text-gray-500">Loading ad accounts…</p>}
              {!loadingAccounts && accounts.length === 0 && (
                <Alert type="error">Could not load ad accounts.</Alert>
              )}
              {accounts.map((account) => {
                const status = isBulk
                  ? undefined
                  : currentAsset.snapchatUploads.find((s) => s.adAccountId === account.id);
                const isReady = !isBulk && status?.stage === "ready";
                const isProcessing = !isBulk && status?.stage === "processing";
                const isInterrupted = !isBulk && (status?.stage === "interrupted" || (status?.stage === "uploading_chunks" && !running));
                const isFailed = !isBulk && status?.stage === "failed";
                const isRunningNow = running && selected.size > 0;

                return (
                  <div
                    key={account.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
                  >
                    {(!isReady && !isRunningNow) && (
                      <input
                        type="checkbox"
                        checked={selected.has(account.id)}
                        onChange={() => toggleAccount(account.id)}
                        disabled={running}
                        className="h-4 w-4 rounded border-gray-300 text-cyan-600"
                      />
                    )}
                    {(isReady || isRunningNow) && <div className="w-4 h-4 shrink-0" />}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{account.name}</p>
                      {!isBulk && progressMsg[account.id] && (
                        <p className="text-xs text-gray-500 animate-pulse">{progressMsg[account.id]}</p>
                      )}
                      {!isBulk && status?.error && (
                        <p className="text-xs text-red-500 mt-0.5">{status.error}</p>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {!isBulk && stageBadge(status?.stage)}
                      {isProcessing && !running && (
                        <Button size="sm" variant="ghost" onClick={() => checkStatus(account)}>Check</Button>
                      )}
                      {(isInterrupted || isFailed) && !running && (
                        <Button size="sm" variant="secondary" onClick={() => resumeUpload(account)}>
                          {isInterrupted ? "Resume" : "Retry"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {bulkDone && (
            <p className="text-sm text-green-700 font-medium text-center py-2">
              All uploads complete ✅
            </p>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
          <Button variant="ghost" onClick={onClose} disabled={running}>Close</Button>
          {uploadableSelected.length > 0 && !running && !bulkDone && (
            <Button onClick={startUpload}>
              {isBulk
                ? `Upload ${assets.length} asset${assets.length !== 1 ? "s" : ""} to ${uploadableSelected.length} account${uploadableSelected.length !== 1 ? "s" : ""}`
                : `Upload to ${uploadableSelected.length} account${uploadableSelected.length !== 1 ? "s" : ""}`
              }
            </Button>
          )}
          {running && <Button disabled loading>Uploading…</Button>}
        </div>
      </div>
    </div>
  );
}
