let cachedRate: number | null = null;
let lastFetched = 0;
const TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getEurToUsd(): Promise<number> {
  const now = Date.now();
  if (cachedRate !== null && now - lastFetched < TTL_MS) return cachedRate;

  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=USD", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { rates: { USD: number } };
    cachedRate = data.rates.USD;
    lastFetched = now;
    return cachedRate;
  } catch (err) {
    console.error("[fx-rate] fetch failed, using fallback 1.08:", err);
    return cachedRate ?? 1.08;
  }
}
