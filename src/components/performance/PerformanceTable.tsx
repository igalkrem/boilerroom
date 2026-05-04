"use client";

import { useState, useMemo } from "react";
import type { CombinedRow } from "@/app/api/reporting/combined/route";
import { DrilldownModal } from "./DrilldownModal";

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
  squadDetails: Map<string, SquadDetail>;
  historicalRows: CombinedRow[];
  onSquadUpdated: () => void;
}

type SortKey =
  | "spend_usd" | "revenue_usd" | "roi_pct" | "impressions" | "swipes"
  | "clicks" | "page_views" | "video_views" | "funnel_clicks" | "funnel_impressions"
  | "funnel_requests" | "ad_requests" | "matched_ad_requests"
  | "rpc" | "cpm" | "cpc" | "ctr" | "cpr" | "rpr" | "profit" | "cvr"
  | "roi_1d" | "roi_2d" | "roi_3d";

function microToDollar(micro: number) { return micro / 1_000_000; }
function dollarToMicro(dollars: number) { return Math.round(dollars * 1_000_000); }
function fmt$(n: number) { return `$${n.toFixed(2)}`; }
function fmtPct(n: number | null) { return n === null ? "—" : n.toFixed(1) + "%"; }
function fmtRoi(pct: number | null) {
  if (pct === null) return "—";
  return pct.toFixed(1) + "%";
}
function roiColor(pct: number | null) {
  if (pct === null) return "text-gray-400";
  if (pct >= 100) return "text-green-600";
  if (pct >= 50) return "text-amber-500";
  return "text-red-600";
}
function fmtNum(n: number) { return n.toLocaleString(); }

