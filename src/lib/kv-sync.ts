const DEBOUNCE_MS = 1500;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export async function hydrateFromKV(key: string): Promise<unknown> {
  try {
    const res = await fetch(`/api/data?key=${encodeURIComponent(key)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function syncToKV(key: string, data: unknown): void {
  if (typeof window === "undefined") return;
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    timers.delete(key);
    fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, data }),
    }).catch(() => {
      // best-effort — localStorage is source of truth in this session
    });
  }, DEBOUNCE_MS);
  timers.set(key, timer);
}
