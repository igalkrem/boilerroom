"use client";

import { useEffect, useMemo, useState } from "react";
import { loadBuildLog, updateSquadInLog, clearBuildLog } from "@/lib/build-log";
import { hydrateFromKV } from "@/lib/kv-sync";
import type { BuildLogSession, BuildLogSquad } from "@/types/build-log";

function fmtDollars(micro?: number): string {
  if (micro == null) return "—";
  return `$${(micro / 1_000_000).toFixed(2)}`;
}

function fmtSessionHeader(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${date} — ${time}`;
  } catch {
    return iso;
  }
}

function fmtHHMM(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "--:--";
  }
}

function fmtHHMMSS(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  } catch {
    return "--:--:--";
  }
}

type SessionStatus = "success" | "partial" | "failed";
function sessionStatus(s: BuildLogSession): SessionStatus {
  const failed = s.squads.filter((sq) => sq.error || !sq.adSquadSnapId).length;
  if (failed === 0) return "success";
  if (failed === s.squads.length) return "failed";
  return "partial";
}

export default function BuildLogPage() {
  const [sessions, setSessions] = useState<BuildLogSession[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const local = loadBuildLog();
    setSessions(local);
    if (local.length > 0) {
      setExpandedIds(new Set([local[0].id]));
    }
    setHydrated(true);

    // Hydrate from KV — merge if remote has more sessions
    (async () => {
      try {
        const remote = await hydrateFromKV("br_build_log");
        if (Array.isArray(remote)) {
          const remoteSessions = remote as BuildLogSession[];
          if (remoteSessions.length > local.length) {
            // Merge unique by id, remote wins
            const byId = new Map<string, BuildLogSession>();
            for (const s of local) byId.set(s.id, s);
            for (const s of remoteSessions) byId.set(s.id, s);
            const merged = Array.from(byId.values()).sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
            setSessions(merged);
            if (merged.length > 0) setExpandedIds(new Set([merged[0].id]));
            try {
              localStorage.setItem("boilerroom_build_log_v1", JSON.stringify(merged));
            } catch {}
          }
        }
      } catch {}
    })();
  }, []);

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleClearAll() {
    if (!confirm("Clear all build log entries? This cannot be undone.")) return;
    clearBuildLog();
    setSessions([]);
    setExpandedIds(new Set());
  }

  function reloadFromStorage() {
    const fresh = loadBuildLog();
    setSessions(fresh);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto text-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Build Log</h1>
        {sessions.length > 0 && (
          <button
            onClick={handleClearAll}
            className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-red-900/40 text-gray-300 hover:text-red-300 border border-gray-700 hover:border-red-800 transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      {hydrated && sessions.length === 0 && (
        <div className="text-center py-24 text-gray-500">
          No builds yet. Launch a campaign from the canvas to see it here.
        </div>
      )}

      {sessions.length > 0 && (
        <div className="relative">
          <div className="grid" style={{ gridTemplateColumns: "80px 1fr" }}>
            {/* Timeline spine spans full grid height via border-left on left column */}
            {sessions.map((session, idx) => (
              <SessionRow
                key={session.id}
                session={session}
                expanded={expandedIds.has(session.id)}
                onToggle={() => toggleExpanded(session.id)}
                onSquadUpdated={reloadFromStorage}
                isLast={idx === sessions.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session,
  expanded,
  onToggle,
  onSquadUpdated,
  isLast,
}: {
  session: BuildLogSession;
  expanded: boolean;
  onToggle: () => void;
  onSquadUpdated: () => void;
  isLast: boolean;
}) {
  const status = sessionStatus(session);
  const dotColor =
    status === "success" ? "bg-green-500" : status === "partial" ? "bg-amber-500" : "bg-red-500";
  const badge =
    status === "success"
      ? { text: "All OK", cls: "bg-green-900/40 text-green-300 border-green-800" }
      : status === "partial"
      ? { text: "Partial", cls: "bg-amber-900/40 text-amber-300 border-amber-800" }
      : { text: "Failed", cls: "bg-red-900/40 text-red-300 border-red-800" };

  return (
    <>
      {/* Timeline column */}
      <div className={`relative flex flex-col items-center pt-4 ${!isLast || expanded ? "pb-4" : ""}`}>
        {/* Vertical line */}
        <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-0.5 bg-gray-700" />
        {/* Dot */}
        <div className={`relative z-10 w-3 h-3 rounded-full ${dotColor} ring-4 ring-gray-950`} />
        <div className="relative z-10 mt-2 text-xs font-mono text-gray-400">{fmtHHMM(session.timestamp)}</div>
      </div>

      {/* Content column */}
      <div className="pt-2 pb-6 pl-4">
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-3 text-left px-4 py-3 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 transition-colors"
        >
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? "rotate-90" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-gray-200">{fmtSessionHeader(session.timestamp)}</span>
          <span className="text-xs text-gray-500">
            {session.squads.length} squad{session.squads.length !== 1 ? "s" : ""}
          </span>
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.text}</span>
        </button>

        {expanded && (
          <div className="mt-3 rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-900/60 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Time</th>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Budget</th>
                  <th className="text-left px-3 py-2 font-medium">Bid</th>
                  <th className="text-right px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {session.squads.map((sq, i) => (
                  <SquadRow
                    key={`${session.id}-${sq.adSquadSnapId || i}`}
                    sessionId={session.id}
                    squad={sq}
                    onUpdated={onSquadUpdated}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function SquadRow({
  sessionId,
  squad,
  onUpdated,
}: {
  sessionId: string;
  squad: BuildLogSquad;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState<null | "budget" | "bid">(null);
  const [inputValue, setInputValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isFailed = !!squad.error || !squad.adSquadSnapId;
  const isDeleted = squad.status === "DELETED";
  const isPaused = squad.status === "PAUSED";
  const disabled = isFailed || isDeleted || busy;

  const nameCls = useMemo(() => {
    if (isDeleted) return "line-through text-gray-500";
    if (isFailed) return "text-red-400";
    return "text-gray-200";
  }, [isDeleted, isFailed]);

  const rowOpacity = isDeleted ? "opacity-40" : "";

  async function saveField(field: "budget" | "bid") {
    const dollars = parseFloat(inputValue);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError("Enter a positive number");
      return;
    }
    const micro = Math.round(dollars * 1_000_000);
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        adAccountId: squad.adAccountId,
        squadId: squad.adSquadSnapId,
      };
      if (field === "budget") body.daily_budget_micro = micro;
      else body.bid_micro = micro;
      const res = await fetch("/api/snapchat/adsquads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(j.message ?? j.error ?? "Update failed");
      }
      const patch: Partial<BuildLogSquad> =
        field === "budget" ? { budgetMicro: micro } : { bidMicro: micro };
      updateSquadInLog(sessionId, squad.adSquadSnapId, patch);
      setEditing(null);
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    const nextStatus: "ACTIVE" | "PAUSED" = isPaused ? "ACTIVE" : "PAUSED";
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/snapchat/adsquads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adAccountId: squad.adAccountId,
          squadId: squad.adSquadSnapId,
          status: nextStatus,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(j.message ?? j.error ?? "Update failed");
      }
      updateSquadInLog(sessionId, squad.adSquadSnapId, { status: nextStatus });
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/snapchat/adsquads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adAccountId: squad.adAccountId,
          squadId: squad.adSquadSnapId,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(j.message ?? j.error ?? "Delete failed");
      }
      updateSquadInLog(sessionId, squad.adSquadSnapId, { status: "DELETED" });
      setConfirmingDelete(false);
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (isFailed) {
    return (
      <tr className="border-t border-gray-800 bg-red-950/20">
        <td className="px-3 py-2 text-xs font-mono text-gray-500">{fmtHHMMSS(squad.timestamp)}</td>
        <td className="px-3 py-2" colSpan={5}>
          <span className="text-red-400 font-medium">✗ </span>
          <span className="text-gray-300">{squad.adSquadName || squad.campaignName || "(no name)"}</span>
          {squad.error && <span className="text-red-400 ml-2 text-xs">— {squad.error}</span>}
        </td>
      </tr>
    );
  }

  return (
    <tr className={`border-t border-gray-800 ${rowOpacity}`}>
      <td className="px-3 py-2 text-xs font-mono text-gray-500 whitespace-nowrap">
        {fmtHHMMSS(squad.timestamp)}
      </td>
      <td className="px-3 py-2">
        <div className={`font-medium ${nameCls}`}>{squad.adSquadName}</div>
        <div className="text-xs text-gray-500">
          {squad.creativeCount} creative{squad.creativeCount !== 1 ? "s" : ""} · {squad.adCount} ad
          {squad.adCount !== 1 ? "s" : ""}
        </div>
      </td>
      <td className="px-3 py-2">
        {isDeleted ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/40 text-red-300 border border-red-800 line-through">
            ✗ Deleted
          </span>
        ) : isPaused ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/40 text-yellow-300 border border-yellow-800">
            ⏸ Paused
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-300 border border-green-800">
            ● Active
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        {editing === "budget" ? (
          <input
            type="number"
            step="0.01"
            min="0"
            autoFocus
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={() => (inputValue ? saveField("budget") : setEditing(null))}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveField("budget");
              if (e.key === "Escape") {
                setEditing(null);
                setError(null);
              }
            }}
            disabled={busy}
            className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
          />
        ) : (
          <button
            disabled={disabled}
            onClick={() => {
              setInputValue(squad.budgetMicro != null ? (squad.budgetMicro / 1_000_000).toFixed(2) : "");
              setEditing("budget");
            }}
            className="group inline-flex items-center gap-1 text-gray-200 hover:text-white disabled:cursor-not-allowed disabled:hover:text-gray-200"
          >
            <span className="font-mono text-sm">{fmtDollars(squad.budgetMicro)}</span>
            {!disabled && (
              <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            )}
          </button>
        )}
      </td>
      <td className="px-3 py-2">
        {editing === "bid" ? (
          <input
            type="number"
            step="0.01"
            min="0"
            autoFocus
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={() => (inputValue ? saveField("bid") : setEditing(null))}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveField("bid");
              if (e.key === "Escape") {
                setEditing(null);
                setError(null);
              }
            }}
            disabled={busy}
            className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
          />
        ) : (
          <button
            disabled={disabled}
            onClick={() => {
              setInputValue(squad.bidMicro != null ? (squad.bidMicro / 1_000_000).toFixed(2) : "");
              setEditing("bid");
            }}
            className="group inline-flex items-center gap-1 text-gray-200 hover:text-white disabled:cursor-not-allowed disabled:hover:text-gray-200"
          >
            <span className="font-mono text-sm">{fmtDollars(squad.bidMicro)}</span>
            {!disabled && (
              <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            )}
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {confirmingDelete ? (
          <div className="inline-flex items-center gap-2 text-xs">
            <span className="text-gray-300">Delete from Snapchat?</span>
            <button
              disabled={busy}
              onClick={handleDelete}
              className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white"
            >
              Yes
            </button>
            <button
              disabled={busy}
              onClick={() => setConfirmingDelete(false)}
              className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2">
            <button
              disabled={disabled}
              onClick={toggleStatus}
              title={isPaused ? "Activate" : "Pause"}
              className="w-7 h-7 rounded flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isPaused ? "▶" : "⏸"}
            </button>
            <button
              disabled={disabled}
              onClick={() => setConfirmingDelete(true)}
              title="Delete"
              className="w-7 h-7 rounded flex items-center justify-center bg-gray-800 hover:bg-red-900/40 text-gray-300 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V4a2 2 0 012-2h4a2 2 0 012 2v3" />
              </svg>
            </button>
          </div>
        )}
        {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
      </td>
    </tr>
  );
}
