const TTL_MS = 60 * 60 * 1000; // 1 hour
// Shorter TTL after a failure so a dead upstream is retried soon, but not on every
// single call — combined/drilldown invoke this per request, so an outage previously
// meant one outbound fetch per dashboard load.
const FAILURE_TTL_MS = 60 * 1000;

const FALLBACKS: Record<string, number> = { EUR: 1.08 };

interface Entry { rate: number | null; fetchedAt: number; ttl: number }
const cache = new Map<string, Entry>();

/**
 * Rate to multiply an amount in `currency` by to get USD.
 *
 * Never throws and never returns 0 or undefined: a bad rate would make every ROI
 * either infinite or NaN, which is worse than a stale one. Order of preference is
 * live rate → last known rate → hardcoded fallback → 1.
 */
export async function getRateToUsd(currency: string): Promise<number> {
  const cur = currency.toUpperCase();
  if (cur === "USD") return 1;

  const now = Date.now();
  const hit = cache.get(cur);
  if (hit && hit.rate !== null && now - hit.fetchedAt < hit.ttl) return hit.rate;

  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${cur}&to=USD`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates?: { USD?: number } };
    const rate = data.rates?.USD;
    if (typeof rate !== "number" || !isFinite(rate) || rate <= 0) {
      throw new Error(`unusable rate for ${cur}: ${String(rate)}`);
    }
    cache.set(cur, { rate, fetchedAt: now, ttl: TTL_MS });
    return rate;
  } catch (err) {
    const stale = hit?.rate ?? FALLBACKS[cur] ?? 1;
    // Record the attempt, or an outage re-fetches on every call.
    cache.set(cur, { rate: hit?.rate ?? null, fetchedAt: now, ttl: FAILURE_TTL_MS });
    console.error(`[fx-rate] ${cur}->USD fetch failed, using ${stale}:`, err);
    return stale;
  }
}

export async function getEurToUsd(): Promise<number> {
  return getRateToUsd("EUR");
}
