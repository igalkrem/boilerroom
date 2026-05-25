"use client";

import { useEffect, useState, useCallback } from "react";

interface FeedStatus {
  feedLastSynced: string | null;
  snapLastSynced: string | null;
  inSync: boolean;
}

interface SyncStatusData {
  kingsroad: FeedStatus;
  predicto: FeedStatus;
}

function minutesAgo(ts: string | null): number | null {
  if (!ts) return null;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 60_000);
}

// Feeds sync every ~60 min (cron :17). Older than 75 min = a cron cycle was missed.
const FEED_OVERDUE_MINUTES = 75;

function StatusPill({
  label,
  ts,
  dotColor,
}: {
  label: string;
  ts: string | null;
  dotColor: "green" | "amber" | "red" | "gray";
}) {
  const mins = minutesAgo(ts);
  const dotClass =
    dotColor === "green"
      ? "bg-green-500"
      : dotColor === "amber"
      ? "bg-amber-400"
      : dotColor === "red"
      ? "bg-red-500"
      : "bg-gray-600";
  const timeClass =
    dotColor === "red" ? "text-red-400" : ts ? "text-gray-400" : "text-gray-600";

  return (
    <span className="flex items-center gap-1 text-gray-500">
      <span className="text-gray-600">{label}</span>
      <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
      <span className={timeClass}>
        {mins === null ? "—" : mins === 0 ? "just now" : `${mins}m`}
      </span>
    </span>
  );
}

function FeedRow({ name, status }: { name: string; status: FeedStatus }) {
  const feedMins = minutesAgo(status.feedLastSynced);
  const feedOverdue = feedMins !== null && feedMins > FEED_OVERDUE_MINUTES;
  const feedDot = feedOverdue ? "red" : status.feedLastSynced ? "green" : "gray";
  const snapDot = status.snapLastSynced
    ? status.inSync
      ? "green"
      : "amber"
    : "gray";

  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-500 w-16 text-right">{name}</span>
      <StatusPill label="feed" ts={status.feedLastSynced} dotColor={feedDot} />
      <span className="text-gray-700 text-xs">·</span>
      <StatusPill label="snap" ts={status.snapLastSynced} dotColor={snapDot} />
    </div>
  );
}

interface SyncStatusBarProps {
  onForceRefresh: () => void;
  syncing: boolean;
  loading: boolean;
  refreshTrigger?: number;
}

export function SyncStatusBar({
  onForceRefresh,
  syncing,
  loading,
  refreshTrigger,
}: SyncStatusBarProps) {
  const [status, setStatus] = useState<SyncStatusData | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/reporting/sync-status");
      if (res.ok) setStatus(await res.json());
    } catch {}
  }, []);

  // Initial load + 60s refresh ticker
  useEffect(() => {
    void loadStatus();
    const id = setInterval(() => void loadStatus(), 60_000);
    return () => clearInterval(id);
  }, [loadStatus]);

  // Re-fetch after a sync completes
  useEffect(() => {
    if (refreshTrigger !== undefined) void loadStatus();
  }, [refreshTrigger, loadStatus]);

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-4 text-xs">
        {status ? (
          <>
            <FeedRow name="KingsRoad" status={status.kingsroad} />
            <span className="text-gray-700">|</span>
            <FeedRow name="Predicto" status={status.predicto} />
          </>
        ) : (
          <span className="text-gray-600 text-xs">Loading sync status…</span>
        )}
      </div>

      {/* Force Refresh — escape hatch only */}
      <button
        onClick={onForceRefresh}
        disabled={syncing || loading}
        title="Force Refresh — re-fetches all sources regardless of cache"
        aria-label="Force Refresh"
        className={`transition-colors p-1 rounded ${
          syncing
            ? "text-blue-400 cursor-not-allowed"
            : "text-gray-600 hover:text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={syncing ? "animate-spin" : ""}
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </svg>
      </button>
    </div>
  );
}
