// Simple token-bucket rate limiter: max 10 req/s per Snapchat API limit.
// Works within a single Node.js process.

const MAX_RPS = parseInt(process.env.SNAPCHAT_RATE_LIMIT_RPS ?? "10", 10);
const INTERVAL_MS = 1000 / MAX_RPS;

let lastCallTime = 0;

export async function rateLimitedCall<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const wait = Math.max(0, INTERVAL_MS - (now - lastCallTime));
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastCallTime = Date.now();
  return fn();
}
