"use client";

import { useState, useEffect } from "react";
import type { CombinedRow } from "@/app/api/reporting/combined/route";
import { Spinner } from "@/components/ui";

interface Props {
  adSquadName: string;
  adSquadId: string;
  adAccountId: string;
  onClose: () => void;
}

function fmt$(n: number) { return `$${n.toFixed(2)}`; }
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

export function DrilldownModal({ adSquadName, adSquadId, adAccountId, onClose }: Props) {
  const [rows, setRows] = useState<CombinedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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

  const totals = rows.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spend_usd,
      revenue: acc.revenue + r.revenue_usd,
      impressions: acc.impressions + r.impressions,
      swipes: acc.swipes + r.swipes,
      funnel_clicks: acc.funnel_clicks + r.funnel_clicks,
      page_views: acc.page_views + r.page_views,
    }),
    { spend: 0, revenue: 0, impressions: 0, swipes: 0, funnel_clicks: 0, page_views: 0 }
  );
  const totalRoi = totals.spend > 0 ? (totals.revenue / totals.spend) * 100 : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{adSquadName}</h2>
            <p className="text-xs text-gray-500">All available dates</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="overflow-auto flex-1">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400 text-sm">
              <Spinner />
              Loading…
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
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {["Date", "Spend", "Revenue", "ROI", "Impressions", "Clicks", "Funnel Clicks", "Page Views"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{r.stat_date}</td>
                    <td className="px-4 py-2 text-gray-900 whitespace-nowrap">{fmt$(r.spend_usd)}</td>
                    <td className="px-4 py-2 text-gray-900 whitespace-nowrap">{fmt$(r.revenue_usd)}</td>
                    <td className={`px-4 py-2 font-medium whitespace-nowrap ${roiColor(r.roi_pct)}`}>{fmtRoi(r.roi_pct)}</td>
                    <td className="px-4 py-2 text-gray-700">{fmtNum(r.impressions)}</td>
                    <td className="px-4 py-2 text-gray-700">{fmtNum(r.swipes)}</td>
                    <td className="px-4 py-2 text-gray-700">{fmtNum(r.funnel_clicks)}</td>
                    <td className="px-4 py-2 text-gray-700">{fmtNum(r.page_views)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td className="px-4 py-2 text-xs font-semibold text-gray-500">TOTAL</td>
                  <td className="px-4 py-2 font-semibold text-gray-900">{fmt$(totals.spend)}</td>
                  <td className="px-4 py-2 font-semibold text-gray-900">{fmt$(totals.revenue)}</td>
                  <td className={`px-4 py-2 font-semibold ${roiColor(totalRoi)}`}>{fmtRoi(totalRoi)}</td>
                  <td className="px-4 py-2 font-semibold text-gray-900">{fmtNum(totals.impressions)}</td>
                  <td className="px-4 py-2 font-semibold text-gray-900">{fmtNum(totals.swipes)}</td>
                  <td className="px-4 py-2 font-semibold text-gray-900">{fmtNum(totals.funnel_clicks)}</td>
                  <td className="px-4 py-2 font-semibold text-gray-900">{fmtNum(totals.page_views)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
