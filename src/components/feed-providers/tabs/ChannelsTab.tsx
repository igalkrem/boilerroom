"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedProvider } from "@/types/feed-provider";
import type { ChannelRow } from "@/lib/db";

interface ChannelGroup {
  available: ChannelRow[];
  inUse: ChannelRow[];
  cooldown: ChannelRow[];
}

interface ChannelsTabProps {
  feedProviderId: string | null; // null when creating new provider (not yet saved)
  channelConfig: FeedProvider["channelConfig"];
  onChange: (config: FeedProvider["channelConfig"]) => void;
}

export function ChannelsTab({ feedProviderId, channelConfig, onChange }: ChannelsTabProps) {
  const [channels, setChannels] = useState<ChannelGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [manualText, setManualText] = useState("");
  const [manualUploading, setManualUploading] = useState(false);
  const [manualMsg, setManualMsg] = useState("");
  const [expandedGroup, setExpandedGroup] = useState<"available" | "inUse" | "cooldown" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadChannels = useCallback(async () => {
    if (!feedProviderId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/feed-providers/channels?feedProviderId=${feedProviderId}`);
      if (r.ok) setChannels(await r.json());
    } finally {
      setLoading(false);
    }
  }, [feedProviderId]);

  useEffect(() => {
    if (channelConfig.type === "provider-supplied") loadChannels();
  }, [channelConfig.type, loadChannels]);

  function parseLines(text: string) {
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(",");
        return { channelId: parts[0]?.trim() ?? "", trafficSource: parts[1]?.trim() ?? "Snap" };
      })
      .filter((r) => r.channelId);
  }

  function deduplicateRows(rows: { channelId: string; trafficSource: string }[]) {
    if (!channels) return { newRows: rows, skipped: [] as string[] };
    const existing = new Set([
      ...channels.available.map((c) => c.channel_id),
      ...channels.inUse.map((c) => c.channel_id),
      ...channels.cooldown.map((c) => c.channel_id),
    ]);
    const newRows = rows.filter((r) => !existing.has(r.channelId));
    const skipped = rows.filter((r) => existing.has(r.channelId)).map((r) => r.channelId);
    return { newRows, skipped };
  }

  async function handleCsvUpload(file: File) {
    if (!feedProviderId) {
      setUploadMsg("Save the feed provider first before uploading channels.");
      return;
    }
    setUploading(true);
    setUploadMsg("");
    try {
      const text = await file.text();
      const parsed = parseLines(text);
      const { newRows, skipped } = deduplicateRows(parsed);

      if (!newRows.length) {
        setUploadMsg(
          skipped.length
            ? `All ${skipped.length} channel${skipped.length > 1 ? "s" : ""} already exist.`
            : "No valid channel IDs found."
        );
        return;
      }

      const res = await fetch("/api/feed-providers/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedProviderId, rows: newRows }),
      });
      const data = await res.json();
      if (res.ok) {
        loadChannels();
        setUploadMsg(
          skipped.length
            ? `Uploaded ${data.count} channel${data.count > 1 ? "s" : ""}. Skipped ${skipped.length} already existing.`
            : `Uploaded ${data.count} channel${data.count > 1 ? "s" : ""}.`
        );
      } else {
        setUploadMsg("Upload failed.");
      }
    } catch {
      setUploadMsg("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleManualAdd() {
    if (!feedProviderId) {
      setManualMsg("Save the feed provider first.");
      return;
    }
    const parsed = parseLines(manualText);
    const { newRows, skipped } = deduplicateRows(parsed);

    if (!newRows.length) {
      setManualMsg(
        skipped.length
          ? `All ${skipped.length} channel${skipped.length > 1 ? "s" : ""} already exist.`
          : "No valid channel IDs found."
      );
      return;
    }

    setManualUploading(true);
    setManualMsg("");
    try {
      const res = await fetch("/api/feed-providers/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedProviderId, rows: newRows }),
      });
      const data = await res.json();
      if (res.ok) {
        setManualText("");
        loadChannels();
        setManualMsg(
          skipped.length
            ? `Added ${data.count} channel${data.count > 1 ? "s" : ""}. Skipped ${skipped.length} already existing.`
            : `Added ${data.count} channel${data.count > 1 ? "s" : ""}.`
        );
      } else {
        setManualMsg("Failed to add channels.");
      }
    } catch {
      setManualMsg("Failed to add channels.");
    } finally {
      setManualUploading(false);
    }
  }

  async function releaseAllCooldown() {
    if (!channels?.cooldown.length) return;
    await Promise.all(
      channels.cooldown.map((ch) =>
        fetch("/api/feed-providers/channels/release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignSnapId: ch.campaign_snap_id ?? ch.id }),
        })
      )
    );
    loadChannels();
  }

  async function deleteSelected(ids: string[]) {
    await fetch("/api/feed-providers/channels", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    loadChannels();
  }

  async function moveChannel(id: string, newStatus: "available" | "cooldown") {
    await fetch("/api/feed-providers/channels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, newStatus }),
    });
    loadChannels();
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Channel Setup Type</p>
        <div className="flex gap-4">
          {(["provider-supplied", "parameter-based"] as const).map((type) => (
            <label key={type} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={channelConfig.type === type}
                onChange={() => onChange({ ...channelConfig, type })}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {type === "provider-supplied" ? "Provider supplies channel list" : "Parameter-based (URL Parameters tab)"}
              </span>
            </label>
          ))}
        </div>
      </div>

      {channelConfig.type === "parameter-based" && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-sm text-gray-600 dark:text-gray-300">
          Configure the channel parameter in the <strong>URL Parameters</strong> tab using the{" "}
          <code className="bg-gray-100 px-1 rounded">{"{{adSet.id}}"}</code> macro or similar.
        </div>
      )}

      {channelConfig.type === "provider-supplied" && (
        <>
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Upload Channel List (CSV)</p>
            <p className="text-xs text-gray-500 mb-2">Column A: Channel ID — Column B: Traffic source (default: Snap)</p>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCsvUpload(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Choose CSV…"}
              </button>
              {uploadMsg && <span className="text-xs text-gray-500 self-center">{uploadMsg}</span>}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Or enter channel IDs manually</p>
            <p className="text-xs text-gray-500 mb-2">One channel ID per line. Optionally: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">channelId, TrafficSource</code></p>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              rows={4}
              placeholder={"ch12345\nch67890, Snap\nch11111"}
              className="w-full font-mono text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                disabled={manualUploading || !manualText.trim()}
                onClick={handleManualAdd}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg"
              >
                {manualUploading ? "Adding…" : "Add Channels"}
              </button>
              {manualMsg && <span className="text-xs text-gray-500">{manualMsg}</span>}
            </div>
          </div>

          {loading && <p className="text-xs text-gray-400">Loading channels…</p>}

          {channels && (
            <div className="space-y-3">
              {(["available", "inUse", "cooldown"] as const).map((group) => {
                const items = channels[group];
                const label = group === "inUse" ? "In Use" : group.charAt(0).toUpperCase() + group.slice(1);
                const color = group === "available" ? "green" : group === "inUse" ? "blue" : "yellow";
                return (
                  <div key={group} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedGroup(expandedGroup === group ? null : group)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    >
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full bg-${color}-400`} />
                        {label}
                      </span>
                      <span className="text-xs text-gray-500">{items.length} channels {expandedGroup === group ? "▲" : "▼"}</span>
                    </button>
                    {expandedGroup === group && items.length > 0 && (
                      <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-48 overflow-y-auto">
                        {items.map((ch) => (
                          <div key={ch.id} className="flex items-center gap-2 px-4 py-2 text-xs">
                            <span className="font-mono text-gray-800 dark:text-gray-200 flex-1 truncate">{ch.channel_id}</span>
                            <span className="text-gray-400 shrink-0">{ch.traffic_source}</span>
                            {group === "inUse" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => moveChannel(ch.id, "available")}
                                  title="Move to Available"
                                  className="px-1.5 py-0.5 text-[10px] rounded bg-green-900/40 text-green-400 hover:bg-green-700/60 shrink-0"
                                >
                                  → Avail
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveChannel(ch.id, "cooldown")}
                                  title="Move to Cooldown"
                                  className="px-1.5 py-0.5 text-[10px] rounded bg-yellow-900/40 text-yellow-400 hover:bg-yellow-700/60 shrink-0"
                                >
                                  → Cool
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteSelected([ch.id])}
                              className="text-gray-300 hover:text-red-500 shrink-0"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {channels.cooldown.length > 0 && (
                <button
                  type="button"
                  onClick={releaseAllCooldown}
                  className="text-xs text-yellow-700 hover:text-yellow-800 underline"
                >
                  Release all cooldown channels
                </button>
              )}
            </div>
          )}

          {!feedProviderId && (
            <p className="text-xs text-gray-400">Save the feed provider first to manage channels.</p>
          )}
        </>
      )}
    </div>
  );
}
