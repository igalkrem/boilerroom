"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import type { CombinedRow } from "@/app/api/reporting/combined/route";
import type { FeedProvider } from "@/types/feed-provider";
import { resolveProviderKey } from "@/lib/reporting/provider-key";
import { addChangeEntry, getEntriesForSquad } from "@/lib/campaign-changelog";
import { DrilldownModal } from "./DrilldownModal";
import { ColumnSelector } from "./ColumnSelector";

const PROVIDER_COLORS = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ec4899", "#f59e0b"] as const;

function SnapchatLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.166.002c.83-.005 3.39.229 4.643 2.848.422.88.338 2.352.269 3.562l-.012.2c-.006.09.049.125.106.101.225-.093.456-.24.7-.397.328-.21.664-.426 1.021-.506a1.53 1.53 0 01.379-.024c.498.032.938.346 1.106.785.217.567-.045 1.128-.779 1.663-.118.086-.247.164-.375.241-.403.241-.732.437-.665.671.044.152.19.332.364.553.536.677 1.344 1.7 1.344 3.414 0 2.618-1.83 4.62-4.99 5.544-.193.056-.236.151-.267.27-.046.175-.085.325-.296.484-.271.2-.68.3-1.252.302-.494.002-1.102-.08-1.76-.167-.77-.102-1.566-.209-2.27-.153-.703.055-1.377.22-2.018.379-.548.138-1.072.27-1.572.27h-.049c-.545-.008-.938-.106-1.198-.3-.208-.158-.248-.307-.291-.48-.03-.117-.072-.212-.265-.268C3.83 18.625 2 16.623 2 14.005c0-1.715.808-2.737 1.344-3.414.174-.22.32-.401.364-.553.068-.233-.262-.43-.665-.671a5.39 5.39 0 01-.375-.241C1.934 8.59 1.672 8.03 1.89 7.46c.167-.439.608-.753 1.106-.785a1.51 1.51 0 01.379.024c.357.08.693.296 1.021.506.244.157.475.304.7.397.056.023.112-.011.106-.1l-.012-.201C5.12 6.09 5.037 4.617 5.46 3.736 6.574 1.388 8.91.807 10.316.36 10.83.193 11.444.006 12.166.002z" />
    </svg>
  );
}

function PlatformIcon({ platform, className }: { platform: "snap" | "meta"; className?: string }) {
  if (platform === "meta") {
    return (
      <span className={`inline-flex items-center justify-center rounded bg-blue-600 text-white font-bold leading-none ${className ?? "w-3.5 h-3.5 text-[8px]"}`}>
        f
      </span>
    );
  }
  return <SnapchatLogo className={className ?? "w-3.5 h-3.5 text-yellow-400"} />;
}

export interface SquadDetail {
  daily_budget_micro: number;
  bid_micro: number;
  ad_account_id: string;
  status: "ACTIVE" | "PAUSED";
}

interface Props {
  rows: CombinedRow[];
  eurToUsd: number;
  visibleColumns: Set<string>;
  onColumnsChange: (cols: Set<string>) => void;
  columnOrder: string[];
  onColumnOrderChange: (order: string[]) => void;
  squadDetails: Map<string, SquadDetail>;
  historicalRows: CombinedRow[];
  startDate: string;
  onSquadUpdated: () => void;
  onSquadPatched?: (squadId: string, patch: Partial<SquadDetail>) => void;
  onFilteredRowsChange?: (rows: AggrRow[]) => void;
}

type SortKey =
  | "spend_usd" | "revenue_usd" | "roi_pct" | "impressions" | "swipes"
  | "clicks" | "page_views" | "video_views" | "funnel_clicks" | "funnel_impressions"
  | "funnel_requests" | "requests" | "feed_impressions" | "ad_requests" | "matched_ad_requests"
  | "rpc" | "cpm" | "cpc" | "ctr" | "rpr" | "fill_rate" | "profit" | "cvr"
  | "roi_1d" | "roi_2d" | "roi_3d"
  | "snap_results" | "snap_purchase_value_usd" | "snap_cost_per_result";

function microToDollar(micro: number) { return micro / 1_000_000; }
function dollarToMicro(dollars: number) { return Math.round(dollars * 1_000_000); }
function fmt$(n: number) { return `$${n.toFixed(2)}`; }
function fmtPct(n: number | null) { return n === null ? "—" : n.toFixed(2) + "%"; }
function fmtPct0(n: number | null) { return n === null ? "—" : Math.round(n).toFixed(0) + "%"; }
function RoiCell({ pct, meta }: { pct: number | null; meta?: { spend: number; revenue: number } }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  if (pct === null) return <span className="inline-flex w-full justify-center text-gray-400">—</span>;
  const bg = pct >= 120 ? "bg-green-500" : pct > 105 ? "bg-orange-400" : "bg-red-500";
  const profit = meta ? meta.revenue - meta.spend : null;
  return (
    <>
      <div
        className={`flex flex-col w-full rounded cursor-default ${bg}`}
        onMouseEnter={meta ? (e) => { const r = e.currentTarget.getBoundingClientRect(); setPos({ x: r.left + r.width / 2, y: r.top }); } : undefined}
        onMouseLeave={meta ? () => setPos(null) : undefined}
      >
        <div className={`px-1 text-center font-bold text-gray-900 text-sm tabular-nums ${profit !== null ? "pt-0.5 pb-0" : "py-0.5"}`}>
          {Math.round(pct)}%
        </div>
        {profit !== null && (
          <div className="px-1 pt-px pb-0.5 text-center text-xs font-bold tabular-nums text-white leading-none bg-black/20 rounded-b">
            {profit >= 0 ? "+" : "-"}${Math.round(Math.abs(profit))}
          </div>
        )}
      </div>
      {pos && meta && createPortal(
        <div
          style={{ position: "fixed", left: pos.x, top: pos.y - 8, transform: "translate(-50%, -100%)", zIndex: 9999 }}
          className="bg-gray-900 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-300 shadow-xl pointer-events-none whitespace-nowrap"
        >
          <div>Spend: <span className="text-white font-medium">{fmt$(meta.spend)}</span></div>
          <div>Revenue: <span className="text-white font-medium">{fmt$(meta.revenue)}</span></div>
          <div>Profit: <span className={`font-medium ${profit! >= 0 ? "text-green-400" : "text-red-400"}`}>{profit! >= 0 ? "+" : ""}{fmt$(profit!)}</span></div>
        </div>,
        document.body
      )}
    </>
  );
}
function fmtNum(n: number) { return n.toLocaleString(); }

