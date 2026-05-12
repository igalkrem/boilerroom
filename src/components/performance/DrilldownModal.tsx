"use client";

import { useState, useEffect } from "react";
import type { CombinedRow } from "@/app/api/reporting/combined/route";
import type { SquadDetail } from "./PerformanceTable";
import { Spinner } from "@/components/ui";
import { ColumnSelector } from "./ColumnSelector";

const DRILLDOWN_COLUMNS = [
  { key: "spend",                  label: "Spend" },
  { key: "revenue",                label: "Revenue" },
  { key: "profit",                 label: "Profit" },
  { key: "roi",                    label: "ROI" },
  { key: "rpr",                    label: "Rev/Result" },
  { key: "cpr",                    label: "Cost/Result" },
  { key: "rpc",                    label: "RPC" },
  { key: "cpm",                    label: "CPM" },
  { key: "cpc",                    label: "CPC" },
  { key: "cvr",                    label: "CVR" },
  { key: "ctr",                    label: "CTR" },
  { key: "fill_rate",              label: "Fill Rate" },
  { key: "impressions",            label: "Impressions" },
  { key: "swipes",                 label: "Clicks" },
  { key: "clicks",                 label: "Ad Clicks" },
  { key: "funnel_clicks",          label: "Funnel Clicks" },
  { key: "funnel_impressions",     label: "Funnel Impr." },
  { key: "funnel_requests",        label: "Funnel Requests" },
  { key: "feed_impressions",       label: "Feed Impr." },
  { key: "snap_results",           label: "Results" },
  { key: "snap_purchase_value",    label: "Purchase Value" },
  { key: "requests",               label: "Requests" },
  { key: "matched_ad_requests",    label: "Matched Requests" },
  { key: "video_views",            label: "Video Views" },
  { key: "page_views",             label: "Page Views" },
  { key: "domain_name",            label: "Domain" },
];
const DD_LS_KEY = "br_drilldown_cols";
const DD_LS_ORDER_KEY = "br_drilldown_cols_order";
const DD_ALL_KEYS = DRILLDOWN_COLUMNS.map((c) => c.key);
const DD_DEFAULT_VISIBLE = new Set<string>(DD_ALL_KEYS);

function loadDrilldownCols(): Set<string> {
  if (typeof window === "undefined") return new Set(DD_DEFAULT_VISIBLE);
  try {
    const raw = localStorage.getItem(DD_LS_KEY);
    if (!raw) return new Set(DD_DEFAULT_VISIBLE);
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set(DD_DEFAULT_VISIBLE);
    return new Set(arr as string[]);
  } catch { return new Set(DD_DEFAULT_VISIBLE); }
}

function loadDrilldownOrder(): string[] {
  if (typeof window === "undefined") return DD_ALL_KEYS;
  try {
    const raw = localStorage.getItem(DD_LS_ORDER_KEY);
    if (!raw) return DD_ALL_KEYS;
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return DD_ALL_KEYS;
    const known = new Set(DD_ALL_KEYS);
    const saved = (arr as string[]).filter((k) => known.has(k));
    const missing = DD_ALL_KEYS.filter((k) => !saved.includes(k));
    return [...saved, ...missing];
  } catch { return DD_ALL_KEYS; }
}

interface Props {
  adSquadName: string;
  adSquadId: string;
  adAccountId: string;
  squadDetail?: SquadDetail;
  onSquadPatched?: (patch: Partial<SquadDetail>) => void;
  onClose: () => void;
}

function fmt$(n: number) { return `$${n.toFixed(2)}`; }
function fmtPct(n: number | null) { return n === null ? "—" : n.toFixed(2) + "%"; }
function fmtNum(n: number) { return n.toLocaleString(); }
function microToDollar(micro: number) { return micro / 1_000_000; }
function dollarToMicro(dollars: number) { return Math.round(dollars * 1_000_000); }

