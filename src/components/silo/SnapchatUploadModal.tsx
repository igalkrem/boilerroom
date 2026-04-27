"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { updateSnapchatUpload, getAssetById } from "@/lib/silo";
import { uploadBlobToSnapchat, PollTimeoutError } from "@/lib/uploadMediaToSnapchat";
import type { SiloAsset, SnapchatUploadStatus, SnapchatUploadStage } from "@/types/silo";
import type { SnapAdAccount } from "@/types/snapchat";

interface SnapchatUploadModalProps {
  asset: SiloAsset;
  isOpen: boolean;
  onClose: () => void;
  onComplete: (updatedAsset: SiloAsset) => void;
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

export function SnapchatUploadModal({ asset, isOpen, onClose, onComplete }: SnapchatUploadModalProps) {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [currentAsset, setCurrentAsset] = useState<SiloAsset>(asset);
  const [progressMsg, setProgressMsg] = useState<Record<string, string>>({});

  useEffect(() => {
    setCurrentAsset(asset);
  }, [asset]);

  useEffect(() => {
    if (!isOpen) return;
    setLoadingAccounts(true);
    fetch("/api/snapchat/ad-accounts")
      .then((r) => r.json())
      .then((data) => {
        const rows: AccountRow[] = (data.accounts ?? []).map((a: SnapAdAccount) => ({
          ...a,
          uploadStatus: currentAsset.snapchatUploads.find((s) => s.adAccountId === a.id),
        }));
        setAccounts(rows);
      })
      .catch(() => setAccounts([]))
      .finally(() => setLoadingAccounts(false));
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  function toggleAccount(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function uploadToAccount(account: AccountRow): Promise<void> {
    const adAccountId = account.id;

    // Update stage to uploading_chunks immediately
    updateSnapchatUpload(currentAsset.id, adAccountId, {
      adAccountName: account.name,
      stage: "uploading_chunks",
      startedAt: new Date().toISOString(),
      completedAt: undefined,
      error: undefined,
      snapMediaId: undefined,
    });
    setCurrentAsset({ ...getAssetById(currentAsset.id)! });

    try {
      // Try media_copy first if asset already has a ready upload on another account
      const sourceUpload = currentAsset.snapchatUploads.find((s) => s.stage === "ready");
      if (sourceUpload?.snapMediaId) {
        setProgressMsg((p) => ({ ...p, [adAccountId]: "Copying from existing Snapchat media…" }));
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
          const newMediaId: string = copyData.results[0].newMediaId;
          updateSnapchatUpload(currentAsset.id, adAccountId, {
            stage: "ready",
            snapMediaId: newMediaId,
            completedAt: new Date().toISOString(),
          });
          const refreshed = getAssetById(currentAsset.id)!;
          setCurrentAsset({ ...refreshed });
          setAccounts((prev) => prev.map((a) =>
            a.id === adAccountId
              ? { ...a, uploadStatus: refreshed.snapchatUploads.find((s) => s.adAccountId === adAccountId) }
              : a
          ));
          return;
        }
        // Fall through to re-upload if org mismatch or copy failed
      }

      // Server fetches file from Vercel Blob and uploads directly to Snapchat.
      // No client-side download needed; Snapchat marks media READY immediately.
      updateSnapchatUpload(currentAsset.id, adAccountId, { stage: "uploading_chunks" });
      setCurrentAsset({ ...getAssetById(currentAsset.id)! });

      const blobUrl = currentAsset.optimizedUrl ?? currentAsset.originalUrl;
      const snapMediaId = await uploadBlobToSnapchat(
        blobUrl,
        currentAsset.originalFileName,
        adAccountId,
        currentAsset.mediaType,
        (msg) => setProgressMsg((p) => ({ ...p, [adAccountId]: msg }))
      );

      updateSnapchatUpload(currentAsset.id, adAccountId, {
        stage: "ready",
        snapMediaId,
        completedAt: new Date().toISOString(),
      });
      const refreshed = getAssetById(currentAsset.id)!;
      setCurrentAsset({ ...refreshed });
      setAccounts((prev) => prev.map((a) =>
        a.id === adAccountId
          ? { ...a, uploadStatus: refreshed.snapchatUploads.find((s) => s.adAccountId === adAccountId) }
          : a
      ));
    } catch (err) {
      if (err instanceof PollTimeoutError) {
        // File was uploaded; Snapchat just hasn't finished processing yet.
        // Store the mediaId so the Check button can poll it later.
        updateSnapchatUpload(currentAsset.id, adAccountId, {
          stage: "processing",
          snapMediaId: err.mediaId,
        });
      } else {
        updateSnapchatUpload(currentAsset.id, adAccountId, {
          stage: "failed",
          error: String(err),
          completedAt: new Date().toISOString(),
        });
      }
      setCurrentAsset({ ...getAssetById(currentAsset.id)! });
    }
    setProgressMsg((p) => { const n = { ...p }; delete n[adAccountId]; return n; });
  }

  async function startUpload() {
    const targets = accounts.filter((a) => selected.has(a.id));
    if (targets.length === 0) return;
    setRunning(true);
    setSelected(new Set());

    const queue = [...targets];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const account = queue.shift();
        if (!account) break;
        await uploadToAccount(account);
      }
    });
    await Promise.all(workers);
    setRunning(false);
    onComplete(getAssetById(currentAsset.id) ?? currentAsset);
  }

  async function resumeUpload(account: AccountRow) {
    setRunning(true);
    await uploadToAccount(account);
    setRunning(false);
    onComplete(getAssetById(currentAsset.id) ?? currentAsset);
  }

  async function checkStatus(account: AccountRow) {
    const upload = currentAsset.snapchatUploads.find((s) => s.adAccountId === account.id);
    if (!upload?.snapMediaId && upload?.stage !== "processing") return;
    // Re-poll once
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
    return row?.uploadStatus?.stage !== "ready";
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-bold text-gray-900">Upload to Snapchat</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{currentAsset.name}</p>
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={onClose}>✕</button>
        </div>

        <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {loadingAccounts && <p className="text-sm text-gray-500">Loading ad accounts…</p>}
          {!loadingAccounts && accounts.length === 0 && (
            <Alert type="error">Could not load ad accounts.</Alert>
          )}
          {accounts.map((account) => {
            const status = currentAsset.snapchatUploads.find((s) => s.adAccountId === account.id);
            const isReady = status?.stage === "ready";
            const isProcessing = status?.stage === "processing";
            const isInterrupted = status?.stage === "interrupted" || (status?.stage === "uploading_chunks" && !running);
            const isFailed = status?.stage === "failed";
            const isRunningNow = running && selected.size > 0;

            return (
              <div
                key={account.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
              >
                {!isReady && !isRunningNow && (
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
                  {progressMsg[account.id] && (
                    <p className="text-xs text-gray-500 animate-pulse">{progressMsg[account.id]}</p>
                  )}
                  {status?.error && (
                    <p className="text-xs text-red-500 mt-0.5">{status.error}</p>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {stageBadge(status?.stage)}
                  {isProcessing && !running && (
                    <Button size="sm" variant="ghost" onClick={() => checkStatus(account)}>
                      Check
                    </Button>
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
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
          <Button variant="ghost" onClick={onClose} disabled={running}>Close</Button>
          {uploadableSelected.length > 0 && !running && (
            <Button onClick={startUpload}>
              Upload to {uploadableSelected.length} account{uploadableSelected.length !== 1 ? "s" : ""}
            </Button>
          )}
          {running && <Button disabled loading>Uploading…</Button>}
        </div>
      </div>
    </div>
  );
}
