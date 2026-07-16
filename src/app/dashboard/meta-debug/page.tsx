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

// Campaign IDs created while debugging the instagram_actor_id issue on
// act_1549356156312143 — all PAUSED, named "ZZZ_DEBUG_TEST*". Remove this
// list (and the button using it) once cleaned up.
const KNOWN_TEST_CAMPAIGN_IDS = [
  "120252843390680745",
  "120252843474800745",
  "120252843750620745",
  "120252846224570745",
  "120252846396230745",
];
const KNOWN_TEST_AD_ACCOUNT_ID = "act_1549356156312143";

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(getText());
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export default function MetaDebugPage() {
  const { accounts, isLoading: accountsLoading } = useMetaAdAccounts();
  const { pages, isLoading: pagesLoading } = useMetaAdLimits();
  const [adAccountId, setAdAccountId] = useState("act_1549356156312143");
  const [pageId, setPageId] = useState("927549190441376");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<TestLaunchReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<Record<string, { ok: boolean; error?: string }> | null>(null);
  const [inspectAdId, setInspectAdId] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const [inspectResult, setInspectResult] = useState<unknown>(null);
  const [inspectAdSetId, setInspectAdSetId] = useState("");
  const [inspectingAdSet, setInspectingAdSet] = useState(false);
  const [inspectAdSetResult, setInspectAdSetResult] = useState<unknown>(null);

  const inspectAd = async () => {
    if (!inspectAdId) return;
    setInspecting(true);
    setInspectResult(null);
    try {
      const res = await fetch(`/api/meta/ads?adId=${encodeURIComponent(inspectAdId)}`);
      const data = await res.json();
      setInspectResult(data);
    } catch (e) {
      setInspectResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setInspecting(false);
    }
  };

  const inspectAdSet = async () => {
    if (!inspectAdSetId) return;
    setInspectingAdSet(true);
    setInspectAdSetResult(null);
    try {
      const res = await fetch(`/api/meta/adsets?adSetId=${encodeURIComponent(inspectAdSetId)}`);
      const data = await res.json();
      setInspectAdSetResult(data);
    } catch (e) {
      setInspectAdSetResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setInspectingAdSet(false);
    }
  };

  const cleanup = async () => {
    setCleaningUp(true);
    setCleanupResult(null);
    try {
      const res = await fetch("/api/meta/debug/test-launch", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId: KNOWN_TEST_AD_ACCOUNT_ID, campaignIds: KNOWN_TEST_CAMPAIGN_IDS }),
      });
      const data = await res.json();
      setCleanupResult(data.results ?? { _error: { ok: false, error: data.error ?? "failed" } });
    } catch (e) {
      setCleanupResult({ _error: { ok: false, error: e instanceof Error ? e.message : String(e) } });
    } finally {
      setCleaningUp(false);
    }
  };

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

      <div className="mb-6 pt-4 border-t border-gray-700">
        <p className="text-sm text-gray-400 mb-2">
          Delete the {KNOWN_TEST_CAMPAIGN_IDS.length} known ZZZ_DEBUG_TEST* campaigns from this debugging session
          ({KNOWN_TEST_AD_ACCOUNT_ID}).
        </p>
        <button
          onClick={cleanup}
          disabled={cleaningUp}
          className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2 rounded"
        >
          {cleaningUp ? "Deleting…" : "Delete test campaigns"}
        </button>
        {cleanupResult && (
          <div className="mt-3">
            <div className="flex justify-end mb-1">
              <CopyButton getText={() => JSON.stringify(cleanupResult, null, 2)} />
            </div>
            <pre className="bg-gray-900 border border-gray-700 rounded p-4 text-xs overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(cleanupResult, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div className="mb-6 pt-4 border-t border-gray-700">
        <p className="text-sm text-gray-400 mb-2">
          Inspect a live ad (returns the ad + its creative, including asset_feed_spec /
          degrees_of_freedom_spec for Flexible-format ads).
        </p>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2"
            placeholder="Ad ID, e.g. 120251719284310745"
            value={inspectAdId}
            onChange={(e) => setInspectAdId(e.target.value)}
          />
          <button
            onClick={inspectAd}
            disabled={inspecting || !inspectAdId}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-4 py-2 rounded"
          >
            {inspecting ? "Inspecting…" : "Inspect Ad"}
          </button>
        </div>
        {inspectResult != null && (
          <div className="mt-3">
            <div className="flex justify-end mb-1">
              <CopyButton getText={() => JSON.stringify(inspectResult, null, 2)} />
            </div>
            <pre className="bg-gray-900 border border-gray-700 rounded p-4 text-xs overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(inspectResult, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div className="mb-6 pt-4 border-t border-gray-700">
        <p className="text-sm text-gray-400 mb-2">
          Inspect an ad set — returns is_dynamic_creative, optimization_goal, bid_strategy, and
          other fields to compare reference vs. test ad sets.
        </p>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2"
            placeholder="Ad Set ID, e.g. 120251719276040745"
            value={inspectAdSetId}
            onChange={(e) => setInspectAdSetId(e.target.value)}
          />
          <button
            onClick={inspectAdSet}
            disabled={inspectingAdSet || !inspectAdSetId}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-4 py-2 rounded"
          >
            {inspectingAdSet ? "Inspecting…" : "Inspect Ad Set"}
          </button>
        </div>
        {inspectAdSetResult != null && (
          <div className="mt-3">
            <div className="flex justify-end mb-1">
              <CopyButton getText={() => JSON.stringify(inspectAdSetResult, null, 2)} />
            </div>
            <pre className="bg-gray-900 border border-gray-700 rounded p-4 text-xs overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(inspectAdSetResult, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {err && <div className="text-red-400 mb-4">{err}</div>}

      {report && (
        <div>
          {report.cleanupHint && (
            <div className="text-yellow-400 text-sm mb-3">{report.cleanupHint}</div>
          )}
          <div className="flex justify-end mb-1">
            <CopyButton getText={() => JSON.stringify(report, null, 2)} />
          </div>
          <pre className="bg-gray-900 border border-gray-700 rounded p-4 text-xs overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(report, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
