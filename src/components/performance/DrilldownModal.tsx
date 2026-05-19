"use client";

import { useState, useEffect, Fragment } from "react";
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
const DD_LABEL_MAP = Object.fromEntries(DRILLDOWN_COLUMNS.map((c) => [c.key, c.label]));

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
  isHidden?: boolean;
  onToggleHide?: () => void;
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

type DerivedRow = ReturnType<typeof derive>;

export function DrilldownModal({
  adSquadName, adSquadId, adAccountId,
  squadDetail, onSquadPatched, onClose,
  isHidden, onToggleHide,
}: Props) {
  const [rows, setRows]       = useState<CombinedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => loadDrilldownCols());
  const [colOrder, setColOrder]       = useState<string[]>(() => loadDrilldownOrder());

  const [budgetDraft, setBudgetDraft]   = useState("");
  const [bidDraft, setBidDraft]         = useState("");
  const [editingBudget, setEditingBudget] = useState(false);
  const [editingBid, setEditingBid]       = useState(false);
  const [saving, setSaving]             = useState<"budget" | "bid" | "status" | null>(null);
  const [patchError, setPatchError]     = useState<string | null>(null);

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

  // column render specs — defined here to close over totals/tDerived/tRoi
  const S = "px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap";   // standard cell
  const B = "px-3 py-2 font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap"; // bold total cell
  type ColDef = { cell: (r: CombinedRow, d: DerivedRow) => React.ReactNode; foot: React.ReactNode };
  const COL_DEFS: Record<string, ColDef> = {
    spend:               { cell: (r)    => <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">{fmt$(r.spend_usd)}</td>,                                                              foot: <td className={B}>{fmt$(totals.spend)}</td> },
    revenue:             { cell: (r)    => <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">{fmt$(r.revenue_usd)}</td>,                                                            foot: <td className={B}>{fmt$(totals.revenue)}</td> },
    profit:              { cell: (r, d) => <td className={`px-3 py-2 whitespace-nowrap font-medium ${d.profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{d.profit >= 0 ? "+" : ""}{fmt$(d.profit)}</td>, foot: <td className={`px-3 py-2 font-semibold whitespace-nowrap ${tDerived.profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{tDerived.profit >= 0 ? "+" : ""}{fmt$(tDerived.profit)}</td> },
    roi:                 { cell: (r)    => <td className="px-3 py-2 whitespace-nowrap"><RoiPill pct={r.roi_pct} /></td>,                                                                                       foot: <td className="px-3 py-2"><RoiPill pct={tRoi} /></td> },
    rpr:                 { cell: (r, d) => <td className={S}>{d.rpr !== null ? fmt$(d.rpr) : "—"}</td>,                                                                                                       foot: <td className={B}>{tDerived.rpr !== null ? fmt$(tDerived.rpr) : "—"}</td> },
    cpr:                 { cell: (r, d) => <td className={S}>{d.cpr !== null ? fmt$(d.cpr) : "—"}</td>,                                                                                                       foot: <td className={B}>{tDerived.cpr !== null ? fmt$(tDerived.cpr) : "—"}</td> },
    rpc:                 { cell: (r, d) => <td className={S}>{d.rpc !== null ? fmt$(d.rpc) : "—"}</td>,                                                                                                       foot: <td className={B}>{tDerived.rpc !== null ? fmt$(tDerived.rpc) : "—"}</td> },
    cpm:                 { cell: (r, d) => <td className={S}>{d.cpm !== null ? fmt$(d.cpm) : "—"}</td>,                                                                                                       foot: <td className={B}>{tDerived.cpm !== null ? fmt$(tDerived.cpm) : "—"}</td> },
    cpc:                 { cell: (r, d) => <td className={S}>{d.cpc !== null ? fmt$(d.cpc) : "—"}</td>,                                                                                                       foot: <td className={B}>{tDerived.cpc !== null ? fmt$(tDerived.cpc) : "—"}</td> },
    cvr:                 { cell: (r, d) => <td className={S}>{fmtPct(d.cvr)}</td>,                                                                                                                            foot: <td className={B}>{fmtPct(tDerived.cvr)}</td> },
    ctr:                 { cell: (r, d) => <td className={S}>{fmtPct(d.ctr)}</td>,                                                                                                                            foot: <td className={B}>{fmtPct(tDerived.ctr)}</td> },
    fill_rate:           { cell: (r, d) => <td className={S}>{fmtPct(d.fill_rate)}</td>,                                                                                                                      foot: <td className={B}>{fmtPct(tDerived.fill_rate)}</td> },
    impressions:         { cell: (r)    => <td className={S}>{fmtNum(r.impressions)}</td>,                                                                                                                     foot: <td className={B}>{fmtNum(totals.impressions)}</td> },
    swipes:              { cell: (r)    => <td className={S}>{fmtNum(r.swipes)}</td>,                                                                                                                          foot: <td className={B}>{fmtNum(totals.swipes)}</td> },
    clicks:              { cell: (r)    => <td className={S}>{fmtNum(r.clicks)}</td>,                                                                                                                          foot: <td className={B}>{fmtNum(totals.clicks)}</td> },
    funnel_clicks:       { cell: (r)    => <td className={S}>{fmtNum(r.funnel_clicks)}</td>,                                                                                                                   foot: <td className={B}>{fmtNum(totals.funnel_clicks)}</td> },
    funnel_impressions:  { cell: (r)    => <td className={S}>{fmtNum(r.funnel_impressions)}</td>,                                                                                                              foot: <td className={B}>{fmtNum(totals.funnel_impressions)}</td> },
    funnel_requests:     { cell: (r)    => <td className={S}>{fmtNum(r.funnel_requests)}</td>,                                                                                                                 foot: <td className={B}>{fmtNum(totals.funnel_requests)}</td> },
    feed_impressions:    { cell: (r)    => <td className={S}>{fmtNum(r.feed_impressions)}</td>,                                                                                                                foot: <td className={B}>{fmtNum(totals.feed_impressions)}</td> },
    snap_results:        { cell: (r)    => <td className={S}>{fmtNum(r.snap_results)}</td>,                                                                                                                    foot: <td className={B}>{fmtNum(totals.snap_results)}</td> },
    snap_purchase_value: { cell: (r)    => <td className={S}>{fmt$(r.snap_purchase_value_usd)}</td>,                                                                                                           foot: <td className={B}>{fmt$(totals.snap_purchase_value)}</td> },
    requests:            { cell: (r)    => <td className={S}>{fmtNum(r.requests)}</td>,                                                                                                                        foot: <td className={B}>{fmtNum(totals.requests)}</td> },
    matched_ad_requests: { cell: (r)    => <td className={S}>{fmtNum(r.matched_ad_requests)}</td>,                                                                                                             foot: <td className={B}>{fmtNum(totals.matched_ad_requests)}</td> },
    video_views:         { cell: (r)    => <td className={S}>{fmtNum(r.video_views)}</td>,                                                                                                                     foot: <td className={B}>{fmtNum(totals.video_views)}</td> },
    page_views:          { cell: (r)    => <td className={S}>{fmtNum(r.page_views)}</td>,                                                                                                                      foot: <td className={B}>{fmtNum(totals.page_views)}</td> },
    domain_name:         { cell: (r)    => <td className={S}>{r.domain_name || "—"}</td>,                                                                                                                      foot: <td className={B}>—</td> },
  };

  const visibleKeys = colOrder.filter((k) => visibleCols.has(k));

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
            {onToggleHide && (
              <button
                onClick={onToggleHide}
                title={isHidden ? "Unhide campaign" : "Ignore campaign"}
                className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {isHidden
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    : <><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></>
                  }
                </svg>
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
          </div>
        </div>

        {/* controls bar */}
        {localDetail && (
          <div className="flex flex-wrap items-center gap-4 px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
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
                  <button onClick={() => void saveBudget()} disabled={saving === "budget"} className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded">
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
                  <button onClick={() => void saveBid()} disabled={saving === "bid"} className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded">
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
          {!loading && !error && rows.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">Date</th>
                  {visibleKeys.map((k) => (
                    <th key={k} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {DD_LABEL_MAP[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {rows.map((r, i) => {
                  const d = derive(r);
                  return (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.stat_date}</td>
                      {visibleKeys.map((k) => {
                        const def = COL_DEFS[k];
                        return def ? <Fragment key={k}>{def.cell(r, d)}</Fragment> : null;
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-200 dark:border-gray-700">
                <tr>
                  <td className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">TOTAL</td>
                  {visibleKeys.map((k) => {
                    const def = COL_DEFS[k];
                    return def ? <Fragment key={k}>{def.foot}</Fragment> : null;
                  })}
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
