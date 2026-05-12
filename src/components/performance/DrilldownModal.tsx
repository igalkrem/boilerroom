"use client";

import { useState, useEffect } from "react";
import type { CombinedRow } from "@/app/api/reporting/combined/route";
import type { SquadDetail } from "./PerformanceTable";
import { Spinner } from "@/components/ui";

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

function derive(r: CombinedRow) {
  return {
    profit:   r.revenue_usd - r.spend_usd,
    rpr:      r.snap_results > 0 ? r.revenue_usd / r.snap_results : null,
    cpr:      r.snap_results > 0 ? r.spend_usd   / r.snap_results : null,
    rpc:      r.clicks > 0       ? r.revenue_usd / r.clicks       : null,
    cpm:      r.impressions > 0  ? (r.spend_usd / r.impressions) * 1000 : null,
    cvr:      r.swipes > 0       ? (r.funnel_clicks / r.swipes) * 100   : null,
    ctr:      r.impressions > 0  ? (r.swipes / r.impressions) * 100      : null,
  };
}

export function DrilldownModal({
  adSquadName, adSquadId, adAccountId,
  squadDetail, onSquadPatched, onClose,
}: Props) {
  const [rows, setRows]       = useState<CombinedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

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
      spend:         acc.spend         + r.spend_usd,
      revenue:       acc.revenue       + r.revenue_usd,
      impressions:   acc.impressions   + r.impressions,
      swipes:        acc.swipes        + r.swipes,
      funnel_clicks: acc.funnel_clicks + r.funnel_clicks,
      clicks:        acc.clicks        + r.clicks,
      snap_results:  acc.snap_results  + r.snap_results,
    }),
    { spend: 0, revenue: 0, impressions: 0, swipes: 0, funnel_clicks: 0, clicks: 0, snap_results: 0 }
  );
  const tDerived = {
    profit:  totals.revenue - totals.spend,
    roi:     totals.spend > 0 ? (totals.revenue / totals.spend) * 100 : null,
    rpr:     totals.snap_results > 0 ? totals.revenue / totals.snap_results : null,
    cpr:     totals.snap_results > 0 ? totals.spend   / totals.snap_results : null,
    rpc:     totals.clicks > 0       ? totals.revenue / totals.clicks       : null,
    cpm:     totals.impressions > 0  ? (totals.spend / totals.impressions) * 1000 : null,
    cvr:     totals.swipes > 0       ? (totals.funnel_clicks / totals.swipes) * 100 : null,
    ctr:     totals.impressions > 0  ? (totals.swipes / totals.impressions) * 100   : null,
  };

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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none ml-4 flex-shrink-0">×</button>
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
          {!loading && !error && rows.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                <tr>
                  {["Date","Spend","Revenue","Profit","ROI","Rev/Result","Cost/Result","RPC","CPM","CVR","CTR","Impressions","Clicks","Funnel Clicks"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {h}
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
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">{fmt$(r.spend_usd)}</td>
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">{fmt$(r.revenue_usd)}</td>
                      <td className={`px-3 py-2 whitespace-nowrap font-medium ${d.profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                        {d.profit >= 0 ? "+" : ""}{fmt$(d.profit)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap"><RoiPill pct={r.roi_pct} /></td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{d.rpr !== null ? fmt$(d.rpr) : "—"}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{d.cpr !== null ? fmt$(d.cpr) : "—"}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{d.rpc !== null ? fmt$(d.rpc) : "—"}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{d.cpm !== null ? fmt$(d.cpm) : "—"}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtPct(d.cvr)}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtPct(d.ctr)}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{fmtNum(r.impressions)}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{fmtNum(r.swipes)}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{fmtNum(r.funnel_clicks)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-200 dark:border-gray-700">
                <tr>
                  <td className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">TOTAL</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">{fmt$(totals.spend)}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">{fmt$(totals.revenue)}</td>
                  <td className={`px-3 py-2 font-semibold whitespace-nowrap ${tDerived.profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                    {tDerived.profit >= 0 ? "+" : ""}{fmt$(tDerived.profit)}
                  </td>
                  <td className="px-3 py-2"><RoiPill pct={tDerived.roi} /></td>
                  <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">{tDerived.rpr !== null ? fmt$(tDerived.rpr) : "—"}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">{tDerived.cpr !== null ? fmt$(tDerived.cpr) : "—"}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">{tDerived.rpc !== null ? fmt$(tDerived.rpc) : "—"}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">{tDerived.cpm !== null ? fmt$(tDerived.cpm) : "—"}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">{fmtPct(tDerived.cvr)}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">{fmtPct(tDerived.ctr)}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">{fmtNum(totals.impressions)}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">{fmtNum(totals.swipes)}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">{fmtNum(totals.funnel_clicks)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
