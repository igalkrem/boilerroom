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

  async function handleCsvUpload(file: File) {
    if (!feedProviderId) {
      setUploadMsg("Save the feed provider first before uploading channels.");
      return;
    }
    setUploading(true);
    setUploadMsg("");
    try {
      const text = await file.text();
      const rows = text
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(",");
          return { channelId: parts[0]?.trim() ?? "", trafficSource: parts[1]?.trim() ?? "Snap" };
        })
        .filter((r) => r.channelId);

      const res = await fetch("/api/feed-providers/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedProviderId, rows }),
      });
      const data = await res.json();
      setUploadMsg(res.ok ? `Uploaded ${data.count} channels.` : "Upload failed.");
      if (res.ok) loadChannels();
    } catch {
      setUploadMsg("Upload failed.");
    } finally {
      setUploading(false);
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

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Channel Setup Type</p>
        <div className="flex gap-4">
          {(["provider-supplied", "parameter-based"] as const).map((type) => (
            <label key={type} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={channelConfig.type === type}
                onChange={() => onChange({ ...channelConfig, type })}
              />
              <span className="text-sm text-gray-700">
                {type === "provider-supplied" ? "Provider supplies channel list" : "Parameter-based (URL Parameters tab)"}
              </span>
            </label>
          ))}
        </div>
      </div>

      {channelConfig.type === "parameter-based" && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
          Configure the channel parameter in the <strong>URL Parameters</strong> tab using the{" "}
          <code className="bg-gray-100 px-1 rounded">{"{{adSet.id}}"}</code> macro or similar.
        </div>
      )}

      {channelConfig.type === "provider-supplied" && (
        <>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={channelConfig.addChannelIdToCampaignName ?? false}
              onChange={(e) => onChange({ ...channelConfig, addChannelIdToCampaignName: e.target.checked })}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Add channel ID to campaign name (appended with <code>-</code>)</span>
          </label>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Upload Channel List (CSV)</p>
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
                className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Choose CSV…"}
              </button>
              {uploadMsg && <span className="text-xs text-gray-500 self-center">{uploadMsg}</span>}
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
                  <div key={group} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedGroup(expandedGroup === group ? null : group)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-left"
                    >
                      <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full bg-${color}-400`} />
                        {label}
                      </span>
                      <span className="text-xs text-gray-500">{items.length} channels {expandedGroup === group ? "▲" : "▼"}</span>
                    </button>
                    {expandedGroup === group && items.length > 0 && (
                      <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                        {items.map((ch) => (
                          <div key={ch.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                            <span className="font-mono text-gray-800">{ch.channel_id}</span>
                            <span className="text-gray-400">{ch.traffic_source}</span>
                            {ch.campaign_snap_id && (
                              <span className="text-gray-300 font-mono ml-auto">{ch.campaign_snap_id.slice(0, 12)}…</span>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteSelected([ch.id])}
                              className="text-gray-300 hover:text-red-500 ml-auto shrink-0"
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
