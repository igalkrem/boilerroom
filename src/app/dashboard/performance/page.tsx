"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAdAccounts } from "@/hooks/useAdAccounts";
import { loadAdAccountConfigs } from "@/lib/adAccounts";
import { Spinner, Alert } from "@/components/ui";
import { PerformanceTable } from "@/components/performance/PerformanceTable";
import { DateRangePicker } from "@/components/performance/DateRangePicker";
import { loadSavedColumns, loadSavedOrder } from "@/components/performance/ColumnSelector";
import { KpiSummaryBar } from "@/components/performance/KpiSummaryBar";
import { PerformanceSummaryTables } from "@/components/performance/PerformanceSummaryTables";
import { SyncStatusBar } from "@/components/performance/SyncStatusBar";
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
  const [last30Rows, setLast30Rows] = useState<CombinedRow[] | undefined>(undefined);
  const [eurToUsd, setEurToUsd] = useState(1.08);
  const [squadDetails, setSquadDetails] = useState<Map<string, SquadDetail>>(new Map());
  const [squadDetailsError, setSquadDetailsError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  const [kpiRows, setKpiRows] = useState<AggrRow[]>([]);
  const [summaryFilter, setSummaryFilter] = useState<{ squadIds: Set<string>; label: string } | null>(null);
  const [syncRefreshTrigger, setSyncRefreshTrigger] = useState(0);

  const tableRows = useMemo(
    () => summaryFilter ? rows.filter(r => summaryFilter.squadIds.has(r.ad_squad_id)) : rows,
    [rows, summaryFilter]
  );

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

  // ── Last-30-days fetch for By Date summary table (ignores date picker) ──────
  const loadLast30Days = useCallback(async (accts: SnapAdAccount[]) => {
    if (accts.length === 0) return;
    const end = todayStr();
    const start = dateMinus(end, 29);
    const results = await Promise.allSettled(
      accts.map((a) =>
        fetch(`/api/reporting/combined?adAccountId=${a.id}&startDate=${start}&endDate=${end}`)
          .then((r) => r.json() as Promise<{ rows: CombinedRow[] }>)
      )
    );
    setLast30Rows(results.flatMap((r) => r.status === "fulfilled" ? (r.value.rows ?? []) : []));
  }, []);

  // ── Sync then reload (slow — hits Snapchat + KingsRoad APIs) ──────────────
  const syncAndReload = useCallback(async (accts: SnapAdAccount[], start: string, end: string, force = true) => {
    if (accts.length === 0 || isRefreshing.current) return;
    isRefreshing.current = true;
    setError(null);

    // Show whatever is already in the DB immediately — don't make the user wait
    // for the full sync before seeing any data.
    await loadFromDb(accts, start, end);

    setSyncing(true);

    const histStart = dateMinus(start, 3);
    const histEnd = dateMinus(start, 1);

    await Promise.allSettled(
      accts.flatMap((a) => [
        fetch("/api/reporting/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adAccountId: a.id, startDate: start, endDate: end, timezone: a.timezone, force }),
        }),
        // Sync the 3 days before the range for -1D/-2D/-3D ROI columns.
        // force=false so finalized historical dates are not re-fetched unnecessarily.
        fetch("/api/reporting/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adAccountId: a.id, startDate: histStart, endDate: histEnd, timezone: a.timezone, force: false }),
        }),
      ])
    );

    setSyncing(false);
    await loadFromDb(accts, start, end);
    setSyncRefreshTrigger((n) => n + 1);
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
      void loadLast30Days(activeAccounts);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccounts]);

  // ── Load squad details after rows populate ─────────────────────────────────
  useEffect(() => {
    if (rows.length > 0 && activeAccounts.length > 0) {
      void loadSquadDetails(activeAccounts);
    }
  }, [rows, activeAccounts, loadSquadDetails]);


  function handleDateChange(start: string, end: string) {
    setStartDate(start);
    setEndDate(end);
    setSummaryFilter(null);
    // Always force-sync on date change so fresh data is fetched even when DB has stale rows.
    void syncAndReload(activeAccounts, start, end, true);
  }

  function handleManualRefresh() {
    void syncAndReload(activeAccounts, startDate, endDate, true);
    void loadLast30Days(activeAccounts);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Performance</h1>
      <p className="text-sm text-gray-500 mb-4">
        Full-funnel metrics — Snapchat spend joined with KingsRoad revenue.
      </p>

      <SyncStatusBar
        onForceRefresh={handleManualRefresh}
        syncing={syncing}
        loading={loading}
        refreshTrigger={syncRefreshTrigger}
      />

      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={handleDateChange} />
        {loading && !syncing && (
          <div className="flex items-center gap-1.5 text-gray-400 text-sm">
            <Spinner />
            Loading…
          </div>
        )}
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      {squadDetailsError && (
        <p className="text-xs text-amber-600 mb-2">{squadDetailsError}</p>
      )}

      <KpiSummaryBar rows={kpiRows} isLoading={loading && rows.length === 0} />

      {rows.length > 0 && (
        <>
          <PerformanceSummaryTables
            rows={rows}
            historicalRows={historicalRows}
            startDate={startDate}
            last30Rows={last30Rows}
            squadDetails={squadDetails}
            onFilterChange={setSummaryFilter}
          />
          <PerformanceTable
          rows={tableRows}
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
        </>
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
