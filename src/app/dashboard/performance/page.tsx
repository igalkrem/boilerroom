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
import { useMetaAdAccounts } from "@/hooks/useMetaAdAccounts";

function todayStr() { return new Date().toISOString().slice(0, 10); }

function dateMinus(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function PerformancePage() {
  const { accounts } = useAdAccounts();
  const { accounts: metaAccounts } = useMetaAdAccounts();
  const [adAccountConfigs] = useState(() => loadAdAccountConfigs());

  // Only fall back to "show all" for a fresh user who has never configured any
  // account. Once configs exist, respect the hidden flag exactly — including the
  // case where every account is hidden (show nothing), so hidden accounts from
  // Traffic Sources never leak back onto the dashboard.
  const activeAccounts = useMemo(() => {
    if (adAccountConfigs.length === 0) return accounts;
    return accounts.filter((a) => !adAccountConfigs.find((c) => c.id === a.id)?.hidden);
  }, [accounts, adAccountConfigs]);

  // Same hidden-filter applied to Meta accounts (previously the dashboard used the
  // raw metaAccounts hook output, so hidden Meta accounts still showed all campaigns).
  const activeMetaAccounts = useMemo(() => {
    if (adAccountConfigs.length === 0) return metaAccounts;
    return metaAccounts.filter((a) => !adAccountConfigs.find((c) => c.id === a.id)?.hidden);
  }, [metaAccounts, adAccountConfigs]);

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
    const allIds = [
      ...accts.map((a) => a.id),
      ...activeMetaAccounts.map((a) => a.id),
    ];
    if (allIds.length === 0) return;
    setLoading(true);
    setError(null);

    const [currentResults, histResults] = await Promise.all([
      Promise.allSettled(
        allIds.map((id) =>
          fetch(`/api/reporting/combined?adAccountId=${id}&startDate=${start}&endDate=${end}`)
            .then((r) => r.json() as Promise<{ rows: CombinedRow[]; eur_to_usd: number }>)
        )
      ),
      Promise.allSettled(
        allIds.map((id) =>
          fetch(`/api/reporting/combined?adAccountId=${id}&startDate=${dateMinus(start, 3)}&endDate=${dateMinus(start, 1)}`)
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
  }, [activeMetaAccounts]);

  // ── Last-30-days fetch for By Date summary table (ignores date picker) ──────
  const loadLast30Days = useCallback(async (accts: SnapAdAccount[]) => {
    const allIds = [...accts.map((a) => a.id), ...activeMetaAccounts.map((a) => a.id)];
    if (allIds.length === 0) return;
    const end = todayStr();
    const start = dateMinus(end, 29);
    const results = await Promise.allSettled(
      allIds.map((id) =>
        fetch(`/api/reporting/combined?adAccountId=${id}&startDate=${start}&endDate=${end}`)
          .then((r) => r.json() as Promise<{ rows: CombinedRow[] }>)
      )
    );
    setLast30Rows(results.flatMap((r) => r.status === "fulfilled" ? (r.value.rows ?? []) : []));
  }, [activeMetaAccounts]);

  // ── Sync then reload (slow — hits Snapchat + Visymo + Meta APIs) ──────
  const syncAndReload = useCallback(async (accts: SnapAdAccount[], start: string, end: string, force = true, includeHistorical = true) => {
    if ((accts.length === 0 && activeMetaAccounts.length === 0) || isRefreshing.current) return;
    isRefreshing.current = true;
    setError(null);

    await loadFromDb(accts, start, end);

    setSyncing(true);

    const histStart = dateMinus(start, 3);
    const histEnd = dateMinus(start, 1);

    const snapSyncs = accts.flatMap((a) => {
      const calls: Promise<Response>[] = [
        fetch("/api/reporting/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adAccountId: a.id, startDate: start, endDate: end, timezone: a.timezone, force }),
        }),
      ];
      if (includeHistorical) {
        calls.push(
          fetch("/api/reporting/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adAccountId: a.id, startDate: histStart, endDate: histEnd, timezone: a.timezone, force }),
          })
        );
      }
      return calls;
    });

    const metaSyncs = activeMetaAccounts.flatMap((a) => {
      const calls: Promise<Response>[] = [
        fetch("/api/reporting/meta-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adAccountId: a.id, startDate: start, endDate: end, force }),
        }),
      ];
      if (includeHistorical) {
        calls.push(
          fetch("/api/reporting/meta-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adAccountId: a.id, startDate: histStart, endDate: histEnd, force }),
          })
        );
      }
      return calls;
    });

    await Promise.allSettled([...snapSyncs, ...metaSyncs]);

    setSyncing(false);
    await loadFromDb(accts, start, end);
    setSyncRefreshTrigger((n) => n + 1);
    isRefreshing.current = false;
  }, [loadFromDb, activeMetaAccounts]);

  const loadSquadDetails = useCallback(async (accts: SnapAdAccount[]) => {
    type AccountSquads = {
      accountId: string;
      squads: Array<{
        id: string;
        daily_budget_micro?: number;
        bid_micro?: number;
        status?: "ACTIVE" | "PAUSED";
        campaign_id?: string;
      }>;
    };

    async function fetchSnapOne(a: SnapAdAccount, attempt = 0): Promise<AccountSquads> {
      const r = await fetch(`/api/snapchat/adsquads?adAccountId=${a.id}`);
      if (!r.ok) {
        if (attempt < 2) {
          await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
          return fetchSnapOne(a, attempt + 1);
        }
        throw new Error(`HTTP ${r.status}`);
      }
      const d = await r.json();
      return { accountId: a.id, squads: d.adsquads ?? [] };
    }

    async function fetchMetaOne(accountId: string, attempt = 0): Promise<AccountSquads> {
      const r = await fetch(`/api/meta/adsets?adAccountId=${accountId}`);
      if (!r.ok) {
        if (attempt < 2) {
          await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
          return fetchMetaOne(accountId, attempt + 1);
        }
        throw new Error(`HTTP ${r.status}`);
      }
      const d = await r.json();
      const adSets: Array<{ id: string; daily_budget?: number; bid_amount?: number; status?: string; campaign_id?: string }> = d.adSets ?? [];
      return {
        accountId,
        squads: adSets.map((s) => ({
          id: s.id,
          daily_budget_micro: (s.daily_budget ?? 0) * 10_000,
          bid_micro: (s.bid_amount ?? 0) * 10_000,
          status: (s.status === "ACTIVE" ? "ACTIVE" : "PAUSED") as "ACTIVE" | "PAUSED",
          campaign_id: s.campaign_id,
        })),
      };
    }

    const failedIds: string[] = [];

    if (accts.length > 0) {
      const snapResults = await Promise.allSettled(accts.map((a) => fetchSnapOne(a)));
      setSquadDetails((prev) => {
        const next = new Map(prev);
        for (let i = 0; i < snapResults.length; i++) {
          const r = snapResults[i];
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
    }

    if (activeMetaAccounts.length > 0) {
      const metaResults = await Promise.allSettled(activeMetaAccounts.map((a) => fetchMetaOne(a.id)));
      setSquadDetails((prev) => {
        const next = new Map(prev);
        for (let i = 0; i < metaResults.length; i++) {
          const r = metaResults[i];
          const a = activeMetaAccounts[i];
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
                campaign_id: s.campaign_id,
                business_id: a.business?.id,
              });
            }
          } else {
            failedIds.push(a.id);
            console.error(`[performance] Meta ad set details fetch failed for ${a.id}:`, r.reason);
          }
        }
        return next;
      });
    }

    setSquadDetailsError(
      failedIds.length > 0
        ? `Could not load campaign settings for ${failedIds.length} ad account${failedIds.length === 1 ? "" : "s"} — refresh to retry.`
        : null
    );
  }, [activeMetaAccounts]);

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
    if ((activeAccounts.length > 0 || activeMetaAccounts.length > 0) && !didLoad.current) {
      didLoad.current = true;
      void loadFromDb(activeAccounts, startDate, endDate).then((count) => {
        if (count === 0) {
          // No data at all — seed from APIs.
          void syncAndReload(activeAccounts, startDate, endDate, true);
        } else {
          // Cron-miss safety net: auto-heal if any feed is overdue (>75 min).
          void fetch("/api/reporting/sync-status")
            .then((r) => r.json())
            .then((s: { visymo: { feedLastSynced: string | null }; predicto: { feedLastSynced: string | null } }) => {
              const overdue = (ts: string | null) =>
                ts !== null && (Date.now() - new Date(ts).getTime()) / 60_000 > 75;
              if (overdue(s.visymo.feedLastSynced) || overdue(s.predicto.feedLastSynced)) {
                void syncAndReload(activeAccounts, startDate, endDate, true);
              }
            })
            .catch(() => {});
        }
      });
      void loadLast30Days(activeAccounts);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccounts, activeMetaAccounts]);

  // ── Load squad details after rows populate ─────────────────────────────────
  useEffect(() => {
    if (rows.length > 0 && (activeAccounts.length > 0 || activeMetaAccounts.length > 0)) {
      void loadSquadDetails(activeAccounts);
    }
  }, [rows, activeAccounts, activeMetaAccounts, loadSquadDetails]);


  function handleDateChange(start: string, end: string) {
    setStartDate(start);
    setEndDate(end);
    setSummaryFilter(null);
    void loadFromDb(activeAccounts, start, end).then((count) => {
      if (count === 0) {
        void syncAndReload(activeAccounts, start, end, true);
      }
    });
  }

  function handleManualRefresh() {
    void syncAndReload(activeAccounts, startDate, endDate, true, false);
    void loadLast30Days(activeAccounts);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Performance</h1>
      <p className="text-sm text-gray-500 mb-4">
        Full-funnel metrics — Snapchat &amp; Meta spend joined with Visymo revenue.
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
