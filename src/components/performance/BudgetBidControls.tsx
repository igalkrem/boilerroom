"use client";

import { useState } from "react";

function microToDollar(micro: number) { return micro / 1_000_000; }
function dollarToMicro(dollars: number) { return Math.round(dollars * 1_000_000); }

interface Props {
  squadId: string;
  adAccountId: string;
  dailyBudgetMicro: number | null;
  bidMicro: number | null;
  onUpdated: () => void;
}

export function BudgetBidControls({ squadId, adAccountId, dailyBudgetMicro, bidMicro, onUpdated }: Props) {
  const initialBudget = dailyBudgetMicro != null && dailyBudgetMicro > 0
    ? microToDollar(dailyBudgetMicro).toFixed(2)
    : "";
  const initialBid = bidMicro != null && bidMicro > 0
    ? microToDollar(bidMicro).toFixed(2)
    : "";

  const [budgetValue, setBudgetValue] = useState(initialBudget);
  const [bidValue, setBidValue] = useState(initialBid);
  const [saving, setSaving] = useState<"budget" | "bid" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<"budget" | "bid" | null>(null);

  const hasBudget = !!initialBudget;
  const hasBid = !!initialBid;

  async function save(field: "budget" | "bid") {
    const raw = field === "budget" ? budgetValue : bidValue;
    const dollars = parseFloat(raw);
    if (isNaN(dollars) || dollars <= 0) { setError("Invalid value"); return; }
    if (field === "budget" && dollars < 20) { setError("Minimum budget is $20.00"); return; }

    setSaving(field);
    setError(null);
    setSaved(null);
    try {
      const body: Record<string, unknown> = { adAccountId, squadId };
      if (field === "budget") body.daily_budget_micro = dollarToMicro(dollars);
      else body.bid_micro = dollarToMicro(dollars);

      const res = await fetch("/api/snapchat/adsquads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? "Update failed");
      }
      setSaved(field);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
    setSaving(null);
  }

  function adjustBudget(kind: "pct-10" | "minus5" | "plus5" | "pct10") {
    const cur = parseFloat(budgetValue) || 0;
    let next = cur;
    if (kind === "pct-10") next = cur * 0.9;
    else if (kind === "minus5") next = cur - 5;
    else if (kind === "plus5") next = cur + 5;
    else next = cur * 1.1;
    next = Math.max(20, Math.round(next * 100) / 100);
    setBudgetValue(next.toFixed(2));
  }

  function adjustBid(kind: "pct-10" | "minus1" | "plus1" | "pct10") {
    const cur = parseFloat(bidValue) || 0;
    let next = cur;
    if (kind === "pct-10") next = cur * 0.9;
    else if (kind === "minus1") next = cur - 1;
    else if (kind === "plus1") next = cur + 1;
    else next = cur * 1.1;
    next = Math.max(0.01, Math.round(next * 100) / 100);
    setBidValue(next.toFixed(2));
  }

  if (!hasBudget && !hasBid) {
    return <span className="text-xs text-gray-400">No budget/bid data</span>;
  }

  return (
    <div className="flex flex-wrap gap-6 items-center">
      {hasBudget && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Daily Budget</span>
          <div className="flex items-center gap-1">
            {(["pct-10", "minus5", "plus5", "pct10"] as const).map((k) => (
              <button
                key={k}
                onClick={() => adjustBudget(k)}
                className="px-1.5 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100 transition-colors"
              >
                {k === "pct-10" ? "−10%" : k === "minus5" ? "−$5" : k === "plus5" ? "+$5" : "+10%"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            <span className="text-xs text-gray-400">$</span>
            <input
              type="number" min={20} step={0.01}
              value={budgetValue}
              onChange={(e) => setBudgetValue(e.target.value)}
              className="w-20 border border-gray-300 rounded px-2 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
          <button
            onClick={() => void save("budget")}
            disabled={saving !== null}
            className={`px-2.5 py-0.5 text-xs font-medium rounded transition-colors ${
              saved === "budget"
                ? "bg-green-500 text-white"
                : "bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50"
            }`}
          >
            {saving === "budget" ? "…" : saved === "budget" ? "Saved" : "Save"}
          </button>
        </div>
      )}

      {hasBid && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Bid</span>
          <div className="flex items-center gap-1">
            {(["pct-10", "minus1", "plus1", "pct10"] as const).map((k) => (
              <button
                key={k}
                onClick={() => adjustBid(k)}
                className="px-1.5 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100 transition-colors"
              >
                {k === "pct-10" ? "−10%" : k === "minus1" ? "−$1" : k === "plus1" ? "+$1" : "+10%"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            <span className="text-xs text-gray-400">$</span>
            <input
              type="number" min={0.01} step={0.01}
              value={bidValue}
              onChange={(e) => setBidValue(e.target.value)}
              className="w-20 border border-gray-300 rounded px-2 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
          <button
            onClick={() => void save("bid")}
            disabled={saving !== null}
            className={`px-2.5 py-0.5 text-xs font-medium rounded transition-colors ${
              saved === "bid"
                ? "bg-green-500 text-white"
                : "bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50"
            }`}
          >
            {saving === "bid" ? "…" : saved === "bid" ? "Saved" : "Save"}
          </button>
        </div>
      )}

      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
