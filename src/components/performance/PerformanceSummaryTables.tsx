"use client";

import { useState, useEffect, useMemo } from "react";
import type { CombinedRow } from "@/app/api/reporting/combined/route";
import type { Article } from "@/types/article";
import type { FeedProvider } from "@/types/feed-provider";

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

function histRoi(
  histRows: CombinedRow[],
  date: string,
  pred: (r: CombinedRow) => boolean
): number | null {
  const { spend, revenue } = sumRows(histRows.filter(r => r.stat_date === date && pred(r)));
  return roiPct(spend, revenue);
}

// Shared three-tier provider resolution (module-level so both useMemos share it)
function resolveProviderKey(r: CombinedRow, providers: FeedProvider[]): string {
  if (r.feed_provider_id) return r.feed_provider_id;
  if (r.domain_name) {
    const dn = r.domain_name.toLowerCase();
    const match = providers.find(p =>
      p.domains?.some(d => {
        const base = d.baseDomain?.toLowerCase();
        return base && (dn === base || dn.endsWith("." + base));
      })
    );
    if (match) return match.id;
  }
  if (r.ad_account_id) {
    const match = providers.find(p =>
      p.snapConfig?.allowedAdAccountIds?.includes(r.ad_account_id)
    );
    if (match) return match.id;
  }
  return "__unknown__";
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
}

interface Props {
  rows: CombinedRow[];
  historicalRows: CombinedRow[];
  startDate: string;
  last30Rows?: CombinedRow[];
}

// ── ROI pill ───────────────────────────────────────────────────────────────

