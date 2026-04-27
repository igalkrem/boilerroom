"use client";

import { useState, useMemo } from "react";
import type { CombinedRow } from "@/app/api/reporting/combined/route";
import { DrilldownModal } from "./DrilldownModal";
import { countryCodeToName } from "@/lib/country-map";

interface Props {
  rows: CombinedRow[];
  eurToUsd: number;
}

type SortKey = "spend_usd" | "revenue_usd" | "roi_pct" | "impressions" | "swipes" | "clicks" | "page_views";

function fmt$(n: number) { return `$${n.toFixed(2)}`; }
function fmtRoi(pct: number | null) {
  if (pct === null) return "—";
  return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
}
function roiColor(pct: number | null) {
  if (pct === null) return "text-gray-400";
  return pct >= 0 ? "text-green-600" : "text-red-600";
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
  detail: CombinedRow[];
}

export function PerformanceTable({ rows, eurToUsd }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("spend_usd");
  const [sortDesc, setSortDesc] = useState(true);
  const [drilldown, setDrilldown] = useState<AggrRow | null>(null);

  const aggregated = useMemo<AggrRow[]>(() => {
    const map = new Map<string, AggrRow>();
    for (const r of rows) {
      const key = `${r.ad_squad_id}||${r.country_code}`;
      const existing = map.get(key);
      if (existing) {
        existing.spend_usd += r.spend_usd;
        existing.revenue_usd += r.revenue_usd;
        existing.revenue_eur += r.revenue_eur;
        existing.impressions += r.impressions;
        existing.swipes += r.swipes;
        existing.clicks += r.clicks;
        existing.page_views += r.page_views;
        existing.detail.push(r);
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
          detail: [r],
        });
      }
    }
    const aggRows = Array.from(map.values()).map((a) => ({
      ...a,
      roi_pct: a.spend_usd > 0 ? ((a.revenue_usd - a.spend_usd) / a.spend_usd) * 100 : null,
    }));

    return aggRows.sort((a, b) => {
      const av = sortKey === "roi_pct" ? (a.roi_pct ?? -Infinity) : a[sortKey];
      const bv = sortKey === "roi_pct" ? (b.roi_pct ?? -Infinity) : b[sortKey];
      return sortDesc ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
  }, [rows, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  function thProps(key: SortKey, label: string, tooltip?: string) {
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
              {thProps("spend_usd", "Spend ($)")}
              {thProps("revenue_usd", "Revenue ($)", "Converted from EUR at live rate")}
              {thProps("roi_pct", "ROI")}
              {thProps("impressions", "Impressions")}
              {thProps("swipes", "Swipes")}
              {thProps("clicks", "Clicks")}
              {thProps("page_views", "Page Views")}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {aggregated.map((r, i) => (
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
                <td className="px-4 py-2 text-gray-900 whitespace-nowrap">{fmt$(r.spend_usd)}</td>
                <td className="px-4 py-2 text-gray-900 whitespace-nowrap">{fmt$(r.revenue_usd)}</td>
                <td className={`px-4 py-2 font-semibold whitespace-nowrap ${roiColor(r.roi_pct)}`}>
                  {fmtRoi(r.roi_pct)}
                </td>
                <td className="px-4 py-2 text-gray-700">{fmtNum(r.impressions)}</td>
                <td className="px-4 py-2 text-gray-700">{fmtNum(r.swipes)}</td>
                <td className="px-4 py-2 text-gray-700">{fmtNum(r.clicks)}</td>
                <td className="px-4 py-2 text-gray-700">{fmtNum(r.page_views)}</td>
              </tr>
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
