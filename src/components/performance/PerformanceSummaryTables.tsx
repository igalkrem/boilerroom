"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { CombinedRow } from "@/app/api/reporting/combined/route";
import type { Article } from "@/types/article";
import type { FeedProvider } from "@/types/feed-provider";
import type { SquadDetail } from "@/components/performance/PerformanceTable";
import { resolveProviderKey } from "@/lib/reporting/provider-key";

// Same palette as CampaignCanvas — providers keep consistent colors across the app.
const PROVIDER_COLORS = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ec4899", "#f59e0b"] as const;

// ── Utilities ──────────────────────────────────────────────────────────────

function norm(s: string) {
  return s.toLowerCase().replace(/[\s_-]/g, " ");
}

function dateMinus(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  const parts = iso.split("-");
  return `${parseInt(parts[2])}/${parseInt(parts[1])}`;
}

function roiPct(spend: number, revenue: number): number | null {
  return spend > 0 ? (revenue / spend) * 100 : null;
}

function fmtMoney(n: number): string {
  const abs = Math.round(Math.abs(n));
  return `${n < 0 ? "-" : ""}$${abs.toLocaleString()}`;
}

function sumRows(rows: CombinedRow[]): { spend: number; revenue: number } {
  let spend = 0, revenue = 0;
  for (const r of rows) { spend += r.spend_usd; revenue += r.revenue_usd; }
  return { spend, revenue };
}