function RoiPill({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-500 text-xs">—</span>;
  const bg = pct >= 120 ? "bg-green-500" : pct > 105 ? "bg-orange-400" : "bg-red-500";
  return (
    <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded font-semibold text-gray-900 text-xs ${bg}`}>
      {Math.round(pct)}%
    </span>
  );
}

// ── ROI table (article / feed) ─────────────────────────────────────────────

function RoiTable({
  title,
  labelHeader,
  rows,
  totalRow,
  showFeed = false,
}: {
  title: string;
  labelHeader: string;
  rows: SummaryRow[];
  totalRow: SummaryRow;
  showFeed?: boolean;
}) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-gray-700 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="overflow-auto max-h-48">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700 bg-gray-800 sticky top-0 z-10">
              <th className="text-left px-3 py-1.5 font-medium">{labelHeader}</th>
              {showFeed && <th className="text-left px-2 py-1.5 font-medium">Feed</th>}
              <th className="text-right px-2 py-1.5 font-medium">Cost</th>
              <th className="text-right px-2 py-1.5 font-medium">Revenue</th>
              <th className="text-right px-2 py-1.5 font-medium">Profit</th>
              <th className="text-center px-2 py-1.5 font-medium whitespace-nowrap">Today ROI</th>
              <th className="text-center px-2 py-1.5 font-medium whitespace-nowrap">1D ago</th>
              <th className="text-center px-2 py-1.5 font-medium whitespace-nowrap">2D ago</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                <td className="px-3 py-1.5 text-gray-200" title={r.label}>{r.label}</td>
                {showFeed && (
                  <td className="px-2 py-1.5 text-gray-400 max-w-[80px] truncate" title={r.feedLabel}>{r.feedLabel ?? "—"}</td>
                )}
                <td className="px-2 py-1.5 text-right text-gray-300 whitespace-nowrap">{fmtMoney(r.spend)}</td>
                <td className="px-2 py-1.5 text-right text-gray-300 whitespace-nowrap">{fmtMoney(r.revenue)}</td>
                <td className={`px-2 py-1.5 text-right whitespace-nowrap ${r.profit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(r.profit)}</td>
                <td className="px-2 py-1.5 text-center"><RoiPill pct={r.roi} /></td>
                <td className="px-2 py-1.5 text-center"><RoiPill pct={r.roi_1d} /></td>
                <td className="px-2 py-1.5 text-center"><RoiPill pct={r.roi_2d} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-600 bg-gray-700/50">
              <td className="px-3 py-1.5 font-semibold text-gray-100">Total</td>
              {showFeed && <td className="px-2 py-1.5" />}
              <td className="px-2 py-1.5 text-right font-semibold text-gray-100 whitespace-nowrap">{fmtMoney(totalRow.spend)}</td>
              <td className="px-2 py-1.5 text-right font-semibold text-gray-100 whitespace-nowrap">{fmtMoney(totalRow.revenue)}</td>
              <td className={`px-2 py-1.5 text-right font-semibold whitespace-nowrap ${totalRow.profit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(totalRow.profit)}</td>
              <td className="px-2 py-1.5 text-center"><RoiPill pct={totalRow.roi} /></td>
              <td className="px-2 py-1.5 text-center"><RoiPill pct={totalRow.roi_1d} /></td>
              <td className="px-2 py-1.5 text-center"><RoiPill pct={totalRow.roi_2d} /></td>
            </tr>
          </tfoot>
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
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-gray-700 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="overflow-auto max-h-48">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700 bg-gray-800 sticky top-0 z-10">
              <th className="text-left px-3 py-1.5 font-medium">Date</th>
              <th className="text-right px-2 py-1.5 font-medium">Cost</th>
              <th className="text-right px-2 py-1.5 font-medium">Revenue</th>
              <th className="text-right px-2 py-1.5 font-medium">Profit</th>
              <th className="text-center px-2 py-1.5 font-medium">ROI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                <td className="px-3 py-1.5 text-gray-200">{r.label}</td>
                <td className="px-2 py-1.5 text-right text-gray-300 whitespace-nowrap">{fmtMoney(r.spend)}</td>
                <td className="px-2 py-1.5 text-right text-gray-300 whitespace-nowrap">{fmtMoney(r.revenue)}</td>
                <td className={`px-2 py-1.5 text-right whitespace-nowrap ${r.profit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(r.profit)}</td>
                <td className="px-2 py-1.5 text-center"><RoiPill pct={r.roi} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-600 bg-gray-700/50">
              <td className="px-3 py-1.5 font-semibold text-gray-100">Total</td>
              <td className="px-2 py-1.5 text-right font-semibold text-gray-100 whitespace-nowrap">{fmtMoney(totalRow.spend)}</td>
              <td className="px-2 py-1.5 text-right font-semibold text-gray-100 whitespace-nowrap">{fmtMoney(totalRow.revenue)}</td>
              <td className={`px-2 py-1.5 text-right font-semibold whitespace-nowrap ${totalRow.profit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(totalRow.profit)}</td>
              <td className="px-2 py-1.5 text-center"><RoiPill pct={totalRow.roi} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function PerformanceSummaryTables({ rows, historicalRows, startDate, last30Rows }: Props) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [providers, setProviders] = useState<FeedProvider[]>([]);

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

  const d1 = dateMinus(startDate, 1);
  const d2 = dateMinus(startDate, 2);

  // ── Article × Feed provider grouping ─────────────────────────────────────
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
      const pred = (r: CombinedRow) => {
        const normName = norm(r.ad_squad_name);
        const articleMatches = article
          ? normName.includes(norm(article.slug))
          : !articles.some(a => normName.includes(norm(a.slug)));
        return articleMatches && resolveProviderKey(r, providers) === pKey;
      };
      result.push({
        key,
        label,
        feedLabel,
        spend,
        revenue,
        profit: revenue - spend,
        roi: roiPct(spend, revenue),
        roi_1d: histRoi(historicalRows, d1, pred),
        roi_2d: histRoi(historicalRows, d2, pred),
      });
    }
    return result.sort((a, b) => b.spend - a.spend);
  }, [rows, historicalRows, articles, providers, d1, d2]);

  // ── Feed provider grouping ────────────────────────────────────────────────
  const feedSummary = useMemo<SummaryRow[]>(() => {
    const buckets = new Map<string, CombinedRow[]>();
    for (const row of rows) {
      const key = resolveProviderKey(row, providers);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(row);
    }
    const result: SummaryRow[] = [];
    for (const [key, groupRows] of buckets) {
      const { spend, revenue } = sumRows(groupRows);
      const provider = providers.find(p => p.id === key);
      const label = provider?.name ?? (key === "__unknown__" ? "Unknown" : key);
      const pred = (r: CombinedRow) => resolveProviderKey(r, providers) === key;
      result.push({
        key,
        label,
        spend,
        revenue,
        profit: revenue - spend,
        roi: roiPct(spend, revenue),
        roi_1d: histRoi(historicalRows, d1, pred),
        roi_2d: histRoi(historicalRows, d2, pred),
      });
    }
    return result.sort((a, b) => b.spend - a.spend);
  }, [rows, historicalRows, providers, d1, d2]);

  // ── Date grouping (uses last30Rows when available, falls back to rows) ──────
  const dateSummary = useMemo<SummaryRow[]>(() => {
    const source = last30Rows ?? rows;
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
      });
    }
    return result.sort((a, b) => b.key.localeCompare(a.key));
  }, [last30Rows, rows]);

  // ── Historical totals (shared between article and feed total rows) ─────────
  const { totalHistRoi1, totalHistRoi2 } = useMemo(() => {
    const { spend: s1, revenue: r1 } = sumRows(historicalRows.filter(r => r.stat_date === d1));
    const { spend: s2, revenue: r2 } = sumRows(historicalRows.filter(r => r.stat_date === d2));
    return { totalHistRoi1: roiPct(s1, r1), totalHistRoi2: roiPct(s2, r2) };
  }, [historicalRows, d1, d2]);

  // ── Total footer rows ─────────────────────────────────────────────────────
  const articleTotal = useMemo<SummaryRow>(() => {
    const spend = articleSummary.reduce((s, r) => s + r.spend, 0);
    const revenue = articleSummary.reduce((s, r) => s + r.revenue, 0);
    return { key: "__total__", label: "Total", spend, revenue, profit: revenue - spend, roi: roiPct(spend, revenue), roi_1d: totalHistRoi1, roi_2d: totalHistRoi2 };
  }, [articleSummary, totalHistRoi1, totalHistRoi2]);

  const feedTotal = useMemo<SummaryRow>(() => {
    const spend = feedSummary.reduce((s, r) => s + r.spend, 0);
    const revenue = feedSummary.reduce((s, r) => s + r.revenue, 0);
    return { key: "__total__", label: "Total", spend, revenue, profit: revenue - spend, roi: roiPct(spend, revenue), roi_1d: totalHistRoi1, roi_2d: totalHistRoi2 };
  }, [feedSummary, totalHistRoi1, totalHistRoi2]);

  const dateTotal = useMemo<SummaryRow>(() => {
    const spend = dateSummary.reduce((s, r) => s + r.spend, 0);
    const revenue = dateSummary.reduce((s, r) => s + r.revenue, 0);
    return { key: "__total__", label: "Total", spend, revenue, profit: revenue - spend, roi: roiPct(spend, revenue), roi_1d: null, roi_2d: null };
  }, [dateSummary]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr] gap-4 mt-4 mb-6">
      <RoiTable title="By Article" labelHeader="Article" rows={articleSummary} totalRow={articleTotal} showFeed />
      <RoiTable title="By Feed" labelHeader="Feed" rows={feedSummary} totalRow={feedTotal} />
      <DateTable title="By Date" rows={dateSummary} totalRow={dateTotal} />
    </div>
  );
}
