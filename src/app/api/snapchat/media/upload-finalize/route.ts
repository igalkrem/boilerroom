import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isSnapchatConnected, isAdAccountAllowed } from "@/lib/session";
import { getValidAccessToken } from "@/lib/snapchat/client";
import { rateLimitedFetch } from "@/lib/rate-limiter";
import { z } from "zod";
import { invalidRequest } from "@/lib/api/validation-error";

export const maxDuration = 60;

const bodySchema = z.object({
  adAccountId: z.string().min(1),
  uploadId: z.string().min(1),
  // finalizePath is accepted but ignored — the server uses the path stored at upload-init time.
  finalizePath: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
  }

  // Validate and authorize BEFORE touching the token. Fetching (and possibly
  // refreshing) a token for a request that is about to be rejected does upstream
  // work on an unauthorized caller's behalf and can rotate the refresh token.
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(parsed.error);
  }
  const { adAccountId, uploadId } = parsed.data;

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // CR-13: mutate and save the session BEFORE fetching the token, so the token fetch is
  // the LAST writer of the cookie.
  //
  // getValidAccessToken() takes its own getSession() and, on a refresh, writes new
  // snapAccessToken/snapRefreshToken/snapExpiresAt and saves. This handler used to save
  // its own older snapshot afterwards, overwriting those values — and because Snapchat
  // ROTATES refresh tokens, discarding the rotation leaves the cookie holding a token
  // Snapchat has already invalidated, breaking the Snap connection until the user
  // reconnects.
  //
  // Ordering it this way rather than re-reading the session afterwards is deliberate: it
  // does not depend on whether a second getSession() in the same request observes a
  // cookie written earlier in that request (read-after-write on Next's cookie store),
  // which is an assumption I could not verify. Last-writer-wins is unambiguous.

  // Use the server-pinned finalizePath stored at upload-init time — ignore the client-supplied value.
  const pinnedFinalizePath = session.pendingUploads?.[uploadId]?.finalizePath;
  if (!pinnedFinalizePath) {
    return NextResponse.json({ error: "unknown_upload_id" }, { status: 400 });
  }
  // Clean up after use so the session doesn't grow unboundedly.
  delete session.pendingUploads![uploadId];
  await session.save();

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const finalizeUrl = `https://adsapi.snapchat.com${pinnedFinalizePath}`;

  const form = new FormData();
  form.append("upload_id", uploadId);

  const res = await rateLimitedFetch(() => fetch(finalizeUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  }));

  const text = await res.text();
  if (!res.ok) {
    console.error("[upload-finalize] Snapchat error:", res.status, text);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
