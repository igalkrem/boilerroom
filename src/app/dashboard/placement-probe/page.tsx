"use client";

import { useState } from "react";
import { useAdAccounts } from "@/hooks/useAdAccounts";

// TEMPORARY diagnostic page for the Smart Placements (placement_v2) investigation.
// Runs a safe, self-cleaning live experiment against a chosen ad account and shows the
// truth table. Delete this page (and /api/debug/placement-probe) once placement is confirmed.

interface TruthRow {
  variant: string;
  created: boolean;
  resolvedPlacement: unknown;
  editableAfterCreate: boolean | null;
  note: string;
}
interface ProbeReport {
  ranAt: string;
  adAccountId: string;
  truthTable: TruthRow[];
  cleanup: { entity: string; id: string; ok: boolean; error: string | null }[];
  results: unknown;
}
interface AmCreateReport {
  campaignId: string;
  squadId: string;
  squadName: string;
  initialEditOk: boolean;
  initialEditError: string | null;
}
interface AmRecheckReport {
  editableAfterAdsManagerChange: boolean;
  editError: string | null;
  resolvedPlacementV2: unknown;
  resolvedPlacementLegacy: unknown;
  cleanup: { entity: string; id: string; ok: boolean; error: string | null }[];
}

export default function PlacementProbePage() {
  const { accounts, isLoading } = useAdAccounts();
  const [adAccountId, setAdAccountId] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<ProbeReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    if (!adAccountId) {
      setErr("Pick an ad account first.");
      return;
    }
    setRunning(true);
    setErr(null);
    setReport(null);
    try {
      const res = await fetch("/api/debug/placement-probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adAccountId,
          pixelId: pixelId.trim() || undefined,
          // Anti-accident guard only — NOT a security control (visible in the client bundle).
          // Real authorization is session + isSnapchatConnected + isAdAccountAllowed on the route.
          confirm: "RUN_PLACEMENT_PROBE",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(`${data.error ?? "failed"}${data.detail ? `: ${data.detail}` : ""}`);
      } else {
        setReport(data as ProbeReport);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  // ── Two-phase "does editing placements in Ads Manager keep API control?" test ──
  const [amRunning, setAmRunning] = useState(false);
  const [amCreate, setAmCreate] = useState<AmCreateReport | null>(null);
  const [amRecheck, setAmRecheck] = useState<AmRecheckReport | null>(null);
  const [amErr, setAmErr] = useState<string | null>(null);

  const amStep1 = async () => {
    if (!adAccountId) {
      setAmErr("Pick an ad account first (top of page).");
      return;
    }
    setAmRunning(true);
    setAmErr(null);
    setAmCreate(null);
    setAmRecheck(null);
    try {
      const res = await fetch("/api/debug/placement-probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId, confirm: "RUN_PLACEMENT_PROBE", mode: "adsmanager-create" }),
      });
      const data = await res.json();
      if (!res.ok) setAmErr(`${data.error ?? "failed"}${data.detail ? `: ${data.detail}` : ""}`);
      else setAmCreate(data as AmCreateReport);
    } catch (e) {
      setAmErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAmRunning(false);
    }
  };

  const amStep2 = async () => {
    if (!amCreate) return;
    setAmRunning(true);
    setAmErr(null);
    setAmRecheck(null);
    try {
      const res = await fetch("/api/debug/placement-probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adAccountId,
          confirm: "RUN_PLACEMENT_PROBE",
          mode: "adsmanager-recheck",
          squadId: amCreate.squadId,
          campaignId: amCreate.campaignId,
        }),
      });
      const data = await res.json();
      if (!res.ok) setAmErr(`${data.error ?? "failed"}${data.detail ? `: ${data.detail}` : ""}`);
      else setAmRecheck(data as AmRecheckReport);
    } catch (e) {
      setAmErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAmRunning(false);
    }
  };

  const fmt = (v: unknown) => (v == null ? "—" : typeof v === "string" ? v : JSON.stringify(v));

  return (
    <div className="mx-auto max-w-3xl p-6 text-gray-100">
      <h1 className="text-xl font-semibold">Smart Placement Probe</h1>
      <p className="mt-2 text-sm text-gray-400">
        Runs a safe live experiment: creates a few <strong>paused</strong> throwaway test ad sets with
        different placement settings, checks whether each gets Smart placement and stays editable, then
        deletes everything. Nothing spends money. Results are also saved to the server logs.
      </p>

      <div className="mt-6 space-y-4 rounded-lg border border-gray-700 bg-[#111827] p-4">
        <label className="block text-sm">
          <span className="text-gray-300">Test ad account</span>
          <select
            className="mt-1 w-full rounded border border-gray-600 bg-gray-800 p-2 text-sm text-gray-100"
            value={adAccountId}
            onChange={(e) => setAdAccountId(e.target.value)}
            disabled={isLoading || running}
          >
            <option value="">{isLoading ? "Loading accounts…" : "— Select an ad account —"}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.id})
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-gray-300">Pixel ID (optional — enables the PIXEL_PURCHASE variant)</span>
          <input
            className="mt-1 w-full rounded border border-gray-600 bg-gray-800 p-2 text-sm text-gray-100"
            value={pixelId}
            onChange={(e) => setPixelId(e.target.value)}
            placeholder="Leave blank to skip"
            disabled={running}
          />
        </label>

        <button
          onClick={run}
          disabled={running || !adAccountId}
          className="rounded bg-yellow-500 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-400 disabled:opacity-50"
        >
          {running ? "Running probe…" : "Run placement probe"}
        </button>

        {err && <p className="text-sm text-red-400">Error: {err}</p>}
      </div>

      {report && (
        <div className="mt-6 space-y-4">
          <div className="overflow-x-auto rounded-lg border border-gray-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-800 text-gray-300">
                <tr>
                  <th className="p-2">Variant</th>
                  <th className="p-2">Created?</th>
                  <th className="p-2">Resolved placement</th>
                  <th className="p-2">Editable after?</th>
                  <th className="p-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {report.truthTable.map((r) => (
                  <tr key={r.variant} className="border-t border-gray-700">
                    <td className="p-2 font-mono text-xs">{r.variant}</td>
                    <td className="p-2">{r.created ? "✅" : "❌"}</td>
                    <td className="p-2 font-mono text-xs">{fmt(r.resolvedPlacement)}</td>
                    <td className="p-2">
                      {r.editableAfterCreate === null ? "—" : r.editableAfterCreate ? "✅ editable" : "🔒 frozen"}
                    </td>
                    <td className="p-2 text-xs text-gray-400">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-500">
            Cleanup:{" "}
            {report.cleanup.every((c) => c.ok)
              ? "✅ all test entities deleted"
              : `⚠ some entities may remain — ${report.cleanup.filter((c) => !c.ok).map((c) => `${c.entity} ${c.id}`).join(", ")}`}
          </p>

          <details className="rounded-lg border border-gray-700 bg-[#111827] p-3">
            <summary className="cursor-pointer text-sm text-gray-300">Raw report (JSON)</summary>
            <pre className="mt-2 overflow-x-auto text-xs text-gray-400">{JSON.stringify(report, null, 2)}</pre>
          </details>
        </div>
      )}

      {/* ── Two-phase Ads Manager test ─────────────────────────────────────── */}
      <div className="mt-10 space-y-4 rounded-lg border border-sky-700/60 bg-sky-900/10 p-4">
        <div>
          <h2 className="text-lg font-semibold">Advanced: does editing placements in Ads Manager keep in-app control?</h2>
          <p className="mt-1 text-sm text-gray-400">
            Tests whether broadening placements in Snapchat Ads Manager (not via this app) leaves an ad set still
            editable from here. Uses the ad account selected above. Creates one paused test ad set you edit in
            Ads Manager, then deletes it.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={amStep1}
            disabled={amRunning || !adAccountId}
            className="rounded bg-sky-500 px-4 py-2 text-sm font-semibold text-black hover:bg-sky-400 disabled:opacity-50"
          >
            {amRunning && !amCreate ? "Creating…" : "Step 1 — create test ad set"}
          </button>
          <button
            onClick={amStep2}
            disabled={amRunning || !amCreate}
            className="rounded bg-sky-500 px-4 py-2 text-sm font-semibold text-black hover:bg-sky-400 disabled:opacity-50"
          >
            {amRunning && amCreate ? "Re-checking…" : "Step 2 — re-check API control"}
          </button>
        </div>

        {amErr && <p className="text-sm text-red-400">Error: {amErr}</p>}

        {amCreate && (
          <div className="rounded border border-gray-700 bg-[#111827] p-3 text-sm">
            <p className="text-gray-200">
              ✅ Test ad set created and confirmed editable ({amCreate.initialEditOk ? "budget edit succeeded" : `budget edit FAILED: ${amCreate.initialEditError}`}).
            </p>
            <p className="mt-2 text-gray-300">Now, in <span className="font-medium">Snapchat Ads Manager</span>:</p>
            <ol className="ml-5 mt-1 list-decimal space-y-0.5 text-gray-400">
              <li>Find the paused ad set named <code className="text-sky-300">{amCreate.squadName}</code></li>
              <li>Open its <span className="font-medium">Placements</span> and add/change the placements you want, then <span className="font-medium">Save</span>.</li>
              <li>Come back here and click <span className="font-medium">Step 2</span>.</li>
            </ol>
            <p className="mt-2 text-xs text-gray-500">Ad set ID: <code>{amCreate.squadId}</code></p>
          </div>
        )}

        {amRecheck && (
          <div className="rounded border border-gray-700 bg-[#111827] p-3 text-sm space-y-2">
            <p className={amRecheck.editableAfterAdsManagerChange ? "text-green-400" : "text-amber-400"}>
              {amRecheck.editableAfterAdsManagerChange
                ? "✅ STILL EDITABLE — after changing placements in Ads Manager, the app could still edit the budget. This workflow is viable."
                : `🔒 NOW LOCKED — after the Ads Manager change, the app can no longer edit it (${amRecheck.editError}). Ads-Manager edits do NOT preserve in-app control.`}
            </p>
            <p className="text-xs text-gray-400 font-mono">
              resolved placement_v2: {fmt(amRecheck.resolvedPlacementV2)} · legacy: {fmt(amRecheck.resolvedPlacementLegacy)}
            </p>
            <p className="text-xs text-gray-500">
              Cleanup:{" "}
              {amRecheck.cleanup.every((c) => c.ok)
                ? "✅ test ad set + campaign deleted"
                : `⚠ check Ads Manager — ${amRecheck.cleanup.filter((c) => !c.ok).map((c) => `${c.entity} ${c.id}`).join(", ")}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
