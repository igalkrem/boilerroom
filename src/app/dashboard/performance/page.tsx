"use client";

import { useState, useCallback } from "react";
import { useAdAccounts } from "@/hooks/useAdAccounts";
import { Spinner, Alert } from "@/components/ui";
import { PerformanceTable } from "@/components/performance/PerformanceTable";
import type { CombinedRow } from "@/app/api/reporting/combined/route";

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function PerformancePage() {
  const { accounts, isLoading: accountsLoading } = useAdAccounts();

  const [adAccountId, setAdAccountId] = useState("");
  const [startDate, setStartDate] = useState(daysAgo(29));
  const [endDate, setEndDate] = useState(todayStr());
  const [country, setCountry] = useState("");

  const [rows, setRows] = useState<CombinedRow[]>([]);
  const [eurToUsd, setEurToUsd] = useState(1.08);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const refresh = useCallback(async (accountId: string, start: string, end: string, ctry: string) => {
    if (!accountId) return;
    setError(null);
    setSyncing(true);
    try {
      const syncRes = await fetch("/api/reporting/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId: accountId, startDate: start, endDate: end }),
      });
      if (!syncRes.ok) {
        const d = await syncRes.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? `Sync failed (${syncRes.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSyncing(false);
      return;
    }
    setSyncing(false);
    setLoading(true);
    try {
      const params = new URLSearchParams({ adAccountId: accountId, startDate: start, endDate: end, country: ctry });
      const res = await fetch(`/api/reporting/combined?${params}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? `Load failed (${res.status})`);
      }
      const data = await res.json() as { rows: CombinedRow[]; eur_to_usd: number };
      setRows(data.rows);
      setEurToUsd(data.eur_to_usd);
      setLastSynced(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setLoading(false);
  }, []);

  function handleRefresh() {
    void refresh(adAccountId, startDate, endDate, country);
  }

  const uniqueCountries = Array.from(new Set(rows.map((r) => r.country_code).filter(Boolean))).sort();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Performance</h1>
      <p className="text-sm text-gray-500 mb-6">
        Full-funnel metrics — Snapchat spend joined with KingsRoad revenue. Attribution: ad squad ID = channel name.
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Account</label>
          {accountsLoading ? (
            <div className="flex items-center gap-1 text-gray-400 text-sm"><Spinner /> Loading…</div>
          ) : (
            <select
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
              className="border border-gray-300 rounded-md text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Start date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-md text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">End date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-md text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        {uniqueCountries.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Country</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="border border-gray-300 rounded-md text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">All countries</option>
              {uniqueCountries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={handleRefresh}
          disabled={!adAccountId || syncing || loading}
          className="px-4 py-1.5 rounded-md text-sm font-medium bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {syncing ? "Syncing…" : loading ? "Loading…" : "↺ Refresh"}
        </button>

        {lastSynced && !syncing && !loading && (
          <span className="text-xs text-gray-400 self-end pb-1">Last refreshed {lastSynced}</span>
        )}
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      {(syncing || loading) && (
        <div className="flex items-center gap-2 text-gray-500 text-sm mb-4">
          <Spinner />
          {syncing ? "Syncing data from Snapchat & KingsRoad…" : "Loading metrics…"}
        </div>
      )}

      {!syncing && !loading && rows.length > 0 && (
        <PerformanceTable rows={rows} eurToUsd={eurToUsd} />
      )}

      {!syncing && !loading && rows.length === 0 && adAccountId && lastSynced && (
        <p className="text-sm text-gray-500 mt-8 text-center">
          No data found for the selected filters. Try widening the date range.
        </p>
      )}

      {!adAccountId && (
        <p className="text-sm text-gray-400 mt-12 text-center">
          Select an account and click Refresh to load performance data.
        </p>
      )}
    </div>
  );
}
