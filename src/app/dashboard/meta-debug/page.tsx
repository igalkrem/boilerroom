"use client";

import { useState } from "react";
import { useMetaAdAccounts } from "@/hooks/useMetaAdAccounts";
import { useMetaAdLimits } from "@/hooks/useMetaAdLimits";

// TEMPORARY diagnostic page: replays campaign -> ad set -> creative -> ad
// creation server-side via /api/meta/debug/test-launch, so a launch failure
// can be reproduced/iterated on without relaunching the full wizard. Uses your
// own logged-in session only. Everything created is PAUSED — delete the
// resulting "ZZZ_DEBUG_TEST*" campaign in Ads Manager when done.
// Delete this page (and the API route) once the Meta launch issues are resolved.

interface TestLaunchReport {
  steps: Record<string, unknown>;
  campaignId?: string;
  adSetId?: string;
  creativeId?: string;
  cleanupHint?: string;
  error?: string;
  detail?: string;
}

export default function MetaDebugPage() {
  const { accounts, isLoading: accountsLoading } = useMetaAdAccounts();
  const { pages, isLoading: pagesLoading } = useMetaAdLimits();
  const [adAccountId, setAdAccountId] = useState("");
  const [pageId, setPageId] = useState("");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<TestLaunchReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    if (!adAccountId || !pageId) {
      setErr("Pick an ad account and a page first.");
      return;
    }
    setRunning(true);
    setErr(null);
    setReport(null);
    try {
      const res = await fetch("/api/meta/debug/test-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId, pageId }),
      });
      const data = await res.json();
      setReport(data as TestLaunchReport);
      if (!res.ok && !data.steps) {
        setErr(`${data.error ?? "failed"}${data.detail ? `: ${data.detail}` : ""}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto text-gray-100">
      <h1 className="text-xl font-semibold mb-2">Meta Test Launch (debug)</h1>
      <p className="text-sm text-gray-400 mb-6">
        Runs the campaign → ad set → creative → ad sequence directly, using your session.
        Everything created is PAUSED and named &quot;ZZZ_DEBUG_TEST*&quot; for easy manual cleanup.
      </p>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm mb-1">Ad Account</label>
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2"
            value={adAccountId}
            onChange={(e) => setAdAccountId(e.target.value)}
            disabled={accountsLoading}
          >
            <option value="">Select…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.id})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">Facebook Page</label>
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2"
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            disabled={pagesLoading}
          >
            <option value="">Select…</option>
            {pages.map((p) => (
              <option key={p.pageId} value={p.pageId}>
                {p.name} ({p.pageId}){p.instagramActorId ? " — IG cached" : ""}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={run}
          disabled={running || !adAccountId || !pageId}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded"
        >
          {running ? "Running…" : "Run Test Launch"}
        </button>
      </div>

      {err && <div className="text-red-400 mb-4">{err}</div>}

      {report && (
        <div>
          {report.cleanupHint && (
            <div className="text-yellow-400 text-sm mb-3">{report.cleanupHint}</div>
          )}
          <pre className="bg-gray-900 border border-gray-700 rounded p-4 text-xs overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(report, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
