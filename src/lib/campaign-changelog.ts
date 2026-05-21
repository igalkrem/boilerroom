import { syncToKV } from "./kv-sync";

const STORAGE_KEY = "boilerroom_campaign_changelog_v1";
const KV_KEY = "br_campaign_changelog";
const MAX_ENTRIES = 500;

export interface ChangeLogEntry {
  id: string;
  squadId: string;
  field: "budget" | "bid" | "status";
  oldValue: string;
  newValue: string;
  timestamp: string;
}

export function loadChangelog(): ChangeLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ChangeLogEntry[];
  } catch {
    return [];
  }
}

function saveChangelog(entries: ChangeLogEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  syncToKV(KV_KEY, entries);
}

export function addChangeEntry(entry: Omit<ChangeLogEntry, "id">): void {
  const entries = loadChangelog();
  const newEntry: ChangeLogEntry = { id: crypto.randomUUID(), ...entry };
  const trimmed = [newEntry, ...entries].slice(0, MAX_ENTRIES);
  saveChangelog(trimmed);
}

export function getEntriesForSquad(squadId: string): ChangeLogEntry[] {
  return loadChangelog().filter((e) => e.squadId === squadId);
}
