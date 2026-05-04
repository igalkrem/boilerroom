"use client";

import { useState, useMemo } from "react";
import type { CombinedRow } from "@/app/api/reporting/combined/route";
import { DrilldownModal } from "./DrilldownModal";
import { BudgetBidControls } from "./BudgetBidControls";
import { countryCodeToName } from "@/lib/country-map";

export interface SquadDetail {
  daily_budget_micro: number;
  bid_micro: number;
  ad_account_id: string;
}

interface Props {
  rows: CombinedRow[];
  eurToUsd: number;
  visibleColumns: Set<string>;
  squadDetails: Map<string, SquadDetail>;
  onControlsUpdated: () => void;
}

type SortKey = "spend_usd" | "revenue_usd" | "roi_pct" | "impressions" | "swipes" | "clicks" | "page_views" | "video_views";

function fmt$(n: number) { return `$${n.toFixed(2)}`; }
function fmtRoi(pct: number | null) {
  if (pct === null) return "—";
  return pct.toFixed(1) + "%";
}
function roiColor(pct: number | null) {
  if (pct === null) return "text-gray-400";
  return pct >= 100 ? "text-green-600" : "text-red-600";
}
function fmtNum(n: number) { return n.toLocaleString(); }

interface AggrRow {
  ad_squad_id: string;
  ad_squad_name: string;
  country_code: string;
  spend_usd: number;
  revenue_usd: number;
  revenue_eur: number;
  roi_pct: number | null;
  impressions: number;
  swipes: number;
  clicks: number;
  page_views: number;
  video_views: number;
  detail: CombinedRow[];
}

