import { NextRequest, NextResponse } from "next/server";

// Per-IP rate limiting for /api/auth/* endpoints.
// Module-level Map persists within a single Edge runtime instance.
// Not a hard distributed guarantee across Vercel instances, but effective
// against sustained single-IP abuse.
const authRateMap = new Map<string, { count: number; resetAt: number }>();

const AUTH_RATE_LIMIT = 20;        // max requests per window per IP
const AUTH_RATE_WINDOW_MS = 60_000; // 1-minute window

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/auth/")) {
    const key = getClientIp(req);
    const now = Date.now();
    const entry = authRateMap.get(key);

    if (!entry || entry.resetAt < now) {
      authRateMap.set(key, { count: 1, resetAt: now + AUTH_RATE_WINDOW_MS });
    } else {
      entry.count++;
      if (entry.count > AUTH_RATE_LIMIT) {
        return NextResponse.json(
          { error: "too_many_requests" },
          {
            status: 429,
            headers: { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) },
          }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/:path*"],
};
