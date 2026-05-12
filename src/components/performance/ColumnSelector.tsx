"use client";

import { useState, useRef, useEffect } from "react";

const ALL_COLUMNS = [
  { key: "spend_usd",            label: "Spend ($)" },
  { key: "revenue_usd",          label: "Revenue ($)" },
  { key: "profit",               label: "Profit" },
  { key: "roi_pct",              label: "ROI" },
  { key: "roi_1d",               label: "-1D ROI" },
  { key: "roi_2d",               label: "-2D ROI" },
  { key: "roi_3d",               label: "-3D ROI" },
  { key: "rpc",                  label: "RPC" },
  { key: "rpr",                  label: "Revenue per Result" },
  { key: "snap_results",         label: "Results" },
  { key: "snap_cost_per_result", label: "Cost per Result" },
  { key: "snap_purchase_value_usd", label: "Purchase Value" },
  { key: "cpm",                  label: "CPM" },
  { key: "ctr",                  label: "CTR" },
  { key: "cpc",                  label: "CPC" },
  { key: "cvr",                  label: "CVR" },
  { key: "fill_rate",            label: "Fill Rate" },
  { key: "swipes",               label: "Clicks" },
  { key: "clicks",               label: "Ad Clicks" },
  { key: "impressions",          label: "Impressions" },
  { key: "funnel_clicks",        label: "Funnel Clicks" },
  { key: "funnel_impressions",   label: "Funnel Impressions" },
  { key: "feed_impressions",     label: "Feed Impressions" },
  { key: "funnel_requests",      label: "Funnel Requests" },
  { key: "requests",             label: "Requests" },
  { key: "matched_ad_requests",  label: "Matched Requests" },
  { key: "page_views",           label: "Page Views" },
  { key: "domain_name",          label: "Domain" },
  { key: "video_views",          label: "Video Views" },
] as const;

const ALL_KEYS = ALL_COLUMNS.map((c) => c.key as string);
const LABEL_MAP = Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, c.label]));

const LS_KEY = "br_perf_cols";
const LS_ORDER_KEY = "br_perf_cols_order";

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

export function loadSavedOrder(): string[] {
  if (typeof window === "undefined") return ALL_KEYS;
  try {
    const raw = localStorage.getItem(LS_ORDER_KEY);
    if (!raw) return ALL_KEYS;
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return ALL_KEYS;
    const known = new Set(ALL_KEYS);
    const saved = (arr as string[]).filter((k) => known.has(k));
    const missing = ALL_KEYS.filter((k) => !saved.includes(k));
    return [...saved, ...missing];
  } catch {
    return ALL_KEYS;
  }
}

interface Props {
  visible: Set<string>;
  order: string[];
  onChange: (cols: Set<string>) => void;
  onOrderChange: (order: string[]) => void;
  columns?: { key: string; label: string }[];
  storageKey?: string;
  orderStorageKey?: string;
}

export function ColumnSelector({ visible, order, onChange, onOrderChange, columns, storageKey, orderStorageKey }: Props) {
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const dragIdx = useRef<number | null>(null);

  const effectiveLabelMap = columns
    ? Object.fromEntries(columns.map((c) => [c.key, c.label]))
    : LABEL_MAP;
  const effectiveStoreKey = storageKey ?? LS_KEY;
  const effectiveOrderKey = orderStorageKey ?? LS_ORDER_KEY;

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
    localStorage.setItem(effectiveStoreKey, JSON.stringify([...next]));
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDragOver(idx);
  }

  function handleDrop(idx: number) {
    setDragOver(null);
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const next = [...order];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(idx, 0, moved);
    onOrderChange(next);
    localStorage.setItem(effectiveOrderKey, JSON.stringify(next));
    dragIdx.current = null;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 w-56 max-h-[380px] overflow-y-auto">
          <p className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100 dark:border-gray-700 mb-0.5">
            Drag to reorder · check to show
          </p>
          {order.map((key, i) => {
            const label = effectiveLabelMap[key];
            if (!label) return null;
            return (
              <div
                key={key}
                draggable
                onDragStart={() => { dragIdx.current = i; }}
                onDragOver={(e) => handleDragOver(e, i)}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop(i)}
                onDragEnd={() => { setDragOver(null); dragIdx.current = null; }}
                className={`flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                  dragOver === i ? "border-t-2 border-blue-400 bg-blue-50 dark:bg-blue-900/30" : ""
                }`}
              >
                <span
                  className="flex-shrink-0 cursor-grab text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 select-none"
                  draggable={false}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <circle cx="7" cy="4"  r="1.5" />
                    <circle cx="13" cy="4"  r="1.5" />
                    <circle cx="7" cy="10" r="1.5" />
                    <circle cx="13" cy="10" r="1.5" />
                    <circle cx="7" cy="16" r="1.5" />
                    <circle cx="13" cy="16" r="1.5" />
                  </svg>
                </span>
                <input
                  type="checkbox"
                  checked={visible.has(key)}
                  onChange={() => toggle(key)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-cyan-500 focus:ring-cyan-500 flex-shrink-0"
                />
                <span className="select-none">{label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