function RoiPill({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-400">—</span>;
  const bg = pct >= 120 ? "bg-green-500" : pct > 105 ? "bg-orange-400" : "bg-red-500";
  return (
    <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded font-semibold text-gray-900 text-xs ${bg}`}>
      {Math.round(pct)}%
    </span>
  );
}

function derive(r: { spend_usd: number; revenue_usd: number; impressions: number; swipes: number; funnel_clicks: number; funnel_impressions: number; clicks: number; snap_results: number }) {
  return {
    profit:    r.revenue_usd - r.spend_usd,
    rpr:       r.snap_results > 0 ? r.revenue_usd / r.snap_results : null,
    cpr:       r.snap_results > 0 ? r.spend_usd   / r.snap_results : null,
    rpc:       r.clicks > 0       ? r.revenue_usd / r.clicks       : null,
    cpm:       r.impressions > 0  ? (r.spend_usd / r.impressions) * 1000 : null,
    cpc:       r.clicks > 0       ? r.spend_usd / r.clicks                : null,
    cvr:       r.swipes > 0       ? (r.funnel_clicks / r.swipes) * 100   : null,
    ctr:       r.impressions > 0  ? (r.swipes / r.impressions) * 100      : null,
    fill_rate: r.swipes > 0       ? (r.funnel_impressions / r.swipes) * 100 : null,
  };
}

export function DrilldownModal({
  adSquadName, adSquadId, adAccountId,
  squadDetail, onSquadPatched, onClose,
}: Props) {
  const [rows, setRows]       = useState<CombinedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => loadDrilldownCols());
  const [colOrder, setColOrder]       = useState<string[]>(() => loadDrilldownOrder());

  // inline edit state
  const [budgetDraft, setBudgetDraft]   = useState("");
  const [bidDraft, setBidDraft]         = useState("");
  const [editingBudget, setEditingBudget] = useState(false);
  const [editingBid, setEditingBid]       = useState(false);
  const [saving, setSaving]             = useState<"budget" | "bid" | "status" | null>(null);
  const [patchError, setPatchError]     = useState<string | null>(null);

  // local copy of detail so changes are reflected without prop threading
  const [localDetail, setLocalDetail]   = useState<SquadDetail | undefined>(squadDetail);
  useEffect(() => { setLocalDetail(squadDetail); }, [squadDetail]);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/reporting/drilldown?adSquadId=${encodeURIComponent(adSquadId)}&adAccountId=${encodeURIComponent(adAccountId)}`)
      .then((r) => r.json())
      .then((d: { rows?: CombinedRow[] }) => {
        setRows((d.rows ?? []).sort((a, b) => b.stat_date.localeCompare(a.stat_date)));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [adSquadId, adAccountId]);

  async function readError(res: Response) {
    try {
      const b = (await res.json()) as { error?: string; message?: string };
      return b.message || b.error || `HTTP ${res.status}`;
    } catch { return `HTTP ${res.status}`; }
  }

  async function saveBudget() {
    const dollars = parseFloat(budgetDraft);
    if (isNaN(dollars) || dollars <= 0) { setPatchError("Budget must be > $0"); return; }
    if (!localDetail) return;
    setSaving("budget"); setPatchError(null);
    const micro = dollarToMicro(dollars);
    const res = await fetch("/api/snapchat/adsquads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adAccountId, squadId: adSquadId, daily_budget_micro: micro }),
    });
    setSaving(null);
    if (!res.ok) { setPatchError(await readError(res)); return; }
    const patch = { daily_budget_micro: micro };
    setLocalDetail((d) => d ? { ...d, ...patch } : d);
    onSquadPatched?.(patch);
    setEditingBudget(false);
  }

  async function saveBid() {
    const dollars = parseFloat(bidDraft);
    if (isNaN(dollars) || dollars < 0.01) { setPatchError("Min bid $0.01"); return; }
    if (!localDetail) return;
    setSaving("bid"); setPatchError(null);
    const micro = dollarToMicro(dollars);
    const res = await fetch("/api/snapchat/adsquads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adAccountId, squadId: adSquadId, bid_micro: micro }),
    });
    setSaving(null);
    if (!res.ok) { setPatchError(await readError(res)); return; }
    const patch = { bid_micro: micro };
    setLocalDetail((d) => d ? { ...d, ...patch } : d);
    onSquadPatched?.(patch);
    setEditingBid(false);
  }

  async function toggleStatus() {
    if (!localDetail) return;
    const newStatus = localDetail.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setSaving("status"); setPatchError(null);
    const res = await fetch("/api/snapchat/adsquads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adAccountId, squadId: adSquadId, status: newStatus }),
    });
    setSaving(null);
    if (!res.ok) { setPatchError(await readError(res)); return; }
    const patch = { status: newStatus } as Partial<SquadDetail>;
    setLocalDetail((d) => d ? { ...d, ...patch } : d);
    onSquadPatched?.(patch);
  }

  // totals
  const totals = rows.reduce(
    (acc, r) => ({
      spend:                acc.spend                + r.spend_usd,
      revenue:              acc.revenue              + r.revenue_usd,
      impressions:          acc.impressions          + r.impressions,
      swipes:               acc.swipes               + r.swipes,
      funnel_clicks:        acc.funnel_clicks        + r.funnel_clicks,
      funnel_impressions:   acc.funnel_impressions   + r.funnel_impressions,
      funnel_requests:      acc.funnel_requests      + r.funnel_requests,
      feed_impressions:     acc.feed_impressions     + r.feed_impressions,
      clicks:               acc.clicks               + r.clicks,
      snap_results:         acc.snap_results         + r.snap_results,
      snap_purchase_value:  acc.snap_purchase_value  + r.snap_purchase_value_usd,
      requests:             acc.requests             + r.requests,
      matched_ad_requests:  acc.matched_ad_requests  + r.matched_ad_requests,
      video_views:          acc.video_views          + r.video_views,
      page_views:           acc.page_views           + r.page_views,
    }),
    {
      spend: 0, revenue: 0, impressions: 0, swipes: 0,
      funnel_clicks: 0, funnel_impressions: 0, funnel_requests: 0, feed_impressions: 0,
      clicks: 0, snap_results: 0, snap_purchase_value: 0,
      requests: 0, matched_ad_requests: 0, video_views: 0, page_views: 0,
    }
  );
  const tDerived = derive({
    spend_usd: totals.spend, revenue_usd: totals.revenue,
    impressions: totals.impressions, swipes: totals.swipes,
    funnel_clicks: totals.funnel_clicks, funnel_impressions: totals.funnel_impressions,
    clicks: totals.clicks, snap_results: totals.snap_results,
  });
  const tRoi = totals.spend > 0 ? (totals.revenue / totals.spend) * 100 : null;

  const isActive = localDetail?.status === "ACTIVE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">

        {/* header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight">{adSquadName}</h2>
            <p className="text-xs text-gray-500 mt-0.5">All available dates</p>
          </div>
          <div className="flex items-center gap-3 ml-4 flex-shrink-0">
            <ColumnSelector
              visible={visibleCols}
              order={colOrder}
              onChange={setVisibleCols}
              onOrderChange={setColOrder}
              columns={DRILLDOWN_COLUMNS}
              storageKey={DD_LS_KEY}
              orderStorageKey={DD_LS_ORDER_KEY}
            />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
          </div>
        </div>

        {/* controls bar */}
        {localDetail && (
          <div className="flex flex-wrap items-center gap-4 px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            {/* status toggle */}
            <button
              onClick={() => void toggleStatus()}
              disabled={saving === "status"}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/60"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {saving === "status" ? "…" : isActive ? "● Active" : "○ Paused"}
            </button>

            {/* budget */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Budget:</span>
              {editingBudget ? (
                <>
                  <input
                    type="number" step="0.01" min="0.01"
                    value={budgetDraft}
                    onChange={(e) => setBudgetDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void saveBudget(); if (e.key === "Escape") setEditingBudget(false); }}
                    autoFocus
                    className="w-20 px-1.5 py-0.5 text-xs rounded border border-blue-400 dark:border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  />
                  <button
                    onClick={() => void saveBudget()}
                    disabled={saving === "budget"}
                    className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
                  >
                    {saving === "budget" ? "…" : "Save"}
                  </button>
                  <button onClick={() => setEditingBudget(false)} className="px-1.5 py-0.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">✕</button>
                </>
              ) : (
                <button
                  onClick={() => { setBudgetDraft(microToDollar(localDetail.daily_budget_micro).toFixed(2)); setEditingBudget(true); setPatchError(null); }}
                  className="text-xs font-medium text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 underline decoration-dotted"
                >
                  {fmt$(microToDollar(localDetail.daily_budget_micro))}
                </button>
              )}
            </div>

            {/* bid */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Bid:</span>
              {editingBid ? (
                <>
                  <input
                    type="number" step="0.01" min="0.01"
                    value={bidDraft}
                    onChange={(e) => setBidDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void saveBid(); if (e.key === "Escape") setEditingBid(false); }}
                    autoFocus
                    className="w-20 px-1.5 py-0.5 text-xs rounded border border-blue-400 dark:border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  />
                  <button
                    onClick={() => void saveBid()}
                    disabled={saving === "bid"}
                    className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
                  >
                    {saving === "bid" ? "…" : "Save"}
                  </button>
                  <button onClick={() => setEditingBid(false)} className="px-1.5 py-0.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">✕</button>
                </>
              ) : (
                <button
                  onClick={() => { setBidDraft(microToDollar(localDetail.bid_micro).toFixed(2)); setEditingBid(true); setPatchError(null); }}
                  className="text-xs font-medium text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 underline decoration-dotted"
                >
                  {fmt$(microToDollar(localDetail.bid_micro))}
                </button>
              )}
            </div>

            {patchError && <p className="text-xs text-red-500 ml-2">{patchError}</p>}
          </div>
        )}

        {/* table */}
        <div className="overflow-auto flex-1">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400 text-sm">
              <Spinner /> Loading…
            </div>
          )}
          {!loading && error && (
            <p className="text-center text-sm text-red-500 py-12">Failed to load data.</p>
          )}
          {!loading && !error && rows.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-12">No data available for this campaign.</p>
          )}
          {!loading && !error && rows.length > 0 && (() => {
            const col = (key: string) => visibleCols.has(key);
            const th = "px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap";
            const td = "px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap";
            const tds = "px-3 py-2 font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap";
            return (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                  <tr>
                    <th className={th}>Date</th>
                    {col("spend")               && <th className={th}>Spend</th>}
                    {col("revenue")             && <th className={th}>Revenue</th>}
                    {col("profit")              && <th className={th}>Profit</th>}
                    {col("roi")                 && <th className={th}>ROI</th>}
                    {col("rpr")                 && <th className={th}>Rev/Result</th>}
                    {col("cpr")                 && <th className={th}>Cost/Result</th>}
                    {col("rpc")                 && <th className={th}>RPC</th>}
                    {col("cpm")                 && <th className={th}>CPM</th>}
                    {col("cpc")                 && <th className={th}>CPC</th>}
                    {col("cvr")                 && <th className={th}>CVR</th>}
                    {col("ctr")                 && <th className={th}>CTR</th>}
                    {col("fill_rate")           && <th className={th}>Fill Rate</th>}
                    {col("impressions")         && <th className={th}>Impressions</th>}
                    {col("swipes")              && <th className={th}>Clicks</th>}
                    {col("clicks")              && <th className={th}>Ad Clicks</th>}
                    {col("funnel_clicks")       && <th className={th}>Funnel Clicks</th>}
                    {col("funnel_impressions")  && <th className={th}>Funnel Impr.</th>}
                    {col("funnel_requests")     && <th className={th}>Funnel Requests</th>}
                    {col("feed_impressions")    && <th className={th}>Feed Impr.</th>}
                    {col("snap_results")        && <th className={th}>Results</th>}
                    {col("snap_purchase_value") && <th className={th}>Purchase Value</th>}
                    {col("requests")            && <th className={th}>Requests</th>}
                    {col("matched_ad_requests") && <th className={th}>Matched Requests</th>}
                    {col("video_views")         && <th className={th}>Video Views</th>}
                    {col("page_views")          && <th className={th}>Page Views</th>}
                    {col("domain_name")         && <th className={th}>Domain</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {rows.map((r, i) => {
                    const d = derive(r);
                    return (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.stat_date}</td>
                        {col("spend")               && <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">{fmt$(r.spend_usd)}</td>}
                        {col("revenue")             && <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">{fmt$(r.revenue_usd)}</td>}
                        {col("profit")              && <td className={`px-3 py-2 whitespace-nowrap font-medium ${d.profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{d.profit >= 0 ? "+" : ""}{fmt$(d.profit)}</td>}
                        {col("roi")                 && <td className="px-3 py-2 whitespace-nowrap"><RoiPill pct={r.roi_pct} /></td>}
                        {col("rpr")                 && <td className={td}>{d.rpr !== null ? fmt$(d.rpr) : "—"}</td>}
                        {col("cpr")                 && <td className={td}>{d.cpr !== null ? fmt$(d.cpr) : "—"}</td>}
                        {col("rpc")                 && <td className={td}>{d.rpc !== null ? fmt$(d.rpc) : "—"}</td>}
                        {col("cpm")                 && <td className={td}>{d.cpm !== null ? fmt$(d.cpm) : "—"}</td>}
                        {col("cpc")                 && <td className={td}>{d.cpc !== null ? fmt$(d.cpc) : "—"}</td>}
                        {col("cvr")                 && <td className={td}>{fmtPct(d.cvr)}</td>}
                        {col("ctr")                 && <td className={td}>{fmtPct(d.ctr)}</td>}
                        {col("fill_rate")           && <td className={td}>{fmtPct(d.fill_rate)}</td>}
                        {col("impressions")         && <td className={td}>{fmtNum(r.impressions)}</td>}
                        {col("swipes")              && <td className={td}>{fmtNum(r.swipes)}</td>}
                        {col("clicks")              && <td className={td}>{fmtNum(r.clicks)}</td>}
                        {col("funnel_clicks")       && <td className={td}>{fmtNum(r.funnel_clicks)}</td>}
                        {col("funnel_impressions")  && <td className={td}>{fmtNum(r.funnel_impressions)}</td>}
                        {col("funnel_requests")     && <td className={td}>{fmtNum(r.funnel_requests)}</td>}
                        {col("feed_impressions")    && <td className={td}>{fmtNum(r.feed_impressions)}</td>}
                        {col("snap_results")        && <td className={td}>{fmtNum(r.snap_results)}</td>}
                        {col("snap_purchase_value") && <td className={td}>{fmt$(r.snap_purchase_value_usd)}</td>}
                        {col("requests")            && <td className={td}>{fmtNum(r.requests)}</td>}
                        {col("matched_ad_requests") && <td className={td}>{fmtNum(r.matched_ad_requests)}</td>}
                        {col("video_views")         && <td className={td}>{fmtNum(r.video_views)}</td>}
                        {col("page_views")          && <td className={td}>{fmtNum(r.page_views)}</td>}
                        {col("domain_name")         && <td className={td}>{r.domain_name || "—"}</td>}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-200 dark:border-gray-700">
                  <tr>
                    <td className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">TOTAL</td>
                    {col("spend")               && <td className={tds}>{fmt$(totals.spend)}</td>}
                    {col("revenue")             && <td className={tds}>{fmt$(totals.revenue)}</td>}
                    {col("profit")              && <td className={`px-3 py-2 font-semibold whitespace-nowrap ${tDerived.profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{tDerived.profit >= 0 ? "+" : ""}{fmt$(tDerived.profit)}</td>}
                    {col("roi")                 && <td className="px-3 py-2"><RoiPill pct={tRoi} /></td>}
                    {col("rpr")                 && <td className={tds}>{tDerived.rpr !== null ? fmt$(tDerived.rpr) : "—"}</td>}
                    {col("cpr")                 && <td className={tds}>{tDerived.cpr !== null ? fmt$(tDerived.cpr) : "—"}</td>}
                    {col("rpc")                 && <td className={tds}>{tDerived.rpc !== null ? fmt$(tDerived.rpc) : "—"}</td>}
                    {col("cpm")                 && <td className={tds}>{tDerived.cpm !== null ? fmt$(tDerived.cpm) : "—"}</td>}
                    {col("cpc")                 && <td className={tds}>{tDerived.cpc !== null ? fmt$(tDerived.cpc) : "—"}</td>}
                    {col("cvr")                 && <td className={tds}>{fmtPct(tDerived.cvr)}</td>}
                    {col("ctr")                 && <td className={tds}>{fmtPct(tDerived.ctr)}</td>}
                    {col("fill_rate")           && <td className={tds}>{fmtPct(tDerived.fill_rate)}</td>}
                    {col("impressions")         && <td className={tds}>{fmtNum(totals.impressions)}</td>}
                    {col("swipes")              && <td className={tds}>{fmtNum(totals.swipes)}</td>}
                    {col("clicks")              && <td className={tds}>{fmtNum(totals.clicks)}</td>}
                    {col("funnel_clicks")       && <td className={tds}>{fmtNum(totals.funnel_clicks)}</td>}
                    {col("funnel_impressions")  && <td className={tds}>{fmtNum(totals.funnel_impressions)}</td>}
                    {col("funnel_requests")     && <td className={tds}>{fmtNum(totals.funnel_requests)}</td>}
                    {col("feed_impressions")    && <td className={tds}>{fmtNum(totals.feed_impressions)}</td>}
                    {col("snap_results")        && <td className={tds}>{fmtNum(totals.snap_results)}</td>}
                    {col("snap_purchase_value") && <td className={tds}>{fmt$(totals.snap_purchase_value)}</td>}
                    {col("requests")            && <td className={tds}>{fmtNum(totals.requests)}</td>}
                    {col("matched_ad_requests") && <td className={tds}>{fmtNum(totals.matched_ad_requests)}</td>}
                    {col("video_views")         && <td className={tds}>{fmtNum(totals.video_views)}</td>}
                    {col("page_views")          && <td className={tds}>{fmtNum(totals.page_views)}</td>}
                    {col("domain_name")         && <td className={tds}>—</td>}
                  </tr>
                </tfoot>
              </table>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
