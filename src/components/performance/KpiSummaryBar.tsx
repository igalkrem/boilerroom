"use client";

import { useMemo } from "react";

interface KpiRow {
  spend_usd: number;
  revenue_usd: number;
  impressions: number;
  swipes: number;
  funnel_clicks: number;
}

interface Props {
  rows: KpiRow[];
  isLoading: boolean;
}

function fmt$(n: number) { return `$${n.toFixed(2)}`; }
function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
function fmtPct(n: number | null) { return n === null ? "—" : n.toFixed(2) + "%"; }

function roiBg(roi: number | null) {
  if (roi === null) return "";
  if (roi >= 100) return "bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800";
  if (roi >= 50) return "bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800";
  return "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800";
}

function roiValueColor(roi: number | null) {
  if (roi === null) return "text-gray-900 dark:text-gray-100";
  if (roi >= 100) return "text-green-700 dark:text-green-400";
  if (roi >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function profitColor(profit: number) {
  if (profit > 0) return "text-green-700 dark:text-green-400";
  if (profit < 0) return "text-red-600 dark:text-red-400";
  return "text-gray-900 dark:text-gray-100";
}

export function KpiSummaryBar({ rows, isLoading }: Props) {
  const totals = useMemo(() => {
    const spend = rows.reduce((s, r) => s + r.spend_usd, 0);
    const revenue = rows.reduce((s, r) => s + r.revenue_usd, 0);
    const impressions = rows.reduce((s, r) => s + r.impressions, 0);
    const swipes = rows.reduce((s, r) => s + r.swipes, 0);
    const funnel_clicks = rows.reduce((s, r) => s + r.funnel_clicks, 0);
    const roi = spend > 0 ? (revenue / spend) * 100 : null;
    const profit = revenue - spend;
    const ctr = impressions > 0 ? (swipes / impressions) * 100 : null;
    return { spend, revenue, roi, profit, impressions, swipes, funnel_clicks, ctr };
  }, [rows]);

  if (isLoading) {
    return (
      <div className="flex border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-5 shadow-sm">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 min-w-[110px] px-4 py-3 bg-white dark:bg-gray-800 ${i > 0 ? "border-l border-gray-200 dark:border-gray-700" : ""}`}
          >
            <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
            <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Amount Spent",
      value: fmt$(totals.spend),
      valueClass: "text-gray-900 dark:text-gray-100",
      cardClass: "bg-white dark:bg-gray-800",
    },
    {
      label: "Revenue",
      value: fmt$(totals.revenue),
      valueClass: "text-gray-900 dark:text-gray-100",
      cardClass: "bg-white dark:bg-gray-800",
    },
    {
      label: "ROI",
      value: fmtPct(totals.roi),
      valueClass: roiValueColor(totals.roi),
      cardClass: `${roiBg(totals.roi) || "bg-white dark:bg-gray-800"}`,
    },
    {
      label: "Profit",
      value: fmt$(totals.profit),
      valueClass: profitColor(totals.profit),
      cardClass: "bg-white dark:bg-gray-800",
    },
    {
      label: "Impressions",
      value: fmtK(totals.impressions),
      valueClass: "text-gray-900 dark:text-gray-100",
      cardClass: "bg-white dark:bg-gray-800",
    },
    {
      label: "Clicks",
      value: fmtK(totals.swipes),
      valueClass: "text-gray-900 dark:text-gray-100",
      cardClass: "bg-white dark:bg-gray-800",
    },
    {
      label: "Funnel Clicks",
      value: fmtK(totals.funnel_clicks),
      valueClass: "text-gray-900 dark:text-gray-100",
      cardClass: "bg-white dark:bg-gray-800",
    },
    {
      label: "CTR",
      value: fmtPct(totals.ctr),
      valueClass: "text-gray-900 dark:text-gray-100",
      cardClass: "bg-white dark:bg-gray-800",
    },
  ];

  return (
    <div className="flex border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto mb-5 shadow-sm">
      {cards.map((card, i) => (
        <div
          key={card.label}
          className={`flex-1 min-w-[110px] px-4 py-3 ${card.cardClass} ${i > 0 ? "border-l border-gray-200 dark:border-gray-700" : ""}`}
        >
          <p className="text-xs text-gray-500 mb-0.5 whitespace-nowrap">{card.label}</p>
          <p className={`text-base font-bold whitespace-nowrap ${card.valueClass}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}