function dateOffset(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

interface AggrRow {
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
  funnel_clicks: number;
  funnel_impressions: number;
  funnel_requests: number;
  domain_name: string;
  roi_pct: number | null;
  roi_1d: number | null;
  roi_2d: number | null;
  roi_3d: number | null;
  rpc: number | null;
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  cpr: number | null;
  rpr: number | null;
  profit: number;
  cvr: number | null;
}

export function PerformanceTable({ rows, eurToUsd, visibleColumns, squadDetails, historicalRows, onSquadUpdated }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("spend_usd");
  const [sortDesc, setSortDesc] = useState(true);
  const [drilldown, setDrilldown] = useState<{ id: string; name: string; accountId: string } | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const y1 = dateOffset(-1);
  const y2 = dateOffset(-2);
  const y3 = dateOffset(-3);

  const aggregated = useMemo<AggrRow[]>(() => {
    function dailyRoi(squadId: string, date: string): number | null {
      const matching = historicalRows.filter(r => r.ad_squad_id === squadId && r.stat_date === date);
      const spend = matching.reduce((s, r) => s + r.spend_usd, 0);
      const rev = matching.reduce((s, r) => s + r.revenue_usd, 0);
      return spend > 0 ? (rev / spend) * 100 : null;
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
        ex.funnel_clicks += r.funnel_clicks;
        ex.funnel_impressions += r.funnel_impressions;
        ex.funnel_requests += r.funnel_requests;
        if (!ex.domain_name && r.domain_name) ex.domain_name = r.domain_name;
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
          funnel_clicks: r.funnel_clicks,
          funnel_impressions: r.funnel_impressions,
          funnel_requests: r.funnel_requests,
          domain_name: r.domain_name,
          roi_pct: null,
          roi_1d: null,
          roi_2d: null,
          roi_3d: null,
          rpc: null,
          cpm: null,
          cpc: null,
          ctr: null,
          cpr: null,
          rpr: null,
          profit: 0,
          cvr: null,
        });
      }
    }

    return Array.from(map.values())
      .map((a) => ({
        ...a,
        roi_pct: a.spend_usd > 0 ? (a.revenue_usd / a.spend_usd) * 100 : null,
        roi_1d: dailyRoi(a.ad_squad_id, y1),
        roi_2d: dailyRoi(a.ad_squad_id, y2),
        roi_3d: dailyRoi(a.ad_squad_id, y3),
        rpc: a.funnel_clicks >= 10 ? a.revenue_usd / a.funnel_clicks : null,
        cpm: a.impressions > 0 ? (a.spend_usd / a.impressions) * 1000 : null,
        cpc: a.swipes > 0 ? a.spend_usd / a.swipes : null,
        ctr: a.impressions > 0 ? (a.swipes / a.impressions) * 100 : null,
        cpr: a.funnel_clicks > 0 ? a.spend_usd / a.funnel_clicks : null,
        rpr: a.funnel_clicks >= 10 ? a.revenue_usd / a.funnel_clicks : null,
        profit: a.revenue_usd - a.spend_usd,
        cvr: a.swipes > 0 ? (a.funnel_clicks / a.swipes) * 100 : null,
      }))
      .sort((a, b) => {
        const av = a[sortKey] ?? -Infinity;
        const bv = b[sortKey] ?? -Infinity;
        return sortDesc ? (bv as number) - (av as number) : (av as number) - (bv as number);
      });
  }, [rows, historicalRows, sortKey, sortDesc, y1, y2, y3]);

  const filtered = useMemo(() => {
    if (!filterQuery.trim()) return aggregated;
    const q = filterQuery.toLowerCase();
    return aggregated.filter(r => r.ad_squad_name.toLowerCase().includes(q));
  }, [aggregated, filterQuery]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  function thOpt(key: SortKey, label: string) {
    if (!visibleColumns.has(key)) return null;
    const active = key === sortKey;
    return (
      <th
        key={key}
        onClick={() => toggleSort(key)}
        className={`px-3 py-2 text-left text-xs font-semibold whitespace-nowrap cursor-pointer select-none ${
          active ? "text-cyan-600" : "text-gray-500 hover:text-gray-700"
        }`}
      >
        {label}{active ? (sortDesc ? " ↓" : " ↑") : ""}
      </th>
    );
  }

  function thOptStr(key: string, label: string) {
    if (!visibleColumns.has(key)) return null;
    return (
      <th key={key} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">
        {label}
      </th>
    );
  }

  function tdOpt(key: string, content: React.ReactNode, extraClass = "") {
    if (!visibleColumns.has(key)) return null;
    return <td key={key} className={`px-3 py-2 whitespace-nowrap ${extraClass}`}>{content}</td>;
  }

  // Inline budget save
  async function saveBudget(squadId: string) {
    const dollars = parseFloat(budgetDraft);
    if (isNaN(dollars) || dollars < 20) { setInlineError("Min $20.00"); return; }
    const detail = squadDetails.get(squadId);
    if (!detail) return;
    setSavingInline(squadId + "_budget");
    setInlineError(null);
    try {
      const res = await fetch("/api/snapchat/adsquads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId: detail.ad_account_id, squadId, daily_budget_micro: dollarToMicro(dollars) }),
      });
      if (!res.ok) throw new Error("Update failed");
      onSquadUpdated();
    } catch {
      setInlineError("Save failed");
    }
    setSavingInline(null);
    setEditingBudget(null);
  }

  async function saveBid(squadId: string) {
    const dollars = parseFloat(bidDraft);
    if (isNaN(dollars) || dollars <= 0) { setInlineError("Invalid bid"); return; }
    const detail = squadDetails.get(squadId);
    if (!detail) return;
    setSavingInline(squadId + "_bid");
    setInlineError(null);
    try {
      const res = await fetch("/api/snapchat/adsquads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId: detail.ad_account_id, squadId, bid_micro: dollarToMicro(dollars) }),
      });
      if (!res.ok) throw new Error("Update failed");
      onSquadUpdated();
    } catch {
      setInlineError("Save failed");
    }
    setSavingInline(null);
    setEditingBid(null);
  }

  async function toggleStatus(squadId: string) {
    const detail = squadDetails.get(squadId);
    if (!detail) return;
    const newStatus = detail.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      await fetch("/api/snapchat/adsquads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId: detail.ad_account_id, squadId, status: newStatus }),
      });
      onSquadUpdated();
    } catch {
      console.error("status toggle failed");
    }
  }

  // Bulk actions
  async function applyBulk(field: "budget" | "bid" | "status") {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkSaving(true);
    await Promise.allSettled(
      ids.map((squadId) => {
        const detail = squadDetails.get(squadId);
        if (!detail) return Promise.resolve();
        const body: Record<string, unknown> = { adAccountId: detail.ad_account_id, squadId };
        if (field === "budget") {
          const v = parseFloat(bulkBudget);
          if (isNaN(v) || v < 20) return Promise.resolve();
          body.daily_budget_micro = dollarToMicro(v);
        } else if (field === "bid") {
          const v = parseFloat(bulkBid);
          if (isNaN(v) || v <= 0) return Promise.resolve();
          body.bid_micro = dollarToMicro(v);
        } else {
          body.status = bulkStatus;
        }
        return fetch("/api/snapchat/adsquads", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      })
    );
    setBulkSaving(false);
    setSelectedIds(new Set());
    onSquadUpdated();
  }

  const allSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.ad_squad_id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(r => r.ad_squad_id)));
    }
  }

  if (aggregated.length === 0) {
    return (
      <p className="text-sm text-gray-500 mt-8 text-center">
        No data found for the selected filters. Try refreshing or widening the date range.
      </p>
    );
  }

  return (
    <>
      <p className="text-xs text-gray-400 mb-2">
        Revenue converted at 1 EUR = ${eurToUsd.toFixed(4)} USD · Click any row for daily breakdown
      </p>

      {/* Campaign filter */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Filter campaigns…"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          className="w-64 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
        />
      </div>

      {inlineError && (
        <p className="text-xs text-red-500 mb-2">{inlineError}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-cyan-500"
                />
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">Campaign</th>
              {thOpt("spend_usd", "Spend ($)")}
              {thOpt("revenue_usd", "Revenue ($)")}
              {thOpt("roi_pct", "ROI")}
              {thOpt("roi_1d", "-1D ROI")}
              {thOpt("roi_2d", "-2D ROI")}
              {thOpt("roi_3d", "-3D ROI")}
              {thOpt("profit", "Profit")}
              {thOpt("rpc", "RPC")}
              {thOpt("ctr", "CTR")}
              {thOpt("cpm", "CPM")}
              {thOpt("cpc", "CPC")}
              {thOpt("cvr", "CVR")}
              {thOpt("cpr", "CPR")}
              {thOpt("rpr", "RPR")}
              {thOpt("impressions", "Impressions")}
              {thOpt("swipes", "Clicks")}
              {thOpt("funnel_clicks", "Funnel Clicks")}
              {thOpt("funnel_impressions", "Funnel Impressions")}
              {thOpt("funnel_requests", "Funnel Requests")}
              {thOpt("ad_requests", "Ad Requests")}
              {thOpt("matched_ad_requests", "Matched Requests")}
              {thOpt("clicks", "VZ Clicks")}
              {thOpt("page_views", "Page Views")}
              {thOpt("video_views", "Video Views")}
              {thOptStr("domain_name", "Domain")}
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">Budget</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">Bid</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((r) => {
              const detail = squadDetails.get(r.ad_squad_id);
              const isSelected = selectedIds.has(r.ad_squad_id);
              return (
                <tr
                  key={r.ad_squad_id}
                  className={`hover:bg-yellow-50 transition-colors ${isSelected ? "bg-cyan-50" : ""}`}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        const next = new Set(selectedIds);
                        if (next.has(r.ad_squad_id)) next.delete(r.ad_squad_id);
                        else next.add(r.ad_squad_id);
                        setSelectedIds(next);
                      }}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-cyan-500"
                    />
                  </td>
                  <td
                    className="px-3 py-2 font-medium text-gray-900 max-w-[220px] truncate cursor-pointer"
                    onClick={() => setDrilldown({
                      id: r.ad_squad_id,
                      name: r.ad_squad_name,
                      accountId: detail?.ad_account_id ?? "",
                    })}
                  >
                    {r.ad_squad_name}
                  </td>
                  {tdOpt("spend_usd", fmt$(r.spend_usd), "text-gray-900")}
                  {tdOpt("revenue_usd", fmt$(r.revenue_usd), "text-gray-900")}
                  {tdOpt("roi_pct", <span className={`font-semibold ${roiColor(r.roi_pct)}`}>{fmtRoi(r.roi_pct)}</span>)}
                  {tdOpt("roi_1d", <span className={`font-semibold ${roiColor(r.roi_1d)}`}>{fmtRoi(r.roi_1d)}</span>)}
                  {tdOpt("roi_2d", <span className={`font-semibold ${roiColor(r.roi_2d)}`}>{fmtRoi(r.roi_2d)}</span>)}
                  {tdOpt("roi_3d", <span className={`font-semibold ${roiColor(r.roi_3d)}`}>{fmtRoi(r.roi_3d)}</span>)}
                  {tdOpt("profit", <span className={r.profit >= 0 ? "text-green-600" : "text-red-600"}>{fmt$(r.profit)}</span>)}
                  {tdOpt("rpc", r.rpc !== null ? fmt$(r.rpc) : "—", "text-gray-700")}
                  {tdOpt("ctr", fmtPct(r.ctr), "text-gray-700")}
                  {tdOpt("cpm", r.cpm !== null ? fmt$(r.cpm) : "—", "text-gray-700")}
                  {tdOpt("cpc", r.cpc !== null ? fmt$(r.cpc) : "—", "text-gray-700")}
                  {tdOpt("cvr", fmtPct(r.cvr), "text-gray-700")}
                  {tdOpt("cpr", r.cpr !== null ? fmt$(r.cpr) : "—", "text-gray-700")}
                  {tdOpt("rpr", r.rpr !== null ? fmt$(r.rpr) : "—", "text-gray-700")}
                  {tdOpt("impressions", fmtNum(r.impressions), "text-gray-700")}
                  {tdOpt("swipes", fmtNum(r.swipes), "text-gray-700")}
                  {tdOpt("funnel_clicks", fmtNum(r.funnel_clicks), "text-gray-700")}
                  {tdOpt("funnel_impressions", fmtNum(r.funnel_impressions), "text-gray-700")}
                  {tdOpt("funnel_requests", fmtNum(r.funnel_requests), "text-gray-700")}
                  {tdOpt("ad_requests", fmtNum(r.ad_requests), "text-gray-700")}
                  {tdOpt("matched_ad_requests", fmtNum(r.matched_ad_requests), "text-gray-700")}
                  {tdOpt("clicks", fmtNum(r.clicks), "text-gray-700")}
                  {tdOpt("page_views", fmtNum(r.page_views), "text-gray-700")}
                  {tdOpt("video_views", fmtNum(r.video_views), "text-gray-700")}
                  {tdOpt("domain_name", <span className="text-xs text-gray-500">{r.domain_name || "—"}</span>)}

                  {/* Budget inline */}
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {detail ? (
                      editingBudget === r.ad_squad_id ? (
                        <input
                          autoFocus
                          type="number"
                          min={20}
                          step={0.01}
                          value={budgetDraft}
                          onChange={(e) => setBudgetDraft(e.target.value)}
                          onBlur={() => void saveBudget(r.ad_squad_id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveBudget(r.ad_squad_id);
                            if (e.key === "Escape") setEditingBudget(null);
                          }}
                          className="w-20 border border-cyan-400 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setBudgetDraft(microToDollar(detail.daily_budget_micro).toFixed(2));
                            setEditingBudget(r.ad_squad_id);
                            setInlineError(null);
                          }}
                          className="group flex items-center gap-1 text-xs text-gray-700 hover:text-cyan-600"
                        >
                          {savingInline === r.ad_squad_id + "_budget" ? "…" : fmt$(microToDollar(detail.daily_budget_micro))}
                          <svg className="w-3 h-3 text-gray-300 group-hover:text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
                          </svg>
                        </button>
                      )
                    ) : <span className="text-xs text-gray-300">…</span>}
                  </td>

                  {/* Bid inline */}
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {detail ? (
                      editingBid === r.ad_squad_id ? (
                        <input
                          autoFocus
                          type="number"
                          min={0.01}
                          step={0.01}
                          value={bidDraft}
                          onChange={(e) => setBidDraft(e.target.value)}
                          onBlur={() => void saveBid(r.ad_squad_id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveBid(r.ad_squad_id);
                            if (e.key === "Escape") setEditingBid(null);
                          }}
                          className="w-16 border border-cyan-400 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setBidDraft(microToDollar(detail.bid_micro).toFixed(2));
                            setEditingBid(r.ad_squad_id);
                            setInlineError(null);
                          }}
                          className="group flex items-center gap-1 text-xs text-gray-700 hover:text-cyan-600"
                        >
                          {savingInline === r.ad_squad_id + "_bid" ? "…" : fmt$(microToDollar(detail.bid_micro))}
                          <svg className="w-3 h-3 text-gray-300 group-hover:text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
                          </svg>
                        </button>
                      )
                    ) : <span className="text-xs text-gray-300">…</span>}
                  </td>

                  {/* Status toggle */}
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {detail ? (
                      <button
                        onClick={() => void toggleStatus(r.ad_squad_id)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          detail.status === "ACTIVE" ? "bg-green-400" : "bg-gray-200"
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          detail.status === "ACTIVE" ? "translate-x-4" : "translate-x-0.5"
                        }`} />
                      </button>
                    ) : <span className="text-xs text-gray-300">…</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 flex flex-wrap items-center gap-4">
            <span className="text-sm font-medium text-gray-700">{selectedIds.size} selected</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Budget $</span>
              <input
                type="number" min={20} step={0.01}
                placeholder="20.00"
                value={bulkBudget}
                onChange={(e) => setBulkBudget(e.target.value)}
                className="w-20 border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
              <button
                onClick={() => void applyBulk("budget")}
                disabled={bulkSaving}
                className="px-2 py-0.5 text-xs bg-cyan-500 text-white rounded hover:bg-cyan-600 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Bid $</span>
              <input
                type="number" min={0.01} step={0.01}
                placeholder="1.00"
                value={bulkBid}
                onChange={(e) => setBulkBid(e.target.value)}
                className="w-16 border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
              <button
                onClick={() => void applyBulk("bid")}
                disabled={bulkSaving}
                className="px-2 py-0.5 text-xs bg-cyan-500 text-white rounded hover:bg-cyan-600 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Status</span>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as "ACTIVE" | "PAUSED")}
                className="border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none"
              >
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
              </select>
              <button
                onClick={() => void applyBulk("status")}
                disabled={bulkSaving}
                className="px-2 py-0.5 text-xs bg-cyan-500 text-white rounded hover:bg-cyan-600 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-xs text-gray-400 hover:text-gray-600"
            >
              Clear selection
            </button>
          </div>
        )}
      </div>

      {drilldown && (
        <DrilldownModal
          adSquadName={drilldown.name}
          adSquadId={drilldown.id}
          adAccountId={drilldown.accountId}
          onClose={() => setDrilldown(null)}
        />
      )}
    </>
  );
}