function dateMinus(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export interface AggrRow {
  ad_squad_id: string;
  ad_squad_name: string;
  spend_usd: number;
  revenue_usd: number;
  revenue_eur: number;
  impressions: number;
  swipes: number;
  clicks: number;
  page_views: number;
  video_views: number;
  ad_requests: number;
  matched_ad_requests: number;
  requests: number;
  feed_impressions: number;
  funnel_clicks: number;
  funnel_impressions: number;
  funnel_requests: number;
  domain_name: string;
  feed_provider_id: string;
  ad_account_id: string;
  roi_pct: number | null;
  roi_1d: number | null;
  roi_2d: number | null;
  roi_3d: number | null;
  spend_1d: number | null;
  revenue_1d: number | null;
  spend_2d: number | null;
  revenue_2d: number | null;
  spend_3d: number | null;
  revenue_3d: number | null;
  rpc: number | null;
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  rpr: number | null;
  fill_rate: number | null;
  profit: number;
  cvr: number | null;
  snap_results: number;
  snap_purchase_value_usd: number;
  snap_cost_per_result: number | null;
  platform: "snap" | "meta";
}

interface MetricColDef {
  label: string;
  sortKey?: SortKey;
  render: (r: AggrRow) => ReactNode;
  tdClass?: string;
  thClass?: string;
  padX?: string;
}

const METRIC_COLS: Record<string, MetricColDef> = {
  spend_usd:           { label: "Spend ($)",          sortKey: "spend_usd",           render: (r) => fmt$(r.spend_usd),   tdClass: "text-gray-900 dark:text-gray-100 font-medium" },
  revenue_usd:         { label: "Revenue ($)",         sortKey: "revenue_usd",         render: (r) => fmt$(r.revenue_usd), tdClass: "text-gray-900 dark:text-gray-100" },
  roi_pct:             { label: "ROI",   sortKey: "roi_pct",  render: (r) => <RoiCell pct={r.roi_pct} meta={{ spend: r.spend_usd, revenue: r.revenue_usd }} />, thClass: "pl-3 pr-[1px] border-l border-gray-200 dark:border-gray-600", padX: "pl-3 pr-[1px] border-l border-gray-100 dark:border-gray-700/50" },
  roi_1d:              { label: "-1D",   sortKey: "roi_1d",   render: (r) => <RoiCell pct={r.roi_1d}  meta={r.spend_1d  !== null ? { spend: r.spend_1d,  revenue: r.revenue_1d! } : undefined} />, thClass: "px-[1px]", padX: "px-[1px]" },
  roi_2d:              { label: "-2D",   sortKey: "roi_2d",   render: (r) => <RoiCell pct={r.roi_2d}  meta={r.spend_2d  !== null ? { spend: r.spend_2d,  revenue: r.revenue_2d! } : undefined} />, thClass: "px-[1px]", padX: "px-[1px]" },
  roi_3d:              { label: "-3D",   sortKey: "roi_3d",   render: (r) => <RoiCell pct={r.roi_3d}  meta={r.spend_3d  !== null ? { spend: r.spend_3d,  revenue: r.revenue_3d! } : undefined} />, thClass: "pl-[1px] pr-3", padX: "pl-[1px] pr-3" },
  profit:              { label: "Profit",              sortKey: "profit",              render: (r) => <span className={r.profit >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>{fmt$(r.profit)}</span> },
  rpc:                 { label: "RPC",                 sortKey: "rpc",                 render: (r) => r.rpc !== null ? fmt$(r.rpc) : "—",          tdClass: "text-gray-700 dark:text-gray-300" },
  ctr:                 { label: "CTR",                 sortKey: "ctr",                 render: (r) => fmtPct(r.ctr),                               tdClass: "text-gray-700 dark:text-gray-300" },
  cpm:                 { label: "CPM",                 sortKey: "cpm",                 render: (r) => r.cpm !== null ? fmt$(r.cpm) : "—",          tdClass: "text-gray-700 dark:text-gray-300" },
  cpc:                 { label: "CPC",                 sortKey: "cpc",                 render: (r) => r.cpc !== null ? fmt$(r.cpc) : "—",          tdClass: "text-gray-700 dark:text-gray-300" },
  cvr:                 { label: "CVR",                 sortKey: "cvr",                 render: (r) => fmtPct0(r.cvr),                              tdClass: "text-gray-700 dark:text-gray-300" },
  rpr:                 { label: "Revenue per Result",  sortKey: "rpr",                 render: (r) => r.rpr !== null ? fmt$(r.rpr) : "—",          tdClass: "text-gray-700 dark:text-gray-300" },
  fill_rate:           { label: "Fill Rate",           sortKey: "fill_rate",           render: (r) => fmtPct(r.fill_rate),                         tdClass: "text-gray-700 dark:text-gray-300" },
  impressions:         { label: "Impressions",         sortKey: "impressions",         render: (r) => fmtNum(r.impressions),                       tdClass: "text-gray-700 dark:text-gray-300" },
  swipes:              { label: "Clicks",              sortKey: "swipes",              render: (r) => fmtNum(r.swipes),                            tdClass: "text-gray-700 dark:text-gray-300" },
  funnel_clicks:       { label: "Funnel Clicks",       sortKey: "funnel_clicks",       render: (r) => fmtNum(r.funnel_clicks),                     tdClass: "text-gray-700 dark:text-gray-300" },
  funnel_impressions:  { label: "Funnel Impressions",  sortKey: "funnel_impressions",  render: (r) => fmtNum(r.funnel_impressions),                tdClass: "text-gray-700 dark:text-gray-300" },
  funnel_requests:     { label: "Funnel Requests",     sortKey: "funnel_requests",     render: (r) => fmtNum(r.funnel_requests),                   tdClass: "text-gray-700 dark:text-gray-300" },
  requests:            { label: "Requests",            sortKey: "requests",            render: (r) => fmtNum(r.requests),                          tdClass: "text-gray-700 dark:text-gray-300" },
  feed_impressions:    { label: "Feed Impressions",    sortKey: "feed_impressions",    render: (r) => fmtNum(r.feed_impressions),                   tdClass: "text-gray-700 dark:text-gray-300" },
  matched_ad_requests: { label: "Matched Requests",    sortKey: "matched_ad_requests", render: (r) => fmtNum(r.matched_ad_requests),               tdClass: "text-gray-700 dark:text-gray-300" },
  clicks:              { label: "Ad Clicks",           sortKey: "clicks",              render: (r) => fmtNum(r.clicks),                            tdClass: "text-gray-700 dark:text-gray-300" },
  page_views:          { label: "Page Views",          sortKey: "page_views",          render: (r) => fmtNum(r.page_views),                        tdClass: "text-gray-700 dark:text-gray-300" },
  video_views:         { label: "Video Views",         sortKey: "video_views",         render: (r) => fmtNum(r.video_views),                       tdClass: "text-gray-700 dark:text-gray-300" },
  domain_name:              { label: "Domain",            render: (r) => <span className="text-xs text-gray-500">{r.domain_name || "—"}</span> },
  snap_results:             { label: "Results",           sortKey: "snap_results",             render: (r) => fmtNum(r.snap_results),                                                                tdClass: "text-gray-700 dark:text-gray-300" },
  snap_cost_per_result:     { label: "Cost per Result",   sortKey: "snap_cost_per_result",     render: (r) => r.snap_cost_per_result !== null ? fmt$(r.snap_cost_per_result) : "—",                  tdClass: "text-gray-700 dark:text-gray-300" },
  snap_purchase_value_usd:  { label: "Purchase Value",    sortKey: "snap_purchase_value_usd",  render: (r) => fmt$(r.snap_purchase_value_usd),                                                       tdClass: "text-gray-700 dark:text-gray-300" },
  last_change: {
    label: "Last Change",
    render: (r) => {
      const entry = getEntriesForSquad(r.ad_squad_id)[0];
      if (!entry) return <span className="text-gray-400 dark:text-gray-600">—</span>;
      const fieldLabel = entry.field === "budget" ? "Budget" : entry.field === "bid" ? "Bid" : "Status";
      const ago = timeAgo(entry.timestamp);
      return (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs text-gray-200 whitespace-nowrap">
            {fieldLabel}&nbsp;
            <span className="text-gray-400">{entry.oldValue}</span>
            <span className="text-gray-500 mx-0.5">→</span>
            <span className="text-white font-medium">{entry.newValue}</span>
          </span>
          <span className="text-[10px] text-gray-500 whitespace-nowrap">{ago}</span>
        </div>
      );
    },
  },
};

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

const FILTERABLE_METRICS = [
  { key: "spend_usd",     label: "Spend ($)" },
  { key: "revenue_usd",   label: "Revenue ($)" },
  { key: "profit",        label: "Profit ($)" },
  { key: "roi_pct",       label: "ROI (%)" },
  { key: "rpc",           label: "RPC" },
  { key: "cpm",           label: "CPM" },
  { key: "cpc",           label: "CPC" },
  { key: "ctr",           label: "CTR (%)" },
  { key: "cvr",           label: "CVR (%)" },
  { key: "rpr",           label: "Rev/Result" },
  { key: "impressions",   label: "Impressions" },
  { key: "swipes",        label: "Clicks" },
  { key: "funnel_clicks", label: "Funnel Clicks" },
  { key: "clicks",        label: "Ad Clicks" },
  { key: "snap_results",  label: "Results" },
];

function SortArrow({ active, desc }: { active: boolean; desc: boolean }) {
  if (!active) return (
    <svg className="w-3 h-3 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
    </svg>
  );
  return desc ? (
    <svg className="w-3 h-3 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  ) : (
    <svg className="w-3 h-3 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  );
}

export function PerformanceTable({
  rows, eurToUsd, visibleColumns, onColumnsChange, columnOrder, onColumnOrderChange,
  squadDetails, historicalRows, startDate, onSquadUpdated, onSquadPatched, onFilteredRowsChange,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("spend_usd");
  const [sortDesc, setSortDesc] = useState(true);
  const [drilldown, setDrilldown] = useState<{ id: string; name: string; accountId: string } | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastCheckedIdx = useRef<number | null>(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [hiddenSquadIds, setHiddenSquadIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem("br_perf_hidden_squads");
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const [showHidden, setShowHidden] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterArticleIds, setFilterArticleIds] = useState<Set<string>>(new Set());
  const [filterProviderIds, setFilterProviderIds] = useState<Set<string>>(new Set());
  const [filterStatuses, setFilterStatuses] = useState<Set<"ACTIVE" | "PAUSED">>(new Set());
  const [metricFilters, setMetricFilters] = useState<Array<{ id: string; metric: string; op: string; value: string }>>([]);
  const [articles, setArticles] = useState<Array<{ id: string; slug: string }>>([]);
  const [providers, setProviders] = useState<FeedProvider[]>([]);
  const [articleDropOpen, setArticleDropOpen] = useState(false);
  const [providerDropOpen, setProviderDropOpen] = useState(false);
  const articleDropRef = useRef<HTMLDivElement>(null);
  const providerDropRef = useRef<HTMLDivElement>(null);
  const [articleSearch, setArticleSearch] = useState("");
  const [providerSearch, setProviderSearch] = useState("");

  function toggleHideSquad(squadId: string) {
    setHiddenSquadIds((prev) => {
      const next = new Set(prev);
      if (next.has(squadId)) next.delete(squadId);
      else next.add(squadId);
      localStorage.setItem("br_perf_hidden_squads", JSON.stringify([...next]));
      return next;
    });
  }

  // Load article + provider data from localStorage (for filters)
  useEffect(() => {
    try {
      const a = localStorage.getItem("boilerroom_articles_v1");
      if (a) setArticles(JSON.parse(a) as Array<{ id: string; slug: string }>);
      const p = localStorage.getItem("boilerroom_feed_providers_v1");
      if (p) setProviders(JSON.parse(p) as FeedProvider[]);
    } catch {}
  }, []);

  const providerColorMap = useMemo(() => {
    const sorted = [...providers].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const map: Record<string, string> = {};
    sorted.forEach((p, i) => { map[p.id] = PROVIDER_COLORS[i % PROVIDER_COLORS.length]; });
    return map;
  }, [providers]);

  useEffect(() => {
    if (!articleDropOpen) { setArticleSearch(""); return; }
    function h(e: MouseEvent) {
      if (articleDropRef.current && !articleDropRef.current.contains(e.target as Node)) setArticleDropOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [articleDropOpen]);

  useEffect(() => {
    if (!providerDropOpen) { setProviderSearch(""); return; }
    function h(e: MouseEvent) {
      if (providerDropRef.current && !providerDropRef.current.contains(e.target as Node)) setProviderDropOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [providerDropOpen]);

  // Name column resizing
  const [nameColWidth, setNameColWidth] = useState(() => {
    if (typeof window === "undefined") return 260;
    return parseInt(localStorage.getItem("br_perf_name_col_w") ?? "260", 10) || 260;
  });
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = nameColWidth;
    function onMove(ev: MouseEvent) {
      const next = Math.max(120, resizeStartWidth.current + ev.clientX - resizeStartX.current);
      setNameColWidth(next);
    }
    function onUp(ev: MouseEvent) {
      const next = Math.max(120, resizeStartWidth.current + ev.clientX - resizeStartX.current);
      localStorage.setItem("br_perf_name_col_w", String(next));
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [nameColWidth]);

  // Inline budget/bid editing
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [editingBid, setEditingBid] = useState<string | null>(null);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [bidDraft, setBidDraft] = useState("");
  const [savingInline, setSavingInline] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Bulk controls
  const [bulkBudget, setBulkBudget] = useState("");
  const [bulkBid, setBulkBid] = useState("");
  const [bulkStatus, setBulkStatus] = useState<"ACTIVE" | "PAUSED">("ACTIVE");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [budgetMode, setBudgetMode] = useState<"set" | "add" | "pct">("set");
  const [budgetDir, setBudgetDir] = useState<"+" | "-">("+");
  const [bidMode, setBidMode] = useState<"set" | "add" | "pct">("set");
  const [bidDir, setBidDir] = useState<"+" | "-">("+");

  const y1 = dateMinus(startDate, 1);
  const y2 = dateMinus(startDate, 2);
  const y3 = dateMinus(startDate, 3);

  const aggregated = useMemo<AggrRow[]>(() => {
    function dailyMetrics(squadId: string, date: string): { spend: number; revenue: number } | null {
      const matching = historicalRows.filter(r => r.ad_squad_id === squadId && r.stat_date === date);
      if (matching.length === 0) return null;
      const spend = matching.reduce((s, r) => s + r.spend_usd, 0);
      const revenue = matching.reduce((s, r) => s + r.revenue_usd, 0);
      return { spend, revenue };
    }

    const map = new Map<string, AggrRow>();
    for (const r of rows) {
      const ex = map.get(r.ad_squad_id);
      if (ex) {
        ex.spend_usd += r.spend_usd;
        ex.revenue_usd += r.revenue_usd;
        ex.revenue_eur += r.revenue_eur;
        ex.impressions += r.impressions;
        ex.swipes += r.swipes;
        ex.clicks += r.clicks;
        ex.page_views += r.page_views;
        ex.video_views += r.video_views;
        ex.ad_requests += r.ad_requests;
        ex.matched_ad_requests += r.matched_ad_requests;
        ex.requests += r.requests;
        ex.feed_impressions += r.feed_impressions;
        ex.funnel_clicks += r.funnel_clicks;
        ex.funnel_impressions += r.funnel_impressions;
        ex.funnel_requests += r.funnel_requests;
        ex.snap_results += r.snap_results;
        ex.snap_purchase_value_usd += r.snap_purchase_value_usd;
        if (!ex.domain_name && r.domain_name) ex.domain_name = r.domain_name;
        if (!ex.feed_provider_id && r.feed_provider_id) ex.feed_provider_id = r.feed_provider_id;
      } else {
        map.set(r.ad_squad_id, {
          ad_squad_id: r.ad_squad_id,
          ad_squad_name: r.ad_squad_name,
          spend_usd: r.spend_usd,
          revenue_usd: r.revenue_usd,
          revenue_eur: r.revenue_eur,
          impressions: r.impressions,
          swipes: r.swipes,
          clicks: r.clicks,
          page_views: r.page_views,
          video_views: r.video_views,
          ad_requests: r.ad_requests,
          matched_ad_requests: r.matched_ad_requests,
          requests: r.requests,
          feed_impressions: r.feed_impressions,
          funnel_clicks: r.funnel_clicks,
          funnel_impressions: r.funnel_impressions,
          funnel_requests: r.funnel_requests,
          domain_name: r.domain_name,
          feed_provider_id: r.feed_provider_id,
          ad_account_id: r.ad_account_id,
          snap_results: r.snap_results,
          snap_purchase_value_usd: r.snap_purchase_value_usd,
          platform: r.platform ?? "snap",
          roi_pct: null,
          roi_1d: null,
          roi_2d: null,
          roi_3d: null,
          spend_1d: null,
          revenue_1d: null,
          spend_2d: null,
          revenue_2d: null,
          spend_3d: null,
          revenue_3d: null,
          rpc: null,
          cpm: null,
          cpc: null,
          ctr: null,
          rpr: null,
          fill_rate: null,
          profit: 0,
          cvr: null,
          snap_cost_per_result: null,
        });
      }
    }

    return Array.from(map.values())
      .map((a) => ({
        ...a,
        roi_pct: a.spend_usd > 0 ? (a.revenue_usd / a.spend_usd) * 100 : null,
        ...(() => {
          const m1 = dailyMetrics(a.ad_squad_id, y1);
          const m2 = dailyMetrics(a.ad_squad_id, y2);
          const m3 = dailyMetrics(a.ad_squad_id, y3);
          return {
            roi_1d:     m1 && m1.spend > 0 ? (m1.revenue / m1.spend) * 100 : null,
            spend_1d:   m1?.spend ?? null,
            revenue_1d: m1?.revenue ?? null,
            roi_2d:     m2 && m2.spend > 0 ? (m2.revenue / m2.spend) * 100 : null,
            spend_2d:   m2?.spend ?? null,
            revenue_2d: m2?.revenue ?? null,
            roi_3d:     m3 && m3.spend > 0 ? (m3.revenue / m3.spend) * 100 : null,
            spend_3d:   m3?.spend ?? null,
            revenue_3d: m3?.revenue ?? null,
          };
        })(),
        rpc: a.funnel_clicks >= 10 && a.clicks > 0 ? a.revenue_usd / a.clicks : null,
        cpm: a.impressions > 0 ? (a.spend_usd / a.impressions) * 1000 : null,
        cpc: a.swipes > 0 ? a.spend_usd / a.swipes : null,
        ctr: a.impressions > 0 ? (a.swipes / a.impressions) * 100 : null,
        rpr: a.funnel_clicks >= 10 && a.snap_results > 0 ? a.revenue_usd / a.snap_results : null,
        fill_rate: a.swipes > 0 ? (a.funnel_impressions / a.swipes) * 100 : null,
        profit: a.revenue_usd - a.spend_usd,
        cvr: a.swipes > 0 ? (a.funnel_clicks / a.swipes) * 100 : null,
        snap_cost_per_result: a.snap_results > 0 ? a.spend_usd / a.snap_results : null,
      }))
      .sort((a, b) => {
        const av = a[sortKey] ?? -Infinity;
        const bv = b[sortKey] ?? -Infinity;
        return sortDesc ? (bv as number) - (av as number) : (av as number) - (bv as number);
      });
  }, [rows, historicalRows, sortKey, sortDesc, y1, y2, y3]);

  const filtered = useMemo(() => {
    return aggregated.filter((r) => {
      const status = squadDetails.get(r.ad_squad_id)?.status;
      if (status === "PAUSED" && r.impressions === 0) return false;
      if (!showHidden && hiddenSquadIds.has(r.ad_squad_id)) return false;
      if (filterQuery.trim() && !r.ad_squad_name.toLowerCase().includes(filterQuery.toLowerCase())) return false;

      // Article filter — OR logic; normalize spaces/underscores/hyphens before comparing
      if (filterArticleIds.size > 0) {
        const norm = (s: string) => s.toLowerCase().replace(/[-_]/g, " ");
        const slugs = articles.filter(a => filterArticleIds.has(a.id)).map(a => norm(a.slug));
        if (slugs.length === 0 || !slugs.some(s => norm(r.ad_squad_name).includes(s))) return false;
      }

      // Provider filter — three-tier resolution matches summary tables
      if (filterProviderIds.size > 0) {
        if (!filterProviderIds.has(resolveProviderKey(r, providers))) return false;
      }

      // Status filter
      if (filterStatuses.size > 0) {
        const squadStatus = squadDetails.get(r.ad_squad_id)?.status ?? "ACTIVE";
        if (!filterStatuses.has(squadStatus)) return false;
      }

      // Metric filters — AND logic; incomplete rows are skipped
      for (const mf of metricFilters) {
        if (!mf.metric || !mf.value.trim()) continue;
        const threshold = parseFloat(mf.value);
        if (isNaN(threshold)) continue;
        const rv = r[mf.metric as keyof AggrRow] as number | null | undefined;
        if (rv == null) return false;
        if (mf.op === ">"  && !(rv >  threshold)) return false;
        if (mf.op === ">=" && !(rv >= threshold)) return false;
        if (mf.op === "<"  && !(rv <  threshold)) return false;
        if (mf.op === "<=" && !(rv <= threshold)) return false;
      }

      return true;
    });
  }, [aggregated, filterQuery, squadDetails, hiddenSquadIds, showHidden,
      filterArticleIds, filterProviderIds, filterStatuses, metricFilters, articles, providers]);

  useEffect(() => {
    onFilteredRowsChange?.(filtered);
  }, [filtered, onFilteredRowsChange]);

  const totals = useMemo((): AggrRow | null => {
    if (filtered.length === 0) return null;
    const s = filtered.reduce((acc, r) => {
      acc.spend_usd             += r.spend_usd;
      acc.revenue_usd           += r.revenue_usd;
      acc.revenue_eur           += r.revenue_eur;
      acc.impressions           += r.impressions;
      acc.swipes                += r.swipes;
      acc.clicks                += r.clicks;
      acc.page_views            += r.page_views;
      acc.video_views           += r.video_views;
      acc.ad_requests           += r.ad_requests;
      acc.matched_ad_requests   += r.matched_ad_requests;
      acc.requests              += r.requests;
      acc.feed_impressions      += r.feed_impressions;
      acc.funnel_clicks         += r.funnel_clicks;
      acc.funnel_impressions    += r.funnel_impressions;
      acc.funnel_requests       += r.funnel_requests;
      acc.snap_results          += r.snap_results;
      acc.snap_purchase_value_usd += r.snap_purchase_value_usd;
      return acc;
    }, {
      spend_usd: 0, revenue_usd: 0, revenue_eur: 0,
      impressions: 0, swipes: 0, clicks: 0, page_views: 0, video_views: 0,
      ad_requests: 0, matched_ad_requests: 0, requests: 0, feed_impressions: 0,
      funnel_clicks: 0, funnel_impressions: 0, funnel_requests: 0,
      snap_results: 0, snap_purchase_value_usd: 0,
    });
    return {
      ad_squad_id: "__totals__", ad_squad_name: "", domain_name: "",
      feed_provider_id: "", ad_account_id: "", platform: "snap" as const,
      ...s,
      profit:               s.revenue_usd - s.spend_usd,
      roi_pct:              s.spend_usd > 0 ? (s.revenue_usd / s.spend_usd) * 100 : null,
      roi_1d: null, spend_1d: null, revenue_1d: null,
      roi_2d: null, spend_2d: null, revenue_2d: null,
      roi_3d: null, spend_3d: null, revenue_3d: null,
      rpc:                  s.funnel_clicks >= 10 && s.clicks > 0 ? s.revenue_usd / s.clicks : null,
      cpm:                  s.impressions > 0 ? (s.spend_usd / s.impressions) * 1000 : null,
      cpc:                  s.swipes > 0 ? s.spend_usd / s.swipes : null,
      ctr:                  s.impressions > 0 ? (s.swipes / s.impressions) * 100 : null,
      rpr:                  s.funnel_clicks >= 10 && s.snap_results > 0 ? s.revenue_usd / s.snap_results : null,
      fill_rate:            s.swipes > 0 ? (s.funnel_impressions / s.swipes) * 100 : null,
      cvr:                  s.swipes > 0 ? (s.funnel_clicks / s.swipes) * 100 : null,
      snap_cost_per_result: s.snap_results > 0 ? s.spend_usd / s.snap_results : null,
    };
  }, [filtered]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  function sortableTh(colKey: SortKey, label: string, thClass = "px-3") {
    if (!visibleColumns.has(colKey)) return null;
    const active = colKey === sortKey;
    return (
      <th
        key={colKey}
        onClick={() => toggleSort(colKey)}
        className={`group ${thClass} py-3 text-left text-xs font-semibold whitespace-nowrap cursor-pointer select-none ${
          active ? "text-blue-600" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
        }`}
      >
        <div className="flex items-center gap-1">
          {label}
          <SortArrow active={active} desc={sortDesc} />
        </div>
      </th>
    );
  }

  function staticTh(colKey: string, label: string, thClass = "px-3") {
    if (!visibleColumns.has(colKey)) return null;
    return (
      <th key={colKey} className={`${thClass} py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap`}>
        {label}
      </th>
    );
  }

  function optTd(colKey: string, content: React.ReactNode, extraClass = "", padX = "px-3") {
    if (!visibleColumns.has(colKey)) return null;
    return <td key={colKey} className={`${padX} py-2.5 whitespace-nowrap ${extraClass}`}>{content}</td>;
  }

  async function readPatchError(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      return friendlyPatchError(body.message || body.error || `HTTP ${res.status}`);
    } catch {
      return `HTTP ${res.status}`;
    }
  }

  function friendlyPatchError(raw: string): string {
    if (raw.includes("E2025") || raw.toLowerCase().includes("placement v2")) {
      return "This ad set uses Smart placement, so Snapchat locks it against API edits — change its budget, bid, or status in Snapchat Ads Manager. (To keep in-app editing, launch future campaigns from a preset with Smart placement turned off.)";
    }
    if (raw.includes("catalogue_squad_readonly") || raw.toLowerCase().includes("catalogue") || raw.toLowerCase().includes("collection")) {
      return "Catalogue (Collection) campaigns cannot be edited via the Snapchat API — budget, bid, and status changes must be made in Snapchat Ads Manager directly.";
    }
    return raw;
  }

  function getPlatform(squadId: string): "snap" | "meta" {
    return filtered.find(r => r.ad_squad_id === squadId)?.platform ?? "snap";
  }

  async function saveBudget(squadId: string) {
    const dollars = parseFloat(budgetDraft);
    if (isNaN(dollars) || dollars <= 0) { setInlineError("Budget must be > $0"); return; }
    const detail = squadDetails.get(squadId);
    if (!detail) return;
    const platform = getPlatform(squadId);
    const oldValue = `$${microToDollar(detail.daily_budget_micro).toFixed(2)}`;
    setSavingInline(squadId + "_budget");
    setInlineError(null);
    const newMicro = dollarToMicro(dollars);
    try {
      const res = platform === "meta"
        ? await fetch("/api/meta/adsets", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adAccountId: detail.ad_account_id, adSetId: squadId, updates: { daily_budget: Math.round(dollars * 100) } }),
          })
        : await fetch("/api/snapchat/adsquads", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adAccountId: detail.ad_account_id, squadId, daily_budget_micro: newMicro }),
          });
      if (!res.ok) throw new Error(await readPatchError(res));
      onSquadPatched?.(squadId, { daily_budget_micro: newMicro });
      addChangeEntry({ squadId, field: "budget", oldValue, newValue: `$${dollars.toFixed(2)}`, timestamp: new Date().toISOString() });
      onSquadUpdated();
    } catch (err) {
      setInlineError(`Budget save failed: ${err instanceof Error ? err.message : "unknown"}`);
    }
    setSavingInline(null);
    setEditingBudget(null);
  }

  async function saveBid(squadId: string) {
    const dollars = parseFloat(bidDraft);
    if (isNaN(dollars) || dollars < 0.01) { setInlineError("Min bid $0.01"); return; }
    const detail = squadDetails.get(squadId);
    if (!detail) return;
    const platform = getPlatform(squadId);
    const oldValue = `$${microToDollar(detail.bid_micro).toFixed(2)}`;
    setSavingInline(squadId + "_bid");
    setInlineError(null);
    const newMicro = dollarToMicro(dollars);
    try {
      const res = platform === "meta"
        ? await fetch("/api/meta/adsets", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adAccountId: detail.ad_account_id, adSetId: squadId, updates: { bid_amount: Math.round(dollars * 100) } }),
          })
        : await fetch("/api/snapchat/adsquads", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adAccountId: detail.ad_account_id, squadId, bid_micro: newMicro }),
          });
      if (!res.ok) throw new Error(await readPatchError(res));
      onSquadPatched?.(squadId, { bid_micro: newMicro });
      addChangeEntry({ squadId, field: "bid", oldValue, newValue: `$${dollars.toFixed(2)}`, timestamp: new Date().toISOString() });
      onSquadUpdated();
    } catch (err) {
      setInlineError(`Bid save failed: ${err instanceof Error ? err.message : "unknown"}`);
    }
    setSavingInline(null);
    setEditingBid(null);
  }

  async function toggleStatus(squadId: string) {
    const detail = squadDetails.get(squadId);
    if (!detail) return;
    const platform = getPlatform(squadId);
    const oldStatus = detail.status;
    const newStatus = oldStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const res = platform === "meta"
        ? await fetch("/api/meta/adsets", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adAccountId: detail.ad_account_id, adSetId: squadId, updates: { status: newStatus } }),
          })
        : await fetch("/api/snapchat/adsquads", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adAccountId: detail.ad_account_id, squadId, status: newStatus }),
          });
      if (!res.ok) throw new Error(await readPatchError(res));
      onSquadPatched?.(squadId, { status: newStatus });
      addChangeEntry({ squadId, field: "status", oldValue: oldStatus, newValue: newStatus, timestamp: new Date().toISOString() });
      onSquadUpdated();
    } catch (err) {
      console.error("status toggle failed", err);
      setInlineError(`Status update failed: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  async function applyBulk(field: "budget" | "bid" | "status") {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkError(null);

    if (field === "budget") {
      const v = parseFloat(bulkBudget);
      if (isNaN(v) || v <= 0) {
        setBulkError(budgetMode === "pct" ? "Percentage must be > 0" : "Amount must be > $0");
        return;
      }
    } else if (field === "bid") {
      const v = parseFloat(bulkBid);
      if (isNaN(v) || v <= 0) {
        setBulkError(bidMode === "pct" ? "Percentage must be > 0" : "Amount must be > $0");
        return;
      }
    }

    setBulkSaving(true);

    const results = await Promise.allSettled(
      ids.map(async (squadId) => {
        const detail = squadDetails.get(squadId);
        if (!detail) throw new Error("squad not loaded");

        let patch: Partial<SquadDetail> = {};
        if (field === "budget") {
          const v = parseFloat(bulkBudget);
          if (budgetMode === "set") {
            patch = { daily_budget_micro: dollarToMicro(v) };
          } else if (budgetMode === "add") {
            const cur = detail.daily_budget_micro ?? 0;
            const delta = dollarToMicro(v);
            patch = { daily_budget_micro: Math.max(0, budgetDir === "+" ? cur + delta : cur - delta) };
          } else {
            const cur = detail.daily_budget_micro ?? 0;
            const factor = budgetDir === "+" ? 1 + v / 100 : 1 - v / 100;
            patch = { daily_budget_micro: Math.max(0, Math.round(cur * factor)) };
          }
        } else if (field === "bid") {
          const v = parseFloat(bulkBid);
          if (bidMode === "set") {
            patch = { bid_micro: dollarToMicro(v) };
          } else if (bidMode === "add") {
            const cur = detail.bid_micro ?? 0;
            const delta = dollarToMicro(v);
            patch = { bid_micro: Math.max(0, bidDir === "+" ? cur + delta : cur - delta) };
          } else {
            const cur = detail.bid_micro ?? 0;
            const factor = bidDir === "+" ? 1 + v / 100 : 1 - v / 100;
            patch = { bid_micro: Math.max(0, Math.round(cur * factor)) };
          }
        } else {
          patch = { status: bulkStatus };
        }

        let oldValue = "";
        let newValue = "";
        if (field === "budget" && patch.daily_budget_micro !== undefined) {
          oldValue = `$${microToDollar(detail.daily_budget_micro).toFixed(2)}`;
          newValue = `$${microToDollar(patch.daily_budget_micro).toFixed(2)}`;
        } else if (field === "bid" && patch.bid_micro !== undefined) {
          oldValue = `$${microToDollar(detail.bid_micro).toFixed(2)}`;
          newValue = `$${microToDollar(patch.bid_micro).toFixed(2)}`;
        } else if (field === "status" && patch.status) {
          oldValue = detail.status;
          newValue = patch.status;
        }

        const platform = getPlatform(squadId);
        let res: Response;
        if (platform === "meta") {
          const updates: Record<string, unknown> = {};
          if (patch.daily_budget_micro !== undefined) updates.daily_budget = Math.round(patch.daily_budget_micro / 10_000);
          if (patch.bid_micro !== undefined) updates.bid_amount = Math.round(patch.bid_micro / 10_000);
          if (patch.status) updates.status = patch.status;
          res = await fetch("/api/meta/adsets", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adAccountId: detail.ad_account_id, adSetId: squadId, updates }),
          });
        } else {
          const body: Record<string, unknown> = { adAccountId: detail.ad_account_id, squadId, ...patch };
          res = await fetch("/api/snapchat/adsquads", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        }
        if (!res.ok) throw new Error(await readPatchError(res));
        return { squadId, patch, changeField: field, oldValue, newValue };
      })
    );

    let firstErrorMsg = "";
    let failures = 0;
    for (const r of results) {
      if (r.status === "fulfilled") {
        onSquadPatched?.(r.value.squadId, r.value.patch);
        addChangeEntry({
          squadId: r.value.squadId,
          field: r.value.changeField,
          oldValue: r.value.oldValue,
          newValue: r.value.newValue,
          timestamp: new Date().toISOString(),
        });
      } else {
        failures++;
        if (!firstErrorMsg) firstErrorMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      }
    }

    setBulkSaving(false);
    if (failures > 0) {
      setBulkError(`${failures} of ${ids.length} update${ids.length === 1 ? "" : "s"} failed: ${firstErrorMsg}`);
    } else {
      setSelectedIds(new Set());
      setShowBulkEdit(false);
      setBulkError(null);
    }
    onSquadUpdated();
  }

  const allSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.ad_squad_id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      setShowBulkEdit(false);
    } else {
      setSelectedIds(new Set(filtered.map(r => r.ad_squad_id)));
    }
    lastCheckedIdx.current = null;
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setShowBulkEdit(false);
    setBulkError(null);
    lastCheckedIdx.current = null;
  }

  function downloadCsv() {
    const headers = [
      "Campaign", "Spend ($)", "Revenue ($)", "ROI (%)", "Profit ($)",
      "Impressions", "Clicks", "Funnel Clicks", "CTR (%)", "CPM", "CPC",
      "CVR (%)", "Revenue per Result", "Fill Rate (%)", "RPC", "Page Views", "Ad Clicks",
      "Requests", "Feed Impressions", "Matched Requests", "Funnel Impressions", "Funnel Requests",
      "Domain", "Budget ($)", "Bid ($)", "Status", "-1D ROI", "-2D ROI", "-3D ROI",
      "Results", "Cost per Result", "Purchase Value ($)",
    ];
    const csvRows = filtered.map(r => {
      const detail = squadDetails.get(r.ad_squad_id);
      return [
        `"${r.ad_squad_name.replace(/"/g, '""')}"`,
        r.spend_usd.toFixed(2), r.revenue_usd.toFixed(2),
        r.roi_pct !== null ? r.roi_pct.toFixed(2) : "",
        r.profit.toFixed(2),
        r.impressions, r.swipes, r.funnel_clicks,
        r.ctr !== null ? r.ctr.toFixed(2) : "",
        r.cpm !== null ? r.cpm.toFixed(2) : "",
        r.cpc !== null ? r.cpc.toFixed(2) : "",
        r.cvr !== null ? r.cvr.toFixed(2) : "",
        r.rpr !== null ? r.rpr.toFixed(2) : "",
        r.fill_rate !== null ? r.fill_rate.toFixed(2) : "",
        r.rpc !== null ? r.rpc.toFixed(2) : "",
        r.page_views, r.clicks, r.requests, r.feed_impressions, r.matched_ad_requests,
        r.funnel_impressions, r.funnel_requests,
        `"${r.domain_name || ""}"`,
        detail ? microToDollar(detail.daily_budget_micro).toFixed(2) : "",
        detail ? microToDollar(detail.bid_micro).toFixed(2) : "",
        detail ? detail.status : "",
        r.roi_1d !== null ? r.roi_1d.toFixed(2) : "",
        r.roi_2d !== null ? r.roi_2d.toFixed(2) : "",
        r.roi_3d !== null ? r.roi_3d.toFixed(2) : "",
        r.snap_results,
        r.snap_cost_per_result !== null ? r.snap_cost_per_result.toFixed(2) : "",
        r.snap_purchase_value_usd.toFixed(2),
      ].join(",");
    });
    const content = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "performance.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const activeFilterCount =
    filterArticleIds.size +
    filterProviderIds.size +
    filterStatuses.size +
    metricFilters.filter(mf => mf.metric && mf.value.trim()).length;

  function clearAllFilters() {
    setFilterArticleIds(new Set());
    setFilterProviderIds(new Set());
    setFilterStatuses(new Set());
    setMetricFilters([]);
  }

  if (aggregated.length === 0) {
    return (
      <p className="text-sm text-gray-500 mt-8 text-center">
        No data found for the selected filters. Try refreshing or widening the date range.
      </p>
    );
  }

  const hasSelection = selectedIds.size > 0;

  return (
    <>
      <p className="text-xs text-gray-400 mb-3">
        Revenue converted at 1 EUR = ${eurToUsd.toFixed(4)} USD · Click any campaign name for daily breakdown
      </p>

      {inlineError && (
        <p className="text-xs text-red-500 mb-2">{inlineError}</p>
      )}

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            {hasSelection ? (
              <>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 pl-1">{selectedIds.size} selected</span>
                <button
                  onClick={() => { setShowBulkEdit(v => !v); setBulkError(null); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-md border transition-colors ${
                    showBulkEdit
                      ? "bg-blue-600 text-white border-blue-600"
                      : "text-blue-600 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
                <button
                  disabled
                  className="flex items-center gap-1.5 px-2.5 py-1 text-sm text-gray-400 border border-gray-200 dark:border-gray-700 rounded-md cursor-not-allowed"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
                <button
                  onClick={clearSelection}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  title="Clear selection"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            ) : (
              <span className="text-xs text-gray-400 pl-1 select-none">Select rows to take action</span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search campaigns…"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md w-52 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            {/* Filters toggle */}
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md border transition-colors whitespace-nowrap ${
                showFilters || activeFilterCount > 0
                  ? "bg-blue-600 text-white border-blue-600"
                  : "text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
            </button>

            {/* Show hidden toggle */}
            {hiddenSquadIds.size > 0 && (
              <button
                onClick={() => setShowHidden((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md border transition-colors whitespace-nowrap ${
                  showHidden
                    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-600"
                    : "text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
                title={showHidden ? "Hide ignored campaigns" : "Show ignored campaigns"}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {showHidden
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    : <><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></>
                  }
                </svg>
                Ignored ({hiddenSquadIds.size})
              </button>
            )}

            {/* Column selector */}
            <ColumnSelector
              visible={visibleColumns}
              order={columnOrder}
              onChange={onColumnsChange}
              onOrderChange={onColumnOrderChange}
            />

            {/* Download CSV */}
            <button
              onClick={downloadCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              CSV
            </button>
          </div>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="bg-gray-800/50 border-b border-gray-700 px-4 py-3">
            <div className="flex flex-wrap items-start gap-3">
              <span className="text-[10px] uppercase tracking-widest text-gray-500 self-center mr-1">Filters</span>

              {/* Article multi-select */}
              <div className="relative" ref={articleDropRef}>
                <button
                  onClick={() => setArticleDropOpen(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    filterArticleIds.size > 0
                      ? "border-blue-500 bg-blue-600/10 text-blue-400"
                      : "border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500"
                  }`}
                >
                  {filterArticleIds.size > 0 ? `Article · ${filterArticleIds.size}` : "Article"}
                  <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {articleDropOpen && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-60">
                    <div className="px-2 pt-2 pb-1.5 border-b border-gray-800">
                      <div className="relative">
                        <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                        </svg>
                        <input
                          autoFocus
                          type="text"
                          placeholder="Search articles…"
                          value={articleSearch}
                          onChange={e => setArticleSearch(e.target.value)}
                          className="w-full pl-6 pr-2 py-1 text-xs rounded border border-gray-700 bg-gray-800 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto py-1">
                      {articles.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-500">No articles found</p>
                      ) : (() => {
                        const filtered = articles.filter(a => a.slug.toLowerCase().includes(articleSearch.toLowerCase()));
                        return filtered.length === 0
                          ? <p className="px-3 py-2 text-xs text-gray-500">No matches</p>
                          : filtered.map(a => (
                            <label key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={filterArticleIds.has(a.id)}
                                onChange={() => setFilterArticleIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
                                  return next;
                                })}
                                onClick={e => e.stopPropagation()}
                                className="w-3.5 h-3.5 rounded border-gray-600 text-blue-500 focus:ring-blue-500 flex-shrink-0"
                              />
                              <span className="truncate">{a.slug}</span>
                            </label>
                          ));
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Provider multi-select */}
              <div className="relative" ref={providerDropRef}>
                <button
                  onClick={() => setProviderDropOpen(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    filterProviderIds.size > 0
                      ? "border-blue-500 bg-blue-600/10 text-blue-400"
                      : "border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500"
                  }`}
                >
                  {filterProviderIds.size > 0 ? `Provider · ${filterProviderIds.size}` : "Feed Provider"}
                  <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {providerDropOpen && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-60">
                    <div className="px-2 pt-2 pb-1.5 border-b border-gray-800">
                      <div className="relative">
                        <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                        </svg>
                        <input
                          autoFocus
                          type="text"
                          placeholder="Search providers…"
                          value={providerSearch}
                          onChange={e => setProviderSearch(e.target.value)}
                          className="w-full pl-6 pr-2 py-1 text-xs rounded border border-gray-700 bg-gray-800 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto py-1">
                      {providers.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-500">No providers found</p>
                      ) : (() => {
                        const filtered = providers.filter(p => p.name.toLowerCase().includes(providerSearch.toLowerCase()));
                        return filtered.length === 0
                          ? <p className="px-3 py-2 text-xs text-gray-500">No matches</p>
                          : filtered.map(p => (
                            <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={filterProviderIds.has(p.id)}
                                onChange={() => setFilterProviderIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                                  return next;
                                })}
                                onClick={e => e.stopPropagation()}
                                className="w-3.5 h-3.5 rounded border-gray-600 text-blue-500 focus:ring-blue-500 flex-shrink-0"
                              />
                              <span className="truncate">{p.name}</span>
                            </label>
                          ));
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Status filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-24 flex-shrink-0">Status</span>
                <div className="flex gap-1.5">
                  {(["ACTIVE", "PAUSED"] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setFilterStatuses(prev => {
                        const next = new Set(prev);
                        if (next.has(s)) next.delete(s); else next.add(s);
                        return next;
                      })}
                      className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                        filterStatuses.has(s)
                          ? s === "ACTIVE"
                            ? "bg-green-600 border-green-500 text-white"
                            : "bg-yellow-600 border-yellow-500 text-white"
                          : "bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400"
                      }`}
                    >
                      {s === "ACTIVE" ? "Active" : "Paused"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Metric filter rows */}
              <div className="flex flex-col gap-1.5">
                {metricFilters.map((mf, i) => (
                  <div key={mf.id} className="flex items-center gap-1.5">
                    <select
                      value={mf.metric}
                      onChange={e => setMetricFilters(prev => prev.map((f, fi) => fi === i ? { ...f, metric: e.target.value } : f))}
                      className="border border-gray-600 rounded px-2 py-1 text-xs bg-gray-800 text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">— metric —</option>
                      {FILTERABLE_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                    <select
                      value={mf.op}
                      onChange={e => setMetricFilters(prev => prev.map((f, fi) => fi === i ? { ...f, op: e.target.value } : f))}
                      className="border border-gray-600 rounded px-1.5 py-1 text-xs bg-gray-800 text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 w-12"
                    >
                      <option value=">">&gt;</option>
                      <option value=">=">&ge;</option>
                      <option value="<">&lt;</option>
                      <option value="<=">&le;</option>
                    </select>
                    <input
                      type="number"
                      value={mf.value}
                      onChange={e => setMetricFilters(prev => prev.map((f, fi) => fi === i ? { ...f, value: e.target.value } : f))}
                      placeholder="value"
                      className="w-20 border border-gray-600 rounded px-2 py-1 text-xs bg-gray-800 text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => setMetricFilters(prev => prev.filter((_, fi) => fi !== i))}
                      className="p-0.5 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setMetricFilters(prev => [...prev, { id: Math.random().toString(36).slice(2), metric: "", op: ">", value: "" }])}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-0.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add metric filter
                </button>
              </div>

              {/* Clear all */}
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="ml-auto self-start text-xs text-gray-500 hover:text-red-400 underline transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
        )}

        {/* Bulk edit panel */}
        {showBulkEdit && hasSelection && (
          <div className="bg-gray-800/60 border-b border-gray-700 px-4 py-3">
            <div className="flex flex-wrap items-start gap-3">

              {/* Budget card */}
              <div className="bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">Budget</span>
                  <div className="flex rounded overflow-hidden border border-gray-700 text-[10px]">
                    {(["set", "add", "pct"] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setBudgetMode(m)}
                        className={`px-2 py-0.5 transition-colors ${
                          budgetMode === m
                            ? "bg-blue-600 text-white"
                            : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                        }`}
                      >
                        {m === "set" ? "$ Set" : m === "add" ? "+/- $" : "+/- %"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {budgetMode !== "set" && (
                    <button
                      onClick={() => setBudgetDir(d => d === "+" ? "-" : "+")}
                      className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center transition-colors border ${
                        budgetDir === "+"
                          ? "border-green-600 text-green-400 bg-green-900/30 hover:bg-green-900/50"
                          : "border-red-600 text-red-400 bg-red-900/30 hover:bg-red-900/50"
                      }`}
                    >
                      {budgetDir}
                    </button>
                  )}
                  <div className="relative">
                    <input
                      type="number" min={0.01} step={budgetMode === "pct" ? 1 : 0.01}
                      placeholder={budgetMode === "pct" ? "20" : "0.00"}
                      value={bulkBudget}
                      onChange={(e) => setBulkBudget(e.target.value)}
                      className="w-20 border border-gray-600 rounded px-2 py-1 pr-5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-800 text-gray-100"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 pointer-events-none">
                      {budgetMode === "pct" ? "%" : "$"}
                    </span>
                  </div>
                  <button
                    onClick={() => void applyBulk("budget")}
                    disabled={bulkSaving}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 font-medium transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* Bid card */}
              <div className="bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">Bid</span>
                  <div className="flex rounded overflow-hidden border border-gray-700 text-[10px]">
                    {(["set", "add", "pct"] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setBidMode(m)}
                        className={`px-2 py-0.5 transition-colors ${
                          bidMode === m
                            ? "bg-blue-600 text-white"
                            : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                        }`}
                      >
                        {m === "set" ? "$ Set" : m === "add" ? "+/- $" : "+/- %"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {bidMode !== "set" && (
                    <button
                      onClick={() => setBidDir(d => d === "+" ? "-" : "+")}
                      className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center transition-colors border ${
                        bidDir === "+"
                          ? "border-green-600 text-green-400 bg-green-900/30 hover:bg-green-900/50"
                          : "border-red-600 text-red-400 bg-red-900/30 hover:bg-red-900/50"
                      }`}
                    >
                      {bidDir}
                    </button>
                  )}
                  <div className="relative">
                    <input
                      type="number" min={0.01} step={bidMode === "pct" ? 1 : 0.01}
                      placeholder={bidMode === "pct" ? "20" : "1.00"}
                      value={bulkBid}
                      onChange={(e) => setBulkBid(e.target.value)}
                      className="w-20 border border-gray-600 rounded px-2 py-1 pr-5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-800 text-gray-100"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 pointer-events-none">
                      {bidMode === "pct" ? "%" : "$"}
                    </span>
                  </div>
                  <button
                    onClick={() => void applyBulk("bid")}
                    disabled={bulkSaving}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 font-medium transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* Status card */}
              <div className="bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2 flex flex-col gap-2">
                <span className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">Status</span>
                <div className="flex items-center gap-1.5">
                  <select
                    value={bulkStatus}
                    onChange={(e) => setBulkStatus(e.target.value as "ACTIVE" | "PAUSED")}
                    className="border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none bg-gray-800 text-gray-100"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="PAUSED">Paused</option>
                  </select>
                  <button
                    onClick={() => void applyBulk("status")}
                    disabled={bulkSaving}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 font-medium transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>

            </div>
            {bulkSaving && <span className="text-xs text-blue-400 mt-2 block">Saving…</span>}
            {bulkError && <span className="text-xs text-red-400 mt-2 block">{bulkError}</span>}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                {/* Master checkbox */}
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>

                {/* Name — always visible, resizable */}
                <th
                  className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap relative select-none"
                  style={{ width: nameColWidth, minWidth: nameColWidth, maxWidth: nameColWidth }}
                >
                  Name
                  <div
                    onMouseDown={onResizeMouseDown}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize group flex items-center justify-center"
                    title="Drag to resize"
                  >
                    <div className="w-0.5 h-4 bg-gray-300 dark:bg-gray-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </th>

                {/* Status toggle — always visible */}
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  Status
                </th>

                {/* Delivery badge — always visible */}
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  Delivery
                </th>

                {/* Budget — always visible */}
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  Budget
                </th>

                {/* Bid — always visible */}
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  Bid
                </th>

                {/* Metric columns — ordered by columnOrder */}
                {columnOrder.map((key) => {
                  const col = METRIC_COLS[key];
                  if (!col) return null;
                  if (col.sortKey) return sortableTh(col.sortKey, col.label, col.thClass);
                  return staticTh(key, col.label, col.thClass);
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
              {filtered.map((r, rowIndex) => {
                const detail = squadDetails.get(r.ad_squad_id);
                const isSelected = selectedIds.has(r.ad_squad_id);
                const isActive = detail ? detail.status === "ACTIVE" : false;
                const isHidden = hiddenSquadIds.has(r.ad_squad_id);

                const stripeColor = providerColorMap[resolveProviderKey(r, providers)] ?? "transparent";

                return (
                  <tr
                    key={r.ad_squad_id}
                    style={{ boxShadow: `inset 3px 0 0 ${stripeColor}` }}
                    className={`transition-colors ${
                      isHidden ? "opacity-40" : ""
                    } ${
                      isSelected ? "bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30" : "hover:bg-slate-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {/* controlled via onClick */}}
                        onClick={(e) => {
                          const willCheck = !selectedIds.has(r.ad_squad_id);
                          const next = new Set(selectedIds);
                          if (e.shiftKey && lastCheckedIdx.current !== null) {
                            const lo = Math.min(lastCheckedIdx.current, rowIndex);
                            const hi = Math.max(lastCheckedIdx.current, rowIndex);
                            for (let i = lo; i <= hi; i++) {
                              if (willCheck) next.add(filtered[i].ad_squad_id);
                              else next.delete(filtered[i].ad_squad_id);
                            }
                          } else {
                            if (willCheck) next.add(r.ad_squad_id);
                            else next.delete(r.ad_squad_id);
                          }
                          lastCheckedIdx.current = rowIndex;
                          setSelectedIds(next);
                        }}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>

                    {/* Campaign name */}
                    <td
                      className="px-3 py-2.5 overflow-hidden"
                      style={{ width: nameColWidth, minWidth: nameColWidth, maxWidth: nameColWidth }}
                    >
                      <div className="group/name flex items-center gap-1.5 min-w-0">
                        <PlatformIcon platform={r.platform} className="w-3.5 h-3.5 flex-shrink-0 text-yellow-400" />
                        <button
                          onClick={() => setDrilldown({
                            id: r.ad_squad_id,
                            name: r.ad_squad_name,
                            accountId: detail?.ad_account_id ?? "",
                          })}
                          className="text-left text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate block min-w-0"
                          title={r.ad_squad_name}
                        >
                          {r.ad_squad_name}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void navigator.clipboard.writeText(r.ad_squad_name).then(() => {
                              setCopiedId(r.ad_squad_id);
                              setTimeout(() => setCopiedId(null), 1500);
                            });
                          }}
                          className="flex-shrink-0 opacity-0 group-hover/name:opacity-100 transition-opacity p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                          title="Copy campaign name"
                        >
                          <svg className={`w-3.5 h-3.5 transition-colors ${copiedId === r.ad_squad_id ? "text-green-400" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            {copiedId === r.ad_squad_id
                              ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              : <><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></>
                            }
                          </svg>
                        </button>
                      </div>
                    </td>

                    {/* Status toggle */}
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {detail ? (
                        <button
                          onClick={() => void toggleStatus(r.ad_squad_id)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            isActive ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            isActive ? "translate-x-4" : "translate-x-0.5"
                          }`} />
                        </button>
                      ) : <span className="text-xs text-gray-300">…</span>}
                    </td>

                    {/* Delivery badge */}
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {detail ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          isActive
                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-green-500" : "bg-gray-400"}`} />
                          {isActive ? "Active" : "Paused"}
                        </span>
                      ) : <span className="text-xs text-gray-300">…</span>}
                    </td>

                    {/* Budget inline */}
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {detail ? (
                        editingBudget === r.ad_squad_id ? (
                          <input
                            autoFocus
                            type="number" min={0.01} step={0.01}
                            value={budgetDraft}
                            onChange={(e) => setBudgetDraft(e.target.value)}
                            onBlur={() => void saveBudget(r.ad_squad_id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveBudget(r.ad_squad_id);
                              if (e.key === "Escape") setEditingBudget(null);
                            }}
                            className="w-20 border border-blue-400 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100"
                          />
                        ) : (
                          <button
                            onClick={() => {
                              setBudgetDraft(microToDollar(detail.daily_budget_micro).toFixed(2));
                              setEditingBudget(r.ad_squad_id);
                              setInlineError(null);
                            }}
                            className="group flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            {savingInline === r.ad_squad_id + "_budget" ? "…" : fmt$(microToDollar(detail.daily_budget_micro))}
                            <svg className="w-3 h-3 text-gray-300 dark:text-gray-600 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
                            </svg>
                          </button>
                        )
                      ) : <span className="text-xs text-gray-300">…</span>}
                    </td>

                    {/* Bid inline */}
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {detail ? (
                        editingBid === r.ad_squad_id ? (
                          <input
                            autoFocus
                            type="number" min={0.01} step={0.01}
                            value={bidDraft}
                            onChange={(e) => setBidDraft(e.target.value)}
                            onBlur={() => void saveBid(r.ad_squad_id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveBid(r.ad_squad_id);
                              if (e.key === "Escape") setEditingBid(null);
                            }}
                            className="w-16 border border-blue-400 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100"
                          />
                        ) : (
                          <button
                            onClick={() => {
                              setBidDraft(microToDollar(detail.bid_micro).toFixed(2));
                              setEditingBid(r.ad_squad_id);
                              setInlineError(null);
                            }}
                            className="group flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            {savingInline === r.ad_squad_id + "_bid" ? "…" : fmt$(microToDollar(detail.bid_micro))}
                            <svg className="w-3 h-3 text-gray-300 dark:text-gray-600 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
                            </svg>
                          </button>
                        )
                      ) : <span className="text-xs text-gray-300">…</span>}
                    </td>

                    {/* Metric cells — ordered by columnOrder */}
                    {columnOrder.map((key) => {
                      const col = METRIC_COLS[key];
                      if (!col) return null;
                      return optTd(key, col.render(r), col.tdClass ?? "", col.padX);
                    })}
                  </tr>
                );
              })}
            </tbody>

            {totals && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60">
                  <td className="px-3 py-2.5" />
                  <td
                    className="px-3 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap"
                    style={{ width: nameColWidth, minWidth: nameColWidth, maxWidth: nameColWidth }}
                  >
                    Total ({filtered.length})
                  </td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-600">—</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-600">—</td>
                  {columnOrder.map((key) => {
                    const col = METRIC_COLS[key];
                    if (!col) return null;
                    return optTd(key, col.render(totals), col.tdClass ?? "", col.padX);
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Empty filtered state */}
        {filtered.length === 0 && filterQuery && (
          <div className="py-10 text-center text-sm text-gray-400">
            No campaigns match &ldquo;{filterQuery}&rdquo;
          </div>
        )}
      </div>

      {drilldown && (
        <DrilldownModal
          adSquadName={drilldown.name}
          adSquadId={drilldown.id}
          adAccountId={drilldown.accountId}
          squadDetail={squadDetails.get(drilldown.id)}
          onSquadPatched={(patch) => onSquadPatched?.(drilldown.id, patch)}
          onClose={() => setDrilldown(null)}
          isHidden={hiddenSquadIds.has(drilldown.id)}
          onToggleHide={() => toggleHideSquad(drilldown.id)}
        />
      )}
    </>
  );
}
