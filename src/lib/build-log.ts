import { syncToKV } from "./kv-sync";
import type { BuildLogSession, BuildLogSquad } from "@/types/build-log";

const STORAGE_KEY = "boilerroom_build_log_v1";
const KV_KEY = "br_build_log";
const MAX_SESSIONS = 200;

export function loadBuildLog(): BuildLogSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as BuildLogSession[];
  } catch {
    return [];
  }
}

function saveBuildLog(sessions: BuildLogSession[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  syncToKV(KV_KEY, sessions);
}

export function appendSession(session: BuildLogSession): void {
  const sessions = loadBuildLog();
  const trimmed = [session, ...sessions].slice(0, MAX_SESSIONS);
  saveBuildLog(trimmed);
}

export function updateSquadInLog(
  sessionId: string,
  adSquadSnapId: string,
  patch: Partial<BuildLogSquad>
): void {
  const sessions = loadBuildLog();
  let changed = false;
  const next = sessions.map((s) => {
    if (s.id !== sessionId) return s;
    return {
      ...s,
      squads: s.squads.map((sq) => {
        if (sq.adSquadSnapId !== adSquadSnapId) return sq;
        changed = true;
        return { ...sq, ...patch };
      }),
    };
  });
  if (changed) saveBuildLog(next);
}

export function clearBuildLog(): void {
  saveBuildLog([]);
}
