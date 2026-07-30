import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getSession } from "@/lib/session";
import { getAllUserTokens, getAllUserMetaTokens } from "@/lib/db";
import { refreshAccessToken } from "@/lib/snapchat/auth";

// Local-only session bootstrap. Google OAuth cannot complete against localhost
// (no GOOGLE_* creds in .env.local, and the callback host is registered for the
// deployed origin only), which made every dashboard page unreachable in dev —
// including for automated browser verification. This mints the same session the
// real callbacks would, using credentials already persisted in the DB.
//
// Two independent gates, both required:
//   1. NODE_ENV !== "production" — the route 404s in any production build.
//   2. DEV_LOGIN_SECRET (≥32 chars, .env.local only, never set on Vercel).
// It never accepts a caller-supplied identity: the user is taken from
// DEV_LOGIN_GOOGLE_USER_ID, or inferred when exactly one user row exists.

const SNAPCHAT_API_BASE = "https://adsapi.snapchat.com/v1";

const notFound = () => new NextResponse("Not Found", { status: 404 });

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return notFound();

  const expected = process.env.DEV_LOGIN_SECRET;
  if (!expected || expected.length < 32) return notFound();

  const provided = request.nextUrl.searchParams.get("secret") ?? "";
  if (!secretMatches(provided, expected)) return notFound();

  const snapRows = await getAllUserTokens();
  const configuredUserId = process.env.DEV_LOGIN_GOOGLE_USER_ID;
  const googleUserId =
    configuredUserId ?? (snapRows.length === 1 ? snapRows[0].google_user_id : undefined);

  if (!googleUserId) {
    return NextResponse.json(
      {
        error: "ambiguous_user",
        message:
          "Set DEV_LOGIN_GOOGLE_USER_ID in .env.local — more than one (or zero) user rows exist.",
        candidates: snapRows.map((r) => r.google_user_id),
      },
      { status: 400 }
    );
  }

  const session = await getSession();
  session.googleUserId = googleUserId;
  session.googleEmail = process.env.DEV_LOGIN_EMAIL ?? "dev@adcore.com";
  session.googleName = "Dev Session";

  // ── Snapchat ──────────────────────────────────────────────────────────────
  // Non-fatal: a dev session without Snap still renders every DB-backed page.
  const snapRow = snapRows.find((r) => r.google_user_id === googleUserId);
  if (snapRow) {
    try {
      const tokens = await refreshAccessToken(snapRow.refresh_token);
      session.snapAccessToken = tokens.access_token;
      session.snapRefreshToken = tokens.refresh_token || snapRow.refresh_token;
      session.snapExpiresAt = Date.now() + tokens.expires_in * 1000;
      session.allowedAdAccountIds = snapRow.ad_account_ids.map((a) => a.id);

      // isSnapchatConnected() requires snapUserId, so mirror the callback's /me fetch.
      const meRes = await fetch(`${SNAPCHAT_API_BASE}/me`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (meRes.ok) {
        const meData = (await meRes.json()) as { me?: { id?: string } };
        if (meData.me?.id) session.snapUserId = meData.me.id;
      }
    } catch (e) {
      console.warn("[auth/dev-login] Snapchat bootstrap failed:", e);
    }
  }

  // ── Meta ──────────────────────────────────────────────────────────────────
  const metaRow = (await getAllUserMetaTokens()).find((r) => r.google_user_id === googleUserId);
  if (metaRow && Date.now() < metaRow.expires_at) {
    session.metaAccessToken = metaRow.access_token;
    session.metaUserId = metaRow.meta_user_id;
    session.metaExpiresAt = metaRow.expires_at;
    session.metaAllowedAdAccountIds = metaRow.ad_account_ids.map((a) => a.id);
  }

  await session.save();

  const to = request.nextUrl.searchParams.get("to") ?? "/dashboard";
  // Relative paths only — never redirect to a caller-supplied absolute URL.
  const path = to.startsWith("/") && !to.startsWith("//") ? to : "/dashboard";
  // Deliberately NOT NEXT_PUBLIC_APP_URL: that points at the deployed origin, so
  // using it here would bounce the dev browser to production with no cookie.
  return NextResponse.redirect(new URL(path, request.nextUrl.origin));
}