function histStats(
  histRows: CombinedRow[],
  date: string,
  pred: (r: CombinedRow) => boolean
): { spend: number; revenue: number } | null {
  const filtered = histRows.filter(r => r.stat_date === date && pred(r));
  if (filtered.length === 0) return null;
  const { spend, revenue } = sumRows(filtered);
  return spend > 0 || revenue > 0 ? { spend, revenue } : null;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface SummaryRow {
  key: string;
  label: string;
  feedLabel?: string;
  spend: number;
  revenue: number;
  profit: number;
  roi: number | null;
  roi_1d: number | null;
  roi_2d: number | null;
  spend_1d?: number;
  revenue_1d?: number;
  spend_2d?: number;
  revenue_2d?: number;
  squadIds: string[];
  providerColor: string;
}

interface Props {
  rows: CombinedRow[];
  historicalRows: CombinedRow[];
  startDate: string;
  last30Rows?: CombinedRow[];
  squadDetails?: Map<string, SquadDetail>;
  onFilterChange?: (filter: { squadIds: Set<string>; label: string } | null) => void;
}

// ── ROI pill with hover tooltip ────────────────────────────────────────────

function RoiCell({ pct, meta }: { pct: number | null; meta?: { spend: number; revenue: number } }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  if (pct === null) return <span className="text-gray-500 text-xs">—</span>;
  const bg = pct >= 120 ? "bg-green-500" : pct > 105 ? "bg-orange-400" : "bg-red-500";
  const profit = meta ? meta.revenue - meta.spend : null;
  return (
    <>
      <div
        className={`inline-flex flex-col rounded overflow-hidden cursor-default ${bg}`}
        onMouseEnter={meta ? (e) => { const r = e.currentTarget.getBoundingClientRect(); setPos({ x: r.left + r.width / 2, y: r.top }); } : undefined}
        onMouseLeave={meta ? () => setPos(null) : undefined}
      >
        <div className="px-1.5 py-0.5 text-center font-semibold text-gray-900 text-xs tabular-nums">
          {Math.round(pct)}%
        </div>
        {profit !== null && (
          <>
            <div className="border-t border-black/20 mx-1" />
            <div className="px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums text-gray-900/80 leading-none">
              {fmtMoney(profit)}
            </div>
          </>
        )}
      </div>
      {pos && meta && createPortal(
        <div
          style={{ position: "fixed", left: pos.x, top: pos.y - 8, transform: "translate(-50%, -100%)", zIndex: 9999 }}
          className="bg-gray-900 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-300 shadow-xl pointer-events-none whitespace-nowrap"
        >
          <div>Spend: <span className="text-white font-medium">{fmtMoney(meta.spend)}</span></div>
          <div>Revenue: <span className="text-white font-medium">{fmtMoney(meta.revenue)}</span></div>
          <div>Profit: <span className={`font-medium ${profit! >= 0 ? "text-green-400" : "text-red-400"}`}>{profit! >= 0 ? "+" : ""}{fmtMoney(profit!)}</span></div>
        </div>,
        document.body
      )}
    </>
  );
}

function RoiPill({ pct, meta }: { pct: number | null; meta?: { spend: number; revenue: number } }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  if (pct === null) return <span className="text-gray-500 text-xs">—</span>;
  const bg = pct >= 120 ? "bg-green-500" : pct > 105 ? "bg-orange-400" : "bg-red-500";
  const profit = meta ? meta.revenue - meta.spend : null;
  return (
    <>
      <span
        className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded font-semibold text-gray-900 text-xs ${bg} ${meta ? "cursor-default" : ""}`}
        onMouseEnter={meta ? (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ x: r.left + r.width / 2, y: r.top });
        } : undefined}
        onMouseLeave={meta ? () => setPos(null) : undefined}
      >
        {Math.round(pct)}%
      </span>
      {pos && meta && createPortal(
        <div
          style={{ position: "fixed", left: pos.x, top: pos.y - 8, transform: "translate(-50%, -100%)", zIndex: 9999 }}
          className="bg-gray-900 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-300 shadow-xl pointer-events-none whitespace-nowrap"
        >
          <div>Spend: <span className="text-white font-medium">{fmtMoney(meta.spend)}</span></div>
          <div>Revenue: <span className="text-white font-medium">{fmtMoney(meta.revenue)}</span></div>
          <div>Profit: <span className={`font-medium ${profit! >= 0 ? "text-green-400" : "text-red-400"}`}>{profit! >= 0 ? "+" : ""}{fmtMoney(profit!)}</span></div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Live count badge ───────────────────────────────────────────────────────

function LiveBadge({ count }: { count: number }) {
  if (count === 0) return <span className="text-gray-600">—</span>;
  return (
    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-gray-700 text-gray-200 text-xs font-medium">
      {count}
    </span>
  );
}

// ── Sort helpers ───────────────────────────────────────────────────────────

type SortCol = "spend" | "revenue" | "profit" | "roi" | "roi_1d" | "roi_2d" | "live" | null;
type DateSortCol = "spend" | "revenue" | "profit" | "roi" | "live" | null;

function sortIndicator(active: string | null, col: string, dir: "asc" | "desc") {
  if (active !== col) return null;
  return <span className="ml-0.5 opacity-80">{dir === "asc" ? "↑" : "↓"}</span>;
}

// ── ROI table (article / feed) ─────────────────────────────────────────────

function RoiTable({
  title,
  labelHeader,
  rows,
  totalRow,
  showFeed = false,
  showTotal = true,
  squadDetails,
  onRowClick,
  isRowSelected,
}: {
  title: string;
  labelHeader: string;
  rows: SummaryRow[];
  totalRow: SummaryRow;
  showFeed?: boolean;
  showTotal?: boolean;
  squadDetails?: Map<string, SquadDetail>;
  onRowClick?: (rowKey: string) => void;
  isRowSelected?: (rowKey: string) => boolean;
}) {
  const [sortCol, setSortCol] = useState<SortCol>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  // Returns the className portion for a sortable th (no onClick — avoids duplicate prop TS2783)
  function thCls(col: SortCol, extra = "") {
    const active = sortCol === col ? "text-gray-200" : "text-gray-400 hover:text-gray-300";
    return `cursor-pointer select-none font-medium transition-colors ${active}${extra ? " " + extra : ""}`;
  }

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => {
      let av: number | null = null;
      let bv: number | null = null;
      if      (sortCol === "spend")   { av = a.spend;   bv = b.spend; }
      else if (sortCol === "revenue") { av = a.revenue; bv = b.revenue; }
      else if (sortCol === "profit")  { av = a.profit;  bv = b.profit; }
      else if (sortCol === "roi")     { av = a.roi;     bv = b.roi; }
      else if (sortCol === "roi_1d")  { av = a.roi_1d;  bv = b.roi_1d; }
      else if (sortCol === "roi_2d")  { av = a.roi_2d;  bv = b.roi_2d; }
      else if (sortCol === "live") {
        av = a.squadIds.filter(id => squadDetails?.get(id)?.status === "ACTIVE").length;
        bv = b.squadIds.filter(id => squadDetails?.get(id)?.status === "ACTIVE").length;
      }
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rows, sortCol, sortDir, squadDetails]);

  const totalLive = useMemo(() => {
    const all = new Set(rows.flatMap(r => r.squadIds.filter(id => squadDetails?.get(id)?.status === "ACTIVE")));
    return all.size;
  }, [rows, squadDetails]);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-gray-700 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="overflow-auto max-h-48">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800 sticky top-0 z-10">
              <th className="text-left px-3 py-1.5 font-medium text-gray-400">{labelHeader}</th>
              {showFeed && <th className="text-left px-2 py-1.5 font-medium text-gray-400">Feed</th>}
              <th className={thCls("spend", "text-right px-2 py-1.5")} onClick={() => handleSort("spend")}>
                Cost {sortIndicator(sortCol, "spend", sortDir)}
              </th>
              <th className={thCls("revenue", "text-right px-2 py-1.5")} onClick={() => handleSort("revenue")}>
                Revenue {sortIndicator(sortCol, "revenue", sortDir)}
              </th>
              <th className={thCls("profit", "text-right px-2 py-1.5")} onClick={() => handleSort("profit")}>
                Profit {sortIndicator(sortCol, "profit", sortDir)}
              </th>
              <th className={thCls("live", "text-center px-2 py-1.5")} onClick={() => handleSort("live")}>
                Live {sortIndicator(sortCol, "live", sortDir)}
              </th>
              <th className={thCls("roi", "text-center px-2 py-1.5 whitespace-nowrap")} onClick={() => handleSort("roi")}>
                Today ROI {sortIndicator(sortCol, "roi", sortDir)}
              </th>
              <th className={thCls("roi_1d", "text-center px-2 py-1.5 whitespace-nowrap")} onClick={() => handleSort("roi_1d")}>
                1D ago {sortIndicator(sortCol, "roi_1d", sortDir)}
              </th>
              <th className={thCls("roi_2d", "text-center px-2 py-1.5 whitespace-nowrap")} onClick={() => handleSort("roi_2d")}>
                2D ago {sortIndicator(sortCol, "roi_2d", sortDir)}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => {
              const liveCount = r.squadIds.filter(id => squadDetails?.get(id)?.status === "ACTIVE").length;
              const selected = isRowSelected?.(r.key) ?? false;
              return (
                <tr
                  key={r.key}
                  className={`border-b border-gray-700/50 transition-colors ${onRowClick ? "cursor-pointer" : ""} ${selected ? "bg-blue-500/10" : "hover:bg-gray-700/30"}`}
                  onClick={onRowClick ? () => onRowClick(r.key) : undefined}
                >
                  <td
                    className={`px-3 py-1.5 ${selected ? "text-white font-semibold" : "text-gray-200"}`}
                    style={{ borderLeft: `3px solid ${r.providerColor}` }}
                    title={r.label}
                  >
                    {r.label}
                  </td>
                  {showFeed && (
                    <td className="px-2 py-1.5 text-gray-400 max-w-[80px] truncate" title={r.feedLabel}>{r.feedLabel ?? "—"}</td>
                  )}
                  <td className="px-2 py-1.5 text-right text-gray-300 whitespace-nowrap">{fmtMoney(r.spend)}</td>
                  <td className="px-2 py-1.5 text-right text-gray-300 whitespace-nowrap">{fmtMoney(r.revenue)}</td>
                  <td className={`px-2 py-1.5 text-right whitespace-nowrap ${r.profit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(r.profit)}</td>
                  <td className="px-2 py-1.5 text-center"><LiveBadge count={liveCount} /></td>
                  <td className="px-2 py-2 text-center">
                    <RoiCell pct={r.roi} meta={{ spend: r.spend, revenue: r.revenue }} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <RoiCell pct={r.roi_1d} meta={r.spend_1d !== undefined ? { spend: r.spend_1d, revenue: r.revenue_1d! } : undefined} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <RoiCell pct={r.roi_2d} meta={r.spend_2d !== undefined ? { spend: r.spend_2d, revenue: r.revenue_2d! } : undefined} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          {showTotal && (
            <tfoot>
              <tr className="border-t-2 border-gray-600 bg-gray-700/50">
                <td className="px-3 py-1.5 font-semibold text-gray-100">Total</td>
                {showFeed && <td className="px-2 py-1.5" />}
                <td className="px-2 py-1.5 text-right font-semibold text-gray-100 whitespace-nowrap">{fmtMoney(totalRow.spend)}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-gray-100 whitespace-nowrap">{fmtMoney(totalRow.revenue)}</td>
                <td className={`px-2 py-1.5 text-right font-semibold whitespace-nowrap ${totalRow.profit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(totalRow.profit)}</td>
                <td className="px-2 py-1.5 text-center"><LiveBadge count={totalLive} /></td>
                <td className="px-2 py-2 text-center">
                  <RoiCell pct={totalRow.roi} meta={{ spend: totalRow.spend, revenue: totalRow.revenue }} />
                </td>
                <td className="px-2 py-2 text-center">
                  <RoiCell pct={totalRow.roi_1d} meta={totalRow.spend_1d !== undefined ? { spend: totalRow.spend_1d, revenue: totalRow.revenue_1d! } : undefined} />
                </td>
                <td className="px-2 py-2 text-center">
                  <RoiCell pct={totalRow.roi_2d} meta={totalRow.spend_2d !== undefined ? { spend: totalRow.spend_2d, revenue: totalRow.revenue_2d! } : undefined} />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Date table ─────────────────────────────────────────────────────────────

function DateTable({
  title,
  rows,
  totalRow,
}: {
  title: string;
  rows: SummaryRow[];
  totalRow: SummaryRow;
}) {
  const [sortCol, setSortCol] = useState<DateSortCol>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(col: DateSortCol) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  function thCls(col: DateSortCol, extra = "") {
    const active = sortCol === col ? "text-gray-200" : "text-gray-400 hover:text-gray-300";
    return `cursor-pointer select-none font-medium transition-colors ${active}${extra ? " " + extra : ""}`;
  }

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => {
      let av: number | null = null;
      let bv: number | null = null;
      if      (sortCol === "spend")   { av = a.spend;          bv = b.spend; }
      else if (sortCol === "revenue") { av = a.revenue;        bv = b.revenue; }
      else if (sortCol === "profit")  { av = a.profit;         bv = b.profit; }
      else if (sortCol === "roi")     { av = a.roi;            bv = b.roi; }
      else if (sortCol === "live")    { av = a.squadIds.length; bv = b.squadIds.length; }
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rows, sortCol, sortDir]);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-gray-700 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="overflow-auto max-h-48">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800 sticky top-0 z-10">
              <th className="text-left px-3 py-1.5 font-medium text-gray-400">Date</th>
              <th className={thCls("spend", "text-right px-2 py-1.5")} onClick={() => handleSort("spend")}>
                Cost {sortIndicator(sortCol, "spend", sortDir)}
              </th>
              <th className={thCls("revenue", "text-right px-2 py-1.5")} onClick={() => handleSort("revenue")}>
                Revenue {sortIndicator(sortCol, "revenue", sortDir)}
              </th>
              <th className={thCls("profit", "text-right px-2 py-1.5")} onClick={() => handleSort("profit")}>
                Profit {sortIndicator(sortCol, "profit", sortDir)}
              </th>
              <th className={thCls("live", "text-center px-2 py-1.5")} onClick={() => handleSort("live")}>
                Live {sortIndicator(sortCol, "live", sortDir)}
              </th>
              <th className={thCls("roi", "text-center px-2 py-1.5")} onClick={() => handleSort("roi")}>
                ROI {sortIndicator(sortCol, "roi", sortDir)}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.key} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                <td className="px-3 py-1.5 text-gray-200">{r.label}</td>
                <td className="px-2 py-1.5 text-right text-gray-300 whitespace-nowrap">{fmtMoney(r.spend)}</td>
                <td className="px-2 py-1.5 text-right text-gray-300 whitespace-nowrap">{fmtMoney(r.revenue)}</td>
                <td className={`px-2 py-1.5 text-right whitespace-nowrap ${r.profit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(r.profit)}</td>
                <td className="px-2 py-1.5 text-center"><LiveBadge count={r.squadIds.length} /></td>
                <td className="px-2 py-1.5 text-center">
                  <RoiPill pct={r.roi} meta={{ spend: r.spend, revenue: r.revenue }} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-600 bg-gray-700/50">
              <td className="px-3 py-1.5 font-semibold text-gray-100">Total</td>
              <td className="px-2 py-1.5 text-right font-semibold text-gray-100 whitespace-nowrap">{fmtMoney(totalRow.spend)}</td>
              <td className="px-2 py-1.5 text-right font-semibold text-gray-100 whitespace-nowrap">{fmtMoney(totalRow.revenue)}</td>
              <td className={`px-2 py-1.5 text-right font-semibold whitespace-nowrap ${totalRow.profit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(totalRow.profit)}</td>
              <td className="px-2 py-1.5 text-center text-gray-500">—</td>
              <td className="px-2 py-1.5 text-center">
                <RoiPill pct={totalRow.roi} meta={{ spend: totalRow.spend, revenue: totalRow.revenue }} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function PerformanceSummaryTables({ rows, historicalRows, startDate, last30Rows, squadDetails, onFilterChange }: Props) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [providers, setProviders] = useState<FeedProvider[]>([]);
  const [selectedArticleKey, setSelectedArticleKey] = useState<string | null>(null);
  const [selectedFeedKey, setSelectedFeedKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("boilerroom_articles_v1");
      if (raw) setArticles(JSON.parse(raw) as Article[]);
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem("boilerroom_feed_providers_v1");
      if (raw) setProviders(JSON.parse(raw) as FeedProvider[]);
    } catch { /* ignore */ }
  }, []);

  // Provider color map — same sort-by-createdAt logic as CampaignCanvas.
  const providerColorMap = useMemo<Map<string, string>>(() => {
    const sorted = [...providers].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    const map = new Map<string, string>();
    sorted.forEach((p, i) => { map.set(p.id, PROVIDER_COLORS[i % PROVIDER_COLORS.length]); });
    return map;
  }, [providers]);

  const d1 = dateMinus(startDate, 1);
  const d2 = dateMinus(startDate, 2);

  // ── Article × Feed provider grouping (always uses raw rows — all articles stay visible) ──
  const articleSummary = useMemo<SummaryRow[]>(() => {
    const buckets = new Map<string, CombinedRow[]>();
    for (const row of rows) {
      const normName = norm(row.ad_squad_name);
      const articleMatch = articles.find(a => normName.includes(norm(a.slug)));
      const articleKey = articleMatch ? articleMatch.id : "__other__";
      const pKey = resolveProviderKey(row, providers);
      const key = `${articleKey}|||${pKey}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(row);
    }
    const result: SummaryRow[] = [];
    for (const [key, groupRows] of buckets) {
      const [articleKey, pKey] = key.split("|||");
      const { spend, revenue } = sumRows(groupRows);
      const article = articles.find(a => a.id === articleKey);
      const label = article ? article.slug : "Other";
      const provider = providers.find(p => p.id === pKey);
      const feedLabel = provider?.name ?? (pKey === "__unknown__" ? "Unknown" : pKey);
      const providerColor = providerColorMap.get(pKey) ?? "#6b7280";
      const pred = (r: CombinedRow) => {
        const normName = norm(r.ad_squad_name);
        const articleMatches = article
          ? normName.includes(norm(article.slug))
          : !articles.some(a => normName.includes(norm(a.slug)));
        return articleMatches && resolveProviderKey(r, providers) === pKey;
      };
      const h1 = histStats(historicalRows, d1, pred);
      const h2 = histStats(historicalRows, d2, pred);
      result.push({
        key,
        label,
        feedLabel,
        spend,
        revenue,
        profit: revenue - spend,
        roi: roiPct(spend, revenue),
        roi_1d: h1 ? roiPct(h1.spend, h1.revenue) : null,
        roi_2d: h2 ? roiPct(h2.spend, h2.revenue) : null,
        spend_1d: h1?.spend,
        revenue_1d: h1?.revenue,
        spend_2d: h2?.spend,
        revenue_2d: h2?.revenue,
        squadIds: [...new Set(groupRows.map(r => r.ad_squad_id))],
        providerColor,
      });
    }
    return result.sort((a, b) => b.spend - a.spend);
  }, [rows, historicalRows, articles, providers, providerColorMap, d1, d2]);

  // ── Rows filtered by active selection (used by feedSummary + dateSummary) ──
  // Placed after articleSummary (no cycle: articleSummary ← rows; this ← rows + articleSummary)
  const internalFilteredRows = useMemo(() => {
    if (!selectedArticleKey && !selectedFeedKey) return rows;
    let filtered = rows;
    if (selectedArticleKey) {
      const ids = new Set(
        articleSummary
          .filter(r => r.key.startsWith(selectedArticleKey + "|||"))
          .flatMap(r => r.squadIds)
      );
      filtered = filtered.filter(r => ids.has(r.ad_squad_id));
    }
    if (selectedFeedKey) {
      filtered = filtered.filter(r => resolveProviderKey(r, providers) === selectedFeedKey);
    }
    return filtered;
  }, [rows, selectedArticleKey, selectedFeedKey, articleSummary, providers]);

  const filteredLast30Rows = useMemo(() => {
    const source = last30Rows ?? rows;
    if (!selectedArticleKey && !selectedFeedKey) return source;
    let filtered = source;
    if (selectedArticleKey) {
      const ids = new Set(
        articleSummary
          .filter(r => r.key.startsWith(selectedArticleKey + "|||"))
          .flatMap(r => r.squadIds)
      );
      filtered = filtered.filter(r => ids.has(r.ad_squad_id));
    }
    if (selectedFeedKey) {
      filtered = filtered.filter(r => resolveProviderKey(r, providers) === selectedFeedKey);
    }
    return filtered;
  }, [last30Rows, rows, selectedArticleKey, selectedFeedKey, articleSummary, providers]);

  // ── Feed provider grouping (uses internalFilteredRows) ────────────────────
  const feedSummary = useMemo<SummaryRow[]>(() => {
    const buckets = new Map<string, CombinedRow[]>();
    for (const row of internalFilteredRows) {
      const key = resolveProviderKey(row, providers);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(row);
    }
    const result: SummaryRow[] = [];
    for (const [key, groupRows] of buckets) {
      const { spend, revenue } = sumRows(groupRows);
      const provider = providers.find(p => p.id === key);
      const label = provider?.name ?? (key === "__unknown__" ? "Unknown" : key);
      const providerColor = providerColorMap.get(key) ?? "#6b7280";
      const pred = (r: CombinedRow) => resolveProviderKey(r, providers) === key;
      const h1 = histStats(historicalRows, d1, pred);
      const h2 = histStats(historicalRows, d2, pred);
      result.push({
        key,
        label,
        spend,
        revenue,
        profit: revenue - spend,
        roi: roiPct(spend, revenue),
        roi_1d: h1 ? roiPct(h1.spend, h1.revenue) : null,
        roi_2d: h2 ? roiPct(h2.spend, h2.revenue) : null,
        spend_1d: h1?.spend,
        revenue_1d: h1?.revenue,
        spend_2d: h2?.spend,
        revenue_2d: h2?.revenue,
        squadIds: [...new Set(groupRows.map(r => r.ad_squad_id))],
        providerColor,
      });
    }
    return result.sort((a, b) => b.spend - a.spend);
  }, [internalFilteredRows, historicalRows, providers, providerColorMap, d1, d2]);

  // ── Date grouping (uses filteredLast30Rows) ────────────────────────────────
  const dateSummary = useMemo<SummaryRow[]>(() => {
    const source = filteredLast30Rows;
    const buckets = new Map<string, CombinedRow[]>();
    for (const row of source) {
      if (!buckets.has(row.stat_date)) buckets.set(row.stat_date, []);
      buckets.get(row.stat_date)!.push(row);
    }
    const result: SummaryRow[] = [];
    for (const [date, groupRows] of buckets) {
      const { spend, revenue } = sumRows(groupRows);
      result.push({
        key: date,
        label: fmtDate(date),
        spend,
        revenue,
        profit: revenue - spend,
        roi: roiPct(spend, revenue),
        roi_1d: null,
        roi_2d: null,
        squadIds: [...new Set(groupRows.map(r => r.ad_squad_id))],
        providerColor: "#6b7280",
      });
    }
    return result.sort((a, b) => b.key.localeCompare(a.key));
  }, [filteredLast30Rows]);

  // ── Historical totals for footer rows ────────────────────────────────────
  const histTotals = useMemo(() => {
    const h1 = histStats(historicalRows, d1, () => true);
    const h2 = histStats(historicalRows, d2, () => true);
    return {
      roi1: h1 ? roiPct(h1.spend, h1.revenue) : null,
      roi2: h2 ? roiPct(h2.spend, h2.revenue) : null,
      spend_1d: h1?.spend,
      revenue_1d: h1?.revenue,
      spend_2d: h2?.spend,
      revenue_2d: h2?.revenue,
    };
  }, [historicalRows, d1, d2]);

  // ── Total footer rows ─────────────────────────────────────────────────────
  const articleTotal = useMemo<SummaryRow>(() => {
    const spend = articleSummary.reduce((s, r) => s + r.spend, 0);
    const revenue = articleSummary.reduce((s, r) => s + r.revenue, 0);
    return {
      key: "__total__", label: "Total", spend, revenue, profit: revenue - spend,
      roi: roiPct(spend, revenue), roi_1d: histTotals.roi1, roi_2d: histTotals.roi2,
      spend_1d: histTotals.spend_1d, revenue_1d: histTotals.revenue_1d,
      spend_2d: histTotals.spend_2d, revenue_2d: histTotals.revenue_2d,
      squadIds: [...new Set(articleSummary.flatMap(r => r.squadIds))],
      providerColor: "#6b7280",
    };
  }, [articleSummary, histTotals]);

  const feedTotal = useMemo<SummaryRow>(() => {
    const spend = feedSummary.reduce((s, r) => s + r.spend, 0);
    const revenue = feedSummary.reduce((s, r) => s + r.revenue, 0);
    return {
      key: "__total__", label: "Total", spend, revenue, profit: revenue - spend,
      roi: roiPct(spend, revenue), roi_1d: histTotals.roi1, roi_2d: histTotals.roi2,
      spend_1d: histTotals.spend_1d, revenue_1d: histTotals.revenue_1d,
      spend_2d: histTotals.spend_2d, revenue_2d: histTotals.revenue_2d,
      squadIds: [...new Set(feedSummary.flatMap(r => r.squadIds))],
      providerColor: "#6b7280",
    };
  }, [feedSummary, histTotals]);

  const dateTotal = useMemo<SummaryRow>(() => {
    const spend = dateSummary.reduce((s, r) => s + r.spend, 0);
    const revenue = dateSummary.reduce((s, r) => s + r.revenue, 0);
    return {
      key: "__total__", label: "Total", spend, revenue, profit: revenue - spend,
      roi: roiPct(spend, revenue), roi_1d: null, roi_2d: null,
      squadIds: [],
      providerColor: "#6b7280",
    };
  }, [dateSummary]);

  // ── Click handlers ────────────────────────────────────────────────────────

  function handleArticleRowClick(rowKey: string) {
    const articleId = rowKey.split("|||")[0];
    const newKey = selectedArticleKey === articleId ? null : articleId;
    setSelectedArticleKey(newKey);
    setSelectedFeedKey(null);
    if (newKey) {
      const matching = articleSummary.filter(r => r.key.startsWith(newKey + "|||"));
      const squadIds = new Set(matching.flatMap(r => r.squadIds));
      onFilterChange?.({ squadIds, label: matching[0]?.label ?? "article" });
    } else {
      onFilterChange?.(null);
    }
  }

  function handleFeedRowClick(rowKey: string) {
    const newKey = selectedFeedKey === rowKey ? null : rowKey;
    setSelectedFeedKey(newKey);
    setSelectedArticleKey(null);
    if (newKey) {
      // Compute from raw rows directly — avoids stale feedSummary while article filter clears
      const squadIds = new Set(
        rows.filter(r => resolveProviderKey(r, providers) === newKey).map(r => r.ad_squad_id)
      );
      const feedRow = feedSummary.find(r => r.key === newKey);
      onFilterChange?.({ squadIds, label: feedRow?.label ?? newKey });
    } else {
      onFilterChange?.(null);
    }
  }

  // ── Filter chip label ─────────────────────────────────────────────────────
  const filterLabel = selectedArticleKey
    ? (articleSummary.find(r => r.key.startsWith(selectedArticleKey + "|||"))?.label ?? "Article")
    : selectedFeedKey
    ? (feedSummary.find(r => r.key === selectedFeedKey)?.label ?? "Feed")
    : null;

  return (
    <div className="mt-4 mb-6">
      {filterLabel && (
        <div className="flex items-center gap-2 mb-2 text-xs">
          <span className="text-gray-400">Filtered by:</span>
          <span className="flex items-center gap-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded px-2 py-0.5 font-medium">
            {filterLabel}
            <button
              onClick={() => {
                setSelectedArticleKey(null);
                setSelectedFeedKey(null);
                onFilterChange?.(null);
              }}
              className="ml-1 text-blue-400 hover:text-white leading-none"
              aria-label="Clear filter"
            >
              ×
            </button>
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr] gap-4">
        <RoiTable
          title="By Article"
          labelHeader="Article"
          rows={articleSummary}
          totalRow={articleTotal}
          showFeed
          squadDetails={squadDetails}
          onRowClick={handleArticleRowClick}
          isRowSelected={key => selectedArticleKey !== null && key.startsWith(selectedArticleKey + "|||")}
        />
        <RoiTable
          title="By Feed"
          labelHeader="Feed"
          rows={feedSummary}
          totalRow={feedTotal}
          showTotal={false}
          squadDetails={squadDetails}
          onRowClick={handleFeedRowClick}
          isRowSelected={key => key === selectedFeedKey}
        />
        <DateTable title="By Date" rows={dateSummary} totalRow={dateTotal} />
      </div>
    </div>
  );
}
