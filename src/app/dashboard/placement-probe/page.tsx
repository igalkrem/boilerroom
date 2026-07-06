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
    </div>
  );
}