export function PerformanceTable({ rows, eurToUsd, visibleColumns, squadDetails, onControlsUpdated }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("spend_usd");
  const [sortDesc, setSortDesc] = useState(true);
  const [drilldown, setDrilldown] = useState<AggrRow | null>(null);
  const [openControlsId, setOpenControlsId] = useState<string | null>(null);

  const aggregated = useMemo<AggrRow[]>(() => {
    const map = new Map<string, AggrRow>();
    for (const r of rows) {
      const key = `${r.ad_squad_id}||${r.country_code}`;
      const ex = map.get(key);
      if (ex) {
        ex.spend_usd += r.spend_usd;
        ex.revenue_usd += r.revenue_usd;
        ex.revenue_eur += r.revenue_eur;
        ex.impressions += r.impressions;
        ex.swipes += r.swipes;
        ex.clicks += r.clicks;
        ex.page_views += r.page_views;
        ex.video_views += r.video_views;
        ex.detail.push(r);
      } else {
        map.set(key, {
          ad_squad_id: r.ad_squad_id,
          ad_squad_name: r.ad_squad_name,
          country_code: r.country_code,
          spend_usd: r.spend_usd,
          revenue_usd: r.revenue_usd,
          revenue_eur: r.revenue_eur,
          roi_pct: null,
          impressions: r.impressions,
          swipes: r.swipes,
          clicks: r.clicks,
          page_views: r.page_views,
          video_views: r.video_views,
          detail: [r],
        });
      }
    }
    return Array.from(map.values())
      .map((a) => ({
        ...a,
        roi_pct: a.spend_usd > 0 ? (a.revenue_usd / a.spend_usd) * 100 : null,
      }))
      .sort((a, b) => {
        const av = sortKey === "roi_pct" ? (a.roi_pct ?? -Infinity) : a[sortKey];
        const bv = sortKey === "roi_pct" ? (b.roi_pct ?? -Infinity) : b[sortKey];
        return sortDesc ? (bv as number) - (av as number) : (av as number) - (bv as number);
      });
  }, [rows, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  function thOptional(key: SortKey, label: string, tooltip?: string) {
    if (!visibleColumns.has(key)) return null;
    const active = key === sortKey;
    return (
      <th
        key={key}
        title={tooltip}
        onClick={() => toggleSort(key)}
        className={`px-4 py-2 text-left text-xs font-semibold whitespace-nowrap cursor-pointer select-none ${
          active ? "text-cyan-600" : "text-gray-500 hover:text-gray-700"
        }`}
      >
        {label}{active ? (sortDesc ? " ↓" : " ↑") : ""}
      </th>
    );
  }

  // Total visible optional columns + 3 fixed (Ad Squad, Country, Controls)
  const colSpan = visibleColumns.size + 3;

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
      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Ad Squad</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Country</th>
              {thOptional("spend_usd", "Spend ($)")}
              {thOptional("revenue_usd", "Revenue ($)", "Converted from EUR at live rate")}
              {thOptional("roi_pct", "ROI", "Revenue / Spend × 100")}
              {thOptional("impressions", "Impressions")}
              {thOptional("swipes", "Swipes")}
              {thOptional("clicks", "Clicks")}
              {thOptional("page_views", "Page Views")}
              {thOptional("video_views", "Video Views")}
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Controls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {aggregated.map((r, i) => (
              <>
                <tr
                  key={i}
                  onClick={() => setDrilldown(r)}
                  className="hover:bg-yellow-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2 font-medium text-gray-900 max-w-[200px] truncate">
                    {r.ad_squad_name}
                  </td>
                  <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                    {r.country_code ? `${r.country_code} — ${countryCodeToName(r.country_code)}` : "All"}
                  </td>
                  {visibleColumns.has("spend_usd") && (
                    <td className="px-4 py-2 text-gray-900 whitespace-nowrap">{fmt$(r.spend_usd)}</td>
                  )}
                  {visibleColumns.has("revenue_usd") && (
                    <td className="px-4 py-2 text-gray-900 whitespace-nowrap">{fmt$(r.revenue_usd)}</td>
                  )}
                  {visibleColumns.has("roi_pct") && (
                    <td className={`px-4 py-2 font-semibold whitespace-nowrap ${roiColor(r.roi_pct)}`}>
                      {fmtRoi(r.roi_pct)}
                    </td>
                  )}
                  {visibleColumns.has("impressions") && (
                    <td className="px-4 py-2 text-gray-700">{fmtNum(r.impressions)}</td>
                  )}
                  {visibleColumns.has("swipes") && (
                    <td className="px-4 py-2 text-gray-700">{fmtNum(r.swipes)}</td>
                  )}
                  {visibleColumns.has("clicks") && (
                    <td className="px-4 py-2 text-gray-700">{fmtNum(r.clicks)}</td>
                  )}
                  {visibleColumns.has("page_views") && (
                    <td className="px-4 py-2 text-gray-700">{fmtNum(r.page_views)}</td>
                  )}
                  {visibleColumns.has("video_views") && (
                    <td className="px-4 py-2 text-gray-700">{fmtNum(r.video_views)}</td>
                  )}
                  <td
                    className="px-4 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {squadDetails.has(r.ad_squad_id) ? (
                      <button
                        onClick={() => setOpenControlsId((id) => id === r.ad_squad_id ? null : r.ad_squad_id)}
                        className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                          openControlsId === r.ad_squad_id
                            ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                            : "border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        ⚙ Edit
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300">…</span>
                    )}
                  </td>
                </tr>
                {openControlsId === r.ad_squad_id && squadDetails.has(r.ad_squad_id) && (
                  <tr key={`${i}-controls`}>
                    <td colSpan={colSpan} className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                      <BudgetBidControls
                        squadId={r.ad_squad_id}
                        adAccountId={squadDetails.get(r.ad_squad_id)!.ad_account_id}
                        dailyBudgetMicro={squadDetails.get(r.ad_squad_id)!.daily_budget_micro}
                        bidMicro={squadDetails.get(r.ad_squad_id)!.bid_micro}
                        onUpdated={() => { setOpenControlsId(null); onControlsUpdated(); }}
                      />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {drilldown && (
        <DrilldownModal
          adSquadName={drilldown.ad_squad_name}
          rows={drilldown.detail}
          onClose={() => setDrilldown(null)}
        />
      )}
    </>
  );
}
