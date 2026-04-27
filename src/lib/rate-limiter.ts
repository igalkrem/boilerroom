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

// Wraps a fetch call with rate limiting + exponential-backoff retry on 429.
// Snapchat multipart upload routes run in separate serverless function instances
// so the process-local rate limiter above doesn't prevent cross-instance bursts.
export async function rateLimitedFetch(
  fn: () => Promise<Response>,
  maxRetries = 4
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s, 8s, 16s
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
    const res = await rateLimitedCall(fn);
    if (res.status !== 429) return res;
  }
  // Final attempt — return whatever we get
  return rateLimitedCall(fn);
}
