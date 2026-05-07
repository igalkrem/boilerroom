"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAdAccounts } from "@/hooks/useAdAccounts";
import { loadAdAccountConfigs } from "@/lib/adAccounts";
import { Spinner, Alert } from "@/components/ui";
import { PerformanceTable } from "@/components/performance/PerformanceTable";
import { DateRangePicker } from "@/components/performance/DateRangePicker";
import { loadSavedColumns, loadSavedOrder } from "@/components/performance/ColumnSelector";
import { KpiSummaryBar } from "@/components/performance/KpiSummaryBar";
import type { CombinedRow } from "@/app/api/reporting/combined/route";
import type { SquadDetail, AggrRow } from "@/components/performance/PerformanceTable";
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
  const [squadDetailsError, setSquadDetailsError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const [minutesAgo, setMinutesAgo] = useState<number | null>(null);

  const [kpiRows, setKpiRows] = useState<AggrRow[]>([]);

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => loadSavedColumns());
  const [columnOrder, setColumnOrder] = useState<string[]>(() => loadSavedOrder());

  const isRefreshing = useRef(false);

  // ── Load from DB only (fast — no sync) ────────────────────────────────────
  const loadFromDb = useCallback(async (accts: SnapAdAccount[], start: string, end: string) => {
    if (accts.length === 0) return;
    setLoading(true);
    setError(null);

    const [currentResults, histResults] = await Promise.all([
      Promise.allSettled(
        accts.map((a) =>
          fetch(`/api/reporting/combined?adAccountId=${a.id}&startDate=${start}&endDate=${end}`)
            .then((r) => r.json() as Promise<{ rows: CombinedRow[]; eur_to_usd: number }>)
        )
      ),
      Promise.allSettled(
        accts.map((a) =>
          fetch(`/api/reporting/combined?adAccountId=${a.id}&startDate=${dateMinus(start, 3)}&endDate=${dateMinus(start, 1)}`)
            .then((r) => r.json() as Promise<{ rows: CombinedRow[] }>)
        )
      ),
    ]);

    const allRows = currentResults.flatMap((r) => r.status === "fulfilled" ? (r.value.rows ?? []) : []);
    setRows(allRows);
    const first = currentResults.find((r) => r.status === "fulfilled");
    if (first?.status === "fulfilled") setEurToUsd(first.value.eur_to_usd ?? 1.08);
    setHistoricalRows(histResults.flatMap((r) => r.status === "fulfilled" ? (r.value.rows ?? []) : []));
    setLastLoaded(new Date());
    setLoading(false);
    return allRows.length;
  }, []);

  // ── Sync then reload (slow — hits Snapchat + KingsRoad APIs) ──────────────
  const syncAndReload = useCallback(async (accts: SnapAdAccount[], start: string, end: string, force = true) => {
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
    await loadFromDb(accts, start, end);
    isRefreshing.current = false;
  }, [loadFromDb]);

  const loadSquadDetails = useCallback(async (accts: SnapAdAccount[]) => {
    if (accts.length === 0) return;

    type AccountSquads = {
      accountId: string;
      squads: Array<{
        id: string;
        daily_budget_micro?: number;
        bid_micro?: number;
        status?: "ACTIVE" | "PAUSED";
      }>;
    };

    async function fetchOne(a: SnapAdAccount, attempt = 0): Promise<AccountSquads> {
      const r = await fetch(`/api/snapchat/adsquads?adAccountId=${a.id}`);
      if (!r.ok) {
        if (attempt < 2) {
          await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
          return fetchOne(a, attempt + 1);
        }
        throw new Error(`HTTP ${r.status}`);
      }
      const d = await r.json();
      return { accountId: a.id, squads: d.adsquads ?? [] };
    }

    const results = await Promise.allSettled(accts.map((a) => fetchOne(a)));
    const failedIds: string[] = [];

    setSquadDetails((prev) => {
      const next = new Map(prev);
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const a = accts[i];
        if (r.status === "fulfilled") {
          for (const [squadId, d] of next) {
            if (d.ad_account_id === a.id) next.delete(squadId);
          }
          for (const s of r.value.squads) {
            next.set(s.id, {
              daily_budget_micro: s.daily_budget_micro ?? 0,
              bid_micro: s.bid_micro ?? 0,
              ad_account_id: r.value.accountId,
              status: s.status ?? "ACTIVE",
            });
          }
        } else {
          failedIds.push(a.id);
          console.error(`[performance] squad details fetch failed for ${a.id}:`, r.reason);
        }
      }
      return next;
    });

    setSquadDetailsError(
      failedIds.length > 0
        ? `Could not load campaign settings for ${failedIds.length} ad account${failedIds.length === 1 ? "" : "s"} — refresh to retry.`
        : null
    );
  }, []);

  const updateSquadDetail = useCallback((squadId: string, patch: Partial<SquadDetail>) => {
    setSquadDetails((prev) => {
      const existing = prev.get(squadId);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(squadId, { ...existing, ...patch });
      return next;
    });
  }, []);

  // ── On mount: load from DB immediately (cron keeps it fresh) ──────────────
  const didLoad = useRef(false);
  useEffect(() => {
    if (activeAccounts.length > 0 && !didLoad.current) {
      didLoad.current = true;
      void loadFromDb(activeAccounts, startDate, endDate).then((count) => {
        // If DB has no data for this range, auto-sync to seed it.
        if (count === 0) {
          void syncAndReload(activeAccounts, startDate, endDate, true);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccounts]);

  // ── Load squad details after rows populate ─────────────────────────────────
  useEffect(() => {
    if (rows.length > 0 && activeAccounts.length > 0) {
      void loadSquadDetails(activeAccounts);
    }
  }, [rows, activeAccounts, loadSquadDetails]);

  // ── "X min ago" display clock ──────────────────────────────────────────────
  useEffect(() => {
    if (!lastLoaded) return;
    function tick() {
      setMinutesAgo(Math.floor((Date.now() - lastLoaded!.getTime()) / 60_000));
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [lastLoaded]);

  function handleDateChange(start: string, end: string) {
    setStartDate(start);
    setEndDate(end);
    void syncAndReload(activeAccounts, start, end, true);
  }

  function handleManualRefresh() {
    void syncAndReload(activeAccounts, startDate, endDate, true);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Performance</h1>
      <p className="text-sm text-gray-500 mb-4">
        Full-funnel metrics — Snapchat spend joined with KingsRoad revenue.
      </p>

      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={handleDateChange} />

        {/* Manual refresh button */}
        <button
          onClick={handleManualRefresh}
          disabled={syncing || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {syncing ? <Spinner /> : <span>↻</span>}
          {syncing ? "Syncing…" : "Refresh"}
        </button>

        {loading && !syncing && (
          <div className="flex items-center gap-1.5 text-gray-400 text-sm">
            <Spinner />
            Loading…
          </div>
        )}
        {!syncing && !loading && minutesAgo !== null && (
          <span className="text-xs text-gray-400">
            Updated {minutesAgo === 0 ? "just now" : `${minutesAgo} min ago`}
          </span>
        )}
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      {squadDetailsError && (
        <p className="text-xs text-amber-600 mb-2">{squadDetailsError}</p>
      )}

      <KpiSummaryBar rows={kpiRows} isLoading={loading && rows.length === 0} />

      {rows.length > 0 && (
        <PerformanceTable
          rows={rows}
          eurToUsd={eurToUsd}
          visibleColumns={visibleColumns}
          onColumnsChange={setVisibleColumns}
          columnOrder={columnOrder}
          onColumnOrderChange={setColumnOrder}
          squadDetails={squadDetails}
          historicalRows={historicalRows}
          startDate={startDate}
          onSquadUpdated={() => void loadSquadDetails(activeAccounts)}
          onSquadPatched={updateSquadDetail}
          onFilteredRowsChange={setKpiRows}
        />
      )}

      {!loading && !syncing && rows.length === 0 && lastLoaded && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-8 text-center">
          No data found for the selected date range. Try a different range or click Refresh.
        </p>
      )}

      {!lastLoaded && !loading && !syncing && activeAccounts.length === 0 && accounts.length > 0 && (
        <p className="text-sm text-gray-400 mt-12 text-center">
          Loading account data…
        </p>
      )}
    </div>
  );
}
