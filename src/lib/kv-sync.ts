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
    })
      .then((res) => {
        // A rejected write used to be invisible: only network errors reached the
        // catch, so a 413 (payload over MAX_BODY_BYTES) or a 401 returned a
        // resolved promise and localStorage silently diverged from the blob store
        // with no ceiling. Still best-effort — localStorage remains the source of
        // truth for this session — but the divergence is now observable.
        if (!res.ok) {
          console.error(
            `[kv-sync] "${key}" was NOT persisted: HTTP ${res.status}. ` +
              `localStorage is ahead of the server; this device's copy will win until the next successful write.`
          );
        }
      })
      .catch((err) => {
        console.error(`[kv-sync] "${key}" write failed before reaching the server:`, err);
      });
  }, DEBOUNCE_MS);
  timers.set(key, timer);
}
