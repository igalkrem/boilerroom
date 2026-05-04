"use client";

import { useState, useRef, useEffect } from "react";

const ALL_COLUMNS = [
  { key: "impressions",          label: "Impressions" },
  { key: "swipes",               label: "Clicks" },
  { key: "spend_usd",            label: "Spend ($)" },
  { key: "revenue_usd",          label: "Revenue ($)" },
  { key: "roi_pct",              label: "ROI" },
  { key: "roi_1d",               label: "-1D ROI" },
  { key: "roi_2d",               label: "-2D ROI" },
  { key: "roi_3d",               label: "-3D ROI" },
  { key: "funnel_clicks",        label: "Funnel Clicks" },
  { key: "rpc",                  label: "RPC" },
  { key: "profit",               label: "Profit" },
  { key: "ctr",                  label: "CTR" },
  { key: "cpm",                  label: "CPM" },
  { key: "cpc",                  label: "CPC" },
  { key: "cvr",                  label: "CVR" },
  { key: "cpr",                  label: "CPR" },
  { key: "rpr",                  label: "RPR" },
  { key: "page_views",           label: "Page Views" },
  { key: "clicks",               label: "VZ Clicks" },
  { key: "ad_requests",          label: "Ad Requests" },
  { key: "matched_ad_requests",  label: "Matched Requests" },
  { key: "funnel_impressions",   label: "Funnel Impressions" },
  { key: "funnel_requests",      label: "Funnel Requests" },
  { key: "domain_name",          label: "Domain" },
  { key: "video_views",          label: "Video Views" },
] as const;

const LS_KEY = "br_perf_cols";

export const DEFAULT_VISIBLE_COLUMNS = new Set<string>([
  "spend_usd", "revenue_usd", "roi_pct", "roi_1d", "roi_2d", "roi_3d",
  "swipes", "funnel_clicks", "rpc", "profit", "ctr",
]);

export function loadSavedColumns(): Set<string> {
  if (typeof window === "undefined") return new Set(DEFAULT_VISIBLE_COLUMNS);
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Set(DEFAULT_VISIBLE_COLUMNS);
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set(DEFAULT_VISIBLE_COLUMNS);
    return new Set(arr as string[]);
  } catch {
    return new Set(DEFAULT_VISIBLE_COLUMNS);
  }
}

interface Props {
  visible: Set<string>;
  onChange: (cols: Set<string>) => void;
}

export function ColumnSelector({ visible, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function toggle(key: string) {
    const next = new Set(visible);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
    localStorage.setItem(LS_KEY, JSON.stringify([...next]));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:border-gray-400 hover:bg-gray-50 transition-colors"
      >
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        Columns
        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-44 max-h-80 overflow-y-auto">
          {ALL_COLUMNS.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={visible.has(key)}
                onChange={() => toggle(key)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-cyan-500 focus:ring-cyan-500"
              />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
