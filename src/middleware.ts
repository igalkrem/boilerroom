import { NextRequest, NextResponse } from "next/server";

// Per-IP rate limiting. Module-level Map persists within a single Edge runtime
// instance — not a distributed guarantee across Vercel instances, but effective
// against sustained single-IP abuse, which is the realistic threat here.
//
// Previously this covered /api/auth/* only, leaving every expensive endpoint
// unmetered: native FFmpeg at 300 s, third-party sync fan-out, in-memory zipping,
// and unbounded blob writes. Those are cost-amplification targets, not just DoS.
const rateMap = new Map<string, { count: number; resetAt: number }>();

interface Bucket {
  prefix: string;
  limit: number;
  windowMs: number;
}

// ORDER MATTERS — the first matching prefix wins, so list specific before general.
// Two collisions to preserve if you edit this:
//   - "/api/reporting/sync" is a prefix of "/api/reporting/sync-status", and
//     sync-status is a cheap UI poll from SyncStatusBar, not a sync trigger.
//   - "/api/meta/debug/" must precede any general "/api/meta/" bucket.
const BUCKETS: Bucket[] = [
  // Diagnostics create real ad objects. Also gated by ENABLE_DEBUG_ROUTES.
  { prefix: "/api/debug/", limit: 3, windowMs: 300_000 },
  { prefix: "/api/meta/debug/", limit: 3, windowMs: 300_000 },

  // Native FFmpeg on untrusted media, maxDuration 300.
  { prefix: "/api/silo/transcode", limit: 5, windowMs: 60_000 },

  // Zips up to MAX_ADS × MAX_MEDIA_ITEMS in memory, maxDuration 120.
  { prefix: "/api/meta/ad-media", limit: 10, windowMs: 60_000 },
  { prefix: "/api/meta/ad-limits", limit: 15, windowMs: 60_000 },
  { prefix: "/api/meta/page-ad-counts", limit: 20, windowMs: 60_000 },

  // Third-party fan-out at maxDuration 300. sync-status is listed FIRST because
  // it shares the "sync" prefix but is a cheap read the dashboard polls on mount.
  { prefix: "/api/reporting/sync-status", limit: 60, windowMs: 60_000 },
  { prefix: "/api/reporting/meta-sync", limit: 20, windowMs: 60_000 },
  { prefix: "/api/reporting/sync", limit: 20, windowMs: 60_000 },

  { prefix: "/api/auth/", limit: 20, windowMs: 60_000 },

  // Chunked upload sends 4 MB per request (Vercel's 4.5 MB payload ceiling), so one
  // 500 MB video is ~125 requests and a multi-video launch legitimately runs into
  // the hundreds. Bounded well above real usage rather than tightly — a false 429
  // here corrupts an in-flight upload.
  { prefix: "/api/snapchat/media/upload-chunk", limit: 600, windowMs: 60_000 },

  { prefix: "/api/silo/upload", limit: 60, windowMs: 60_000 },
  { prefix: "/api/catalogue/upload", limit: 60, windowMs: 60_000 },
  { prefix: "/api/data", limit: 120, windowMs: 60_000 },
];

// SEC-26: CSRF protection rested entirely on the session cookie's SameSite=lax.
// Lax still permits a cross-site top-level POST navigation, and covers nothing if a
// future change relaxes it, so check the Origin on state-changing methods too.
//
// Deliberately only rejects a PRESENT-and-mismatched Origin. A missing Origin is not
// treated as hostile: some clients omit it on same-origin requests, and failing closed
// there would break them for no gain — a cross-site browser POST always sends one.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isCrossSiteWrite(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  // Compare against the forwarded host: behind Vercel's proxy nextUrl.host can be an
  // internal hostname that would never equal the browser-visible origin.
  const expected = req.headers.get("x-forwarded-host") ?? req.nextUrl.host;
  try {
    return new URL(origin).host !== expected;
  } catch {
    return true; // unparseable Origin header — not something a normal client sends
  }
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Vercel Cron is the only caller and it is authenticated by CRON_SECRET. A false
  // 429 here means every tenant's reporting silently goes stale, which is a worse
  // outcome than anything the limit would prevent. No bucket matches it today; this
  // guard keeps that true if someone later adds a broad /api/reporting/ bucket.
  if (path === "/api/reporting/cron-sync") return NextResponse.next();

  // Runs for every /api/* path in the matcher, not just rate-limited ones.
  if (isCrossSiteWrite(req)) {
    return NextResponse.json({ error: "cross_site_request_blocked" }, { status: 403 });
  }

  const bucket = BUCKETS.find((b) => path.startsWith(b.prefix));
  if (!bucket) return NextResponse.next();

  // Key on the bucket, not the raw path, so ids in the path cannot be varied to
  // mint a fresh allowance.
  const key = `${bucket.prefix}|${getClientIp(req)}`;
  const now = Date.now();
  const entry = rateMap.get(key);

  if (!entry || entry.resetAt < now) {
    rateMap.set(key, { count: 1, resetAt: now + bucket.windowMs });
  } else {
    entry.count++;
    if (entry.count > bucket.limit) {
      return NextResponse.json(
        { error: "too_many_requests" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) },
        }
      );
    }
  }

  // The Map is per-instance and otherwise grows without bound.
  if (rateMap.size > 10_000) {
    for (const [k, v] of rateMap) if (v.resetAt < now) rateMap.delete(k);
  }

  return NextResponse.next();
}

// All of /api/* — broader than BUCKETS on purpose. Paths with no matching bucket fall
// straight through the rate limiter, but they still get the SEC-26 Origin check, which
// only works if the middleware actually runs for them. The previous narrower list left
// /api/feed-providers/*, /api/presets/* and others with no CSRF guard at all.
export const config = {
  matcher: ["/api/:path*"],
};
