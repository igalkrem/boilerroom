"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAdAccounts } from "@/hooks/useAdAccounts";
import { loadAdAccountConfigs } from "@/lib/adAccounts";
import { Spinner, Alert } from "@/components/ui";
import { PerformanceTable } from "@/components/performance/PerformanceTable";
import { DateRangePicker } from "@/components/performance/DateRangePicker";
import { loadSavedColumns } from "@/components/performance/ColumnSelector";
import { KpiSummaryBar } from "@/components/performance/KpiSummaryBar";
import type { CombinedRow } from "@/app/api/reporting/combined/route";
import type { SquadDetail } from "@/components/performance/PerformanceTable";
import type { SnapAdAccount } from "@/types/snapchat";

function todayStr() { return new Date().toISOString().slice(0, 10); }

function dateMinus(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function PerformancePage() {
  const { accounts } = useAdAccounts();
  const [adAccountConfigs] = useState(() => loadAdAccountConfigs());

  const activeAccounts = useMemo(() => {
    const visible = accounts.filter((a) => !adAccountConfigs.find((c) => c.id === a.id)?.hidden);
    return visible.length > 0 ? visible : accounts;
  }, [accounts, adAccountConfigs]);

  const today = todayStr();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const [rows, setRows] = useState<CombinedRow[]>([]);
  const [historicalRows, setHistoricalRows] = useState<CombinedRow[]>([]);
  const [eurToUsd, setEurToUsd] = useState(1.08);
  const [squadDetails, setSquadDetails] = useState<Map<string, SquadDetail>>(new Map());
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [minutesAgo, setMinutesAgo] = useState<number | null>(null);

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => loadSavedColumns());

  const isRefreshing = useRef(false);

  const refresh = useCallback(async (accts: SnapAdAccount[], start: string, end: string, force = false) => {
    if (accts.length === 0 || isRefreshing.current) return;
    isRefreshing.current = true;
    setSyncing(true);
    setError(null);

    await Promise.allSettled(
      accts.map((a) =>
        fetch("/api/reporting/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adAccountId: a.id, startDate: start, endDate: end, timezone: a.timezone, force }),
        })
      )
    );

    setSyncing(false);
    setLoading(true);

    const results = await Promise.allSettled(
      accts.map((a) =>
        fetch(`/api/reporting/combined?adAccountId=${a.id}&startDate=${start}&endDate=${end}`)
          .then((r) => r.json() as Promise<{ rows: CombinedRow[]; eur_to_usd: number }>)
      )
    );

    const allRows = results.flatMap((r) => r.status === "fulfilled" ? (r.value.rows ?? []) : []);
    setRows(allRows);

    const first = results.find((r) => r.status === "fulfilled");
    if (first?.status === "fulfilled") setEurToUsd(first.value.eur_to_usd ?? 1.08);

    // Also fetch historical data (3 days before selected range) for -1D/-2D/-3D ROI columns
    const histEnd = dateMinus(start, 1);
    const histStart = dateMinus(start, 3);
    const histResults = await Promise.allSettled(
      accts.map((a) =>
        fetch(`/api/reporting/combined?adAccountId=${a.id}&startDate=${histStart}&endDate=${histEnd}`)
          .then((r) => r.json() as Promise<{ rows: CombinedRow[] }>)
      )
    );
    setHistoricalRows(histResults.flatMap((r) => r.status === "fulfilled" ? (r.value.rows ?? []) : []));

    setLastSynced(new Date());
    setLoading(false);
    isRefreshing.current = false;
  }, []);

  const loadSquadDetails = useCallback(async (accts: SnapAdAccount[]) => {
    if (accts.length === 0) return;
    try {
      const results = await Promise.allSettled(
        accts.map((a) =>
          fetch(`/api/snapchat/adsquads?adAccountId=${a.id}`)
            .then((r) => r.json())
            .then((d) => ({
              accountId: a.id,
              squads: (d.adsquads ?? []) as Array<{
                id: string;
                daily_budget_micro?: number;
                bid_micro?: number;
                status?: "ACTIVE" | "PAUSED";
              }>,
            }))
        )
      );
      const map = new Map<string, SquadDetail>();
      for (const r of results) {
        if (r.status === "fulfilled") {
          for (const s of r.value.squads) {
            map.set(s.id, {
              daily_budget_micro: s.daily_budget_micro ?? 0,
              bid_micro: s.bid_micro ?? 0,
              ad_account_id: r.value.accountId,
              status: s.status ?? "ACTIVE",
            });
          }
        }
      }
      setSquadDetails(map);
    } catch (err) {
      console.error("[performance] squad details:", err);
    }
  }, []);

  // Auto-load on first available accounts
  const didLoad = useRef(false);
  useEffect(() => {
    if (activeAccounts.length > 0 && !didLoad.current) {
      didLoad.current = true;
      void refresh(activeAccounts, startDate, endDate);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccounts]);

  // Load squad details after rows populate
  useEffect(() => {
    if (rows.length > 0 && activeAccounts.length > 0) {
      void loadSquadDetails(activeAccounts);
    }
  }, [rows, activeAccounts, loadSquadDetails]);

  // Auto-refresh every 15 min using a ref to avoid stale closure
  const latestParams = useRef({ accts: activeAccounts, start: startDate, end: endDate });
  useEffect(() => {
    latestParams.current = { accts: activeAccounts, start: startDate, end: endDate };
  }, [activeAccounts, startDate, endDate]);

  useEffect(() => {
    const id = setInterval(() => {
      const { accts, start, end } = latestParams.current;
      void refresh(accts, start, end);
    }, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [refresh]);

  // "X min ago" display clock
  useEffect(() => {
    if (!lastSynced) return;
    function tick() {
      setMinutesAgo(Math.floor((Date.now() - lastSynced!.getTime()) / 60_000));
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [lastSynced]);

  function handleDateChange(start: string, end: string) {
    setStartDate(start);
    setEndDate(end);
    void refresh(activeAccounts, start, end, true);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Performance</h1>
      <p className="text-sm text-gray-500 mb-4">
        Full-funnel metrics — Snapchat spend joined with KingsRoad revenue.
      </p>

      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={handleDateChange} />
        {(syncing || loading) && (
          <div className="flex items-center gap-1.5 text-gray-400 text-sm">
            <Spinner />
            {syncing ? "Syncing…" : "Loading…"}
          </div>
        )}
        {!syncing && !loading && minutesAgo !== null && (
          <span className="text-xs text-gray-400">
            ↻ {minutesAgo === 0 ? "just now" : `${minutesAgo} min ago`}
          </span>
        )}
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      <KpiSummaryBar rows={rows} isLoading={syncing || loading} />

      {!syncing && !loading && rows.length > 0 && (
        <PerformanceTable
          rows={rows}
          eurToUsd={eurToUsd}
          visibleColumns={visibleColumns}
          onColumnsChange={setVisibleColumns}
          squadDetails={squadDetails}
          historicalRows={historicalRows}
          startDate={startDate}
          onSquadUpdated={() => void loadSquadDetails(activeAccounts)}
        />
      )}

      {!syncing && !loading && rows.length === 0 && lastSynced && (
        <p className="text-sm text-gray-500 mt-8 text-center">
          No data found for the selected date range. Try a different range.
        </p>
      )}

      {!lastSynced && !syncing && !loading && activeAccounts.length === 0 && accounts.length > 0 && (
        <p className="text-sm text-gray-400 mt-12 text-center">
          Loading account data…
        </p>
      )}
    </div>
  );
}
