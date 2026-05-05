"use client";

import { useState, useMemo } from "react";
import type { CombinedRow } from "@/app/api/reporting/combined/route";
import { DrilldownModal } from "./DrilldownModal";
import { ColumnSelector } from "./ColumnSelector";

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
  squadDetails: Map<string, SquadDetail>;
  historicalRows: CombinedRow[];
  startDate: string;
  onSquadUpdated: () => void;
  onSquadPatched?: (squadId: string, patch: Partial<SquadDetail>) => void;
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
function fmtPct(n: number | null) { return n === null ? "—" : n.toFixed(2) + "%"; }
function fmtRoi(pct: number | null) { return pct === null ? "—" : pct.toFixed(2) + "%"; }
function roiColor(pct: number | null) {
  if (pct === null) return "text-gray-400";
  if (pct >= 100) return "text-green-600";
  if (pct >= 50) return "text-amber-500";
  return "text-red-600";
}
function fmtNum(n: number) { return n.toLocaleString(); }

function dateMinus(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
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

function SortArrow({ active, desc }: { active: boolean; desc: boolean }) {
  if (!active) return (
    <svg className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
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
  rows, eurToUsd, visibleColumns, onColumnsChange, squadDetails, historicalRows, startDate, onSquadUpdated, onSquadPatched,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("spend_usd");
  const [sortDesc, setSortDesc] = useState(true);
  const [drilldown, setDrilldown] = useState<{ id: string; name: string; accountId: string } | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);

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

  const y1 = dateMinus(startDate, 1);
  const y2 = dateMinus(startDate, 2);
  const y3 = dateMinus(startDate, 3);

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
        cpr: a.funnel_requests > 0 ? a.spend_usd / a.funnel_requests : null,
        rpr: a.funnel_requests > 0 ? a.revenue_usd / a.funnel_requests : null,
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
    return aggregated.filter((r) => {
      const status = squadDetails.get(r.ad_squad_id)?.status;
      if (status === "PAUSED" && r.impressions === 0) return false;
      if (!filterQuery.trim()) return true;
      return r.ad_squad_name.toLowerCase().includes(filterQuery.toLowerCase());
    });
  }, [aggregated, filterQuery, squadDetails]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  function sortableTh(colKey: SortKey, label: string) {
    if (!visibleColumns.has(colKey)) return null;
    const active = colKey === sortKey;
    return (
      <th
        key={colKey}
        onClick={() => toggleSort(colKey)}
        className={`group px-3 py-3 text-left text-xs font-semibold whitespace-nowrap cursor-pointer select-none ${
          active ? "text-blue-600" : "text-gray-600 hover:text-gray-900"
        }`}
      >
        <div className="flex items-center gap-1">
          {label}
          <SortArrow active={active} desc={sortDesc} />
        </div>
      </th>
    );
  }

  function staticTh(colKey: string, label: string) {
    if (!visibleColumns.has(colKey)) return null;
    return (
      <th key={colKey} className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
        {label}
      </th>
    );
  }

  function optTd(colKey: string, content: React.ReactNode, extraClass = "") {
    if (!visibleColumns.has(colKey)) return null;
    return <td key={colKey} className={`px-3 py-2.5 whitespace-nowrap ${extraClass}`}>{content}</td>;
  }

  async function readPatchError(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      return body.message || body.error || `HTTP ${res.status}`;
    } catch {
      return `HTTP ${res.status}`;
    }
  }

  async function saveBudget(squadId: string) {
    const dollars = parseFloat(budgetDraft);
    if (isNaN(dollars) || dollars < 20) { setInlineError("Min $20.00"); return; }
    const detail = squadDetails.get(squadId);
    if (!detail) return;
    setSavingInline(squadId + "_budget");
    setInlineError(null);
    const newMicro = dollarToMicro(dollars);
    try {
      const res = await fetch("/api/snapchat/adsquads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId: detail.ad_account_id, squadId, daily_budget_micro: newMicro }),
      });
      if (!res.ok) throw new Error(await readPatchError(res));
      onSquadPatched?.(squadId, { daily_budget_micro: newMicro });
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
    setSavingInline(squadId + "_bid");
    setInlineError(null);
    const newMicro = dollarToMicro(dollars);
    try {
      const res = await fetch("/api/snapchat/adsquads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId: detail.ad_account_id, squadId, bid_micro: newMicro }),
      });
      if (!res.ok) throw new Error(await readPatchError(res));
      onSquadPatched?.(squadId, { bid_micro: newMicro });
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
    const newStatus = detail.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const res = await fetch("/api/snapchat/adsquads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId: detail.ad_account_id, squadId, status: newStatus }),
      });
      if (!res.ok) throw new Error(await readPatchError(res));
      onSquadPatched?.(squadId, { status: newStatus });
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
      if (isNaN(v) || v < 20) { setBulkError("Budget must be at least $20.00"); return; }
    } else if (field === "bid") {
      const v = parseFloat(bulkBid);
      if (isNaN(v) || v < 0.01) { setBulkError("Bid must be at least $0.01"); return; }
    }
    setBulkSaving(true);
    let patch: Partial<SquadDetail> = {};
    if (field === "budget") patch = { daily_budget_micro: dollarToMicro(parseFloat(bulkBudget)) };
    else if (field === "bid") patch = { bid_micro: dollarToMicro(parseFloat(bulkBid)) };
    else patch = { status: bulkStatus };

    const results = await Promise.allSettled(
      ids.map(async (squadId) => {
        const detail = squadDetails.get(squadId);
        if (!detail) throw new Error("squad not loaded");
        const body: Record<string, unknown> = { adAccountId: detail.ad_account_id, squadId, ...patch };
        const res = await fetch("/api/snapchat/adsquads", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await readPatchError(res));
        return squadId;
      })
    );

    let firstErrorMsg = "";
    let failures = 0;
    for (const r of results) {
      if (r.status === "fulfilled") {
        onSquadPatched?.(r.value, patch);
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
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setShowBulkEdit(false);
    setBulkError(null);
  }

  function downloadCsv() {
    const headers = [
      "Campaign", "Spend ($)", "Revenue ($)", "ROI (%)", "Profit ($)",
      "Impressions", "Clicks", "Funnel Clicks", "CTR (%)", "CPM", "CPC",
      "CVR (%)", "CPR", "RPR", "RPC", "Page Views", "VZ Clicks",
      "Ad Requests", "Matched Requests", "Funnel Impressions", "Funnel Requests",
      "Domain", "Budget ($)", "Bid ($)", "Status", "-1D ROI", "-2D ROI", "-3D ROI",
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
        r.cpr !== null ? r.cpr.toFixed(2) : "",
        r.rpr !== null ? r.rpr.toFixed(2) : "",
        r.rpc !== null ? r.rpc.toFixed(2) : "",
        r.page_views, r.clicks, r.ad_requests, r.matched_ad_requests,
        r.funnel_impressions, r.funnel_requests,
        `"${r.domain_name || ""}"`,
        detail ? microToDollar(detail.daily_budget_micro).toFixed(2) : "",
        detail ? microToDollar(detail.bid_micro).toFixed(2) : "",
        detail ? detail.status : "",
        r.roi_1d !== null ? r.roi_1d.toFixed(2) : "",
        r.roi_2d !== null ? r.roi_2d.toFixed(2) : "",
        r.roi_3d !== null ? r.roi_3d.toFixed(2) : "",
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

      <div className="rounded-lg border border-gray-200 shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-white border-b border-gray-200">
          <div className="flex items-center gap-2">
            {hasSelection ? (
              <>
                <span className="text-sm font-medium text-gray-700 pl-1">{selectedIds.size} selected</span>
                <button
                  onClick={() => { setShowBulkEdit(v => !v); setBulkError(null); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-md border transition-colors ${
                    showBulkEdit
                      ? "bg-blue-600 text-white border-blue-600"
                      : "text-blue-600 border-blue-300 hover:bg-blue-50"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
                <button
                  disabled
                  className="flex items-center gap-1.5 px-2.5 py-1 text-sm text-gray-400 border border-gray-200 rounded-md cursor-not-allowed"
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
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md w-52 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Column selector */}
            <ColumnSelector visible={visibleColumns} onChange={onColumnsChange} />

            {/* Download CSV */}
            <button
              onClick={downloadCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              CSV
            </button>
          </div>
        </div>

        {/* Bulk edit panel */}
        {showBulkEdit && hasSelection && (
          <div className="bg-blue-50 border-b border-blue-100 px-4 py-2.5 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-blue-700">Budget $</span>
              <input
                type="number" min={20} step={0.01} placeholder="20.00"
                value={bulkBudget}
                onChange={(e) => setBulkBudget(e.target.value)}
                className="w-20 border border-blue-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
              <button
                onClick={() => void applyBulk("budget")}
                disabled={bulkSaving}
                className="px-2.5 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                Apply
              </button>
            </div>
            <div className="w-px h-4 bg-blue-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-blue-700">Bid $</span>
              <input
                type="number" min={0.01} step={0.01} placeholder="1.00"
                value={bulkBid}
                onChange={(e) => setBulkBid(e.target.value)}
                className="w-16 border border-blue-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
              <button
                onClick={() => void applyBulk("bid")}
                disabled={bulkSaving}
                className="px-2.5 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                Apply
              </button>
            </div>
            <div className="w-px h-4 bg-blue-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-blue-700">Status</span>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as "ACTIVE" | "PAUSED")}
                className="border border-blue-200 rounded px-2 py-0.5 text-xs focus:outline-none bg-white"
              >
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
              </select>
              <button
                onClick={() => void applyBulk("status")}
                disabled={bulkSaving}
                className="px-2.5 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                Apply
              </button>
            </div>
            {bulkSaving && <span className="text-xs text-blue-500 ml-1">Saving…</span>}
            {bulkError && <span className="text-xs text-red-500 ml-1">{bulkError}</span>}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {/* Master checkbox */}
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>

                {/* Name — always visible */}
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap min-w-[200px]">
                  Name
                </th>

                {/* Status toggle — always visible */}
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                  Status
                </th>

                {/* Delivery badge — always visible */}
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                  Delivery
                </th>

                {/* Budget — always visible */}
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                  Budget
                </th>

                {/* Bid — always visible */}
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                  Bid
                </th>

                {/* Metric columns */}
                {sortableTh("spend_usd", "Spend ($)")}
                {sortableTh("revenue_usd", "Revenue ($)")}
                {sortableTh("roi_pct", "ROI")}
                {sortableTh("roi_1d", "-1D ROI")}
                {sortableTh("roi_2d", "-2D ROI")}
                {sortableTh("roi_3d", "-3D ROI")}
                {sortableTh("profit", "Profit")}
                {sortableTh("rpc", "RPC")}
                {sortableTh("ctr", "CTR")}
                {sortableTh("cpm", "CPM")}
                {sortableTh("cpc", "CPC")}
                {sortableTh("cvr", "CVR")}
                {sortableTh("cpr", "CPR")}
                {sortableTh("rpr", "RPR")}
                {sortableTh("impressions", "Impressions")}
                {sortableTh("swipes", "Clicks")}
                {sortableTh("funnel_clicks", "Funnel Clicks")}
                {sortableTh("funnel_impressions", "Funnel Impressions")}
                {sortableTh("funnel_requests", "Funnel Requests")}
                {sortableTh("ad_requests", "Ad Requests")}
                {sortableTh("matched_ad_requests", "Matched Requests")}
                {sortableTh("clicks", "VZ Clicks")}
                {sortableTh("page_views", "Page Views")}
                {sortableTh("video_views", "Video Views")}
                {staticTh("domain_name", "Domain")}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map((r) => {
                const detail = squadDetails.get(r.ad_squad_id);
                const isSelected = selectedIds.has(r.ad_squad_id);
                const isActive = detail ? detail.status === "ACTIVE" : false;

                return (
                  <tr
                    key={r.ad_squad_id}
                    className={`transition-colors ${
                      isSelected ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-slate-50"
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const next = new Set(selectedIds);
                          if (next.has(r.ad_squad_id)) next.delete(r.ad_squad_id);
                          else next.add(r.ad_squad_id);
                          setSelectedIds(next);
                        }}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>

                    {/* Campaign name */}
                    <td className="px-3 py-2.5 max-w-[260px]">
                      <button
                        onClick={() => setDrilldown({
                          id: r.ad_squad_id,
                          name: r.ad_squad_name,
                          accountId: detail?.ad_account_id ?? "",
                        })}
                        className="text-left text-sm font-medium text-gray-900 hover:text-blue-600 hover:underline truncate block w-full"
                        title={r.ad_squad_name}
                      >
                        {r.ad_squad_name}
                      </button>
                    </td>

                    {/* Status toggle */}
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {detail ? (
                        <button
                          onClick={() => void toggleStatus(r.ad_squad_id)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            isActive ? "bg-green-500" : "bg-gray-300"
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
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
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
                            type="number" min={20} step={0.01}
                            value={budgetDraft}
                            onChange={(e) => setBudgetDraft(e.target.value)}
                            onBlur={() => void saveBudget(r.ad_squad_id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveBudget(r.ad_squad_id);
                              if (e.key === "Escape") setEditingBudget(null);
                            }}
                            className="w-20 border border-blue-400 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        ) : (
                          <button
                            onClick={() => {
                              setBudgetDraft(microToDollar(detail.daily_budget_micro).toFixed(2));
                              setEditingBudget(r.ad_squad_id);
                              setInlineError(null);
                            }}
                            className="group flex items-center gap-1 text-xs text-gray-700 hover:text-blue-600"
                          >
                            {savingInline === r.ad_squad_id + "_budget" ? "…" : fmt$(microToDollar(detail.daily_budget_micro))}
                            <svg className="w-3 h-3 text-gray-300 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                            className="w-16 border border-blue-400 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        ) : (
                          <button
                            onClick={() => {
                              setBidDraft(microToDollar(detail.bid_micro).toFixed(2));
                              setEditingBid(r.ad_squad_id);
                              setInlineError(null);
                            }}
                            className="group flex items-center gap-1 text-xs text-gray-700 hover:text-blue-600"
                          >
                            {savingInline === r.ad_squad_id + "_bid" ? "…" : fmt$(microToDollar(detail.bid_micro))}
                            <svg className="w-3 h-3 text-gray-300 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
                            </svg>
                          </button>
                        )
                      ) : <span className="text-xs text-gray-300">…</span>}
                    </td>

                    {/* Metric cells */}
                    {optTd("spend_usd", fmt$(r.spend_usd), "text-gray-900 font-medium")}
                    {optTd("revenue_usd", fmt$(r.revenue_usd), "text-gray-900")}
                    {optTd("roi_pct", <span className={`font-semibold ${roiColor(r.roi_pct)}`}>{fmtRoi(r.roi_pct)}</span>)}
                    {optTd("roi_1d", <span className={`font-semibold ${roiColor(r.roi_1d)}`}>{fmtRoi(r.roi_1d)}</span>)}
                    {optTd("roi_2d", <span className={`font-semibold ${roiColor(r.roi_2d)}`}>{fmtRoi(r.roi_2d)}</span>)}
                    {optTd("roi_3d", <span className={`font-semibold ${roiColor(r.roi_3d)}`}>{fmtRoi(r.roi_3d)}</span>)}
                    {optTd("profit", <span className={r.profit >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>{fmt$(r.profit)}</span>)}
                    {optTd("rpc", r.rpc !== null ? fmt$(r.rpc) : "—", "text-gray-700")}
                    {optTd("ctr", fmtPct(r.ctr), "text-gray-700")}
                    {optTd("cpm", r.cpm !== null ? fmt$(r.cpm) : "—", "text-gray-700")}
                    {optTd("cpc", r.cpc !== null ? fmt$(r.cpc) : "—", "text-gray-700")}
                    {optTd("cvr", fmtPct(r.cvr), "text-gray-700")}
                    {optTd("cpr", r.cpr !== null ? fmt$(r.cpr) : "—", "text-gray-700")}
                    {optTd("rpr", r.rpr !== null ? fmt$(r.rpr) : "—", "text-gray-700")}
                    {optTd("impressions", fmtNum(r.impressions), "text-gray-700")}
                    {optTd("swipes", fmtNum(r.swipes), "text-gray-700")}
                    {optTd("funnel_clicks", fmtNum(r.funnel_clicks), "text-gray-700")}
                    {optTd("funnel_impressions", fmtNum(r.funnel_impressions), "text-gray-700")}
                    {optTd("funnel_requests", fmtNum(r.funnel_requests), "text-gray-700")}
                    {optTd("ad_requests", fmtNum(r.ad_requests), "text-gray-700")}
                    {optTd("matched_ad_requests", fmtNum(r.matched_ad_requests), "text-gray-700")}
                    {optTd("clicks", fmtNum(r.clicks), "text-gray-700")}
                    {optTd("page_views", fmtNum(r.page_views), "text-gray-700")}
                    {optTd("video_views", fmtNum(r.video_views), "text-gray-700")}
                    {optTd("domain_name", <span className="text-xs text-gray-500">{r.domain_name || "—"}</span>)}
                  </tr>
                );
              })}
            </tbody>
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
          onClose={() => setDrilldown(null)}
        />
      )}
    </>
  );
}
