import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isSnapchatConnected, isAdAccountAllowed } from "@/lib/session";
import { getValidAccessToken, SNAP_ID_RE } from "@/lib/snapchat/client";
import { rateLimitedFetch } from "@/lib/rate-limiter";
import { z } from "zod";
import { invalidRequest } from "@/lib/api/validation-error";

export const maxDuration = 60;

const BASE_URL = "https://adsapi.snapchat.com/v1";

const bodySchema = z.object({
  adAccountId: z.string().min(1),
  mediaId: z.string().regex(SNAP_ID_RE, "invalid mediaId"),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive().max(500_000_000),
  numberOfParts: z.number().int().min(1).max(1000),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
  }

  // Parse and authorize before fetching the access token — avoids triggering a
  // token refresh for requests that would be rejected anyway (SEC-5).
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(parsed.error);
  }
  const { adAccountId, mediaId, fileName, fileSize, numberOfParts } = parsed.data;

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const form = new FormData();
  form.append("file_name", fileName);
  form.append("file_size", String(fileSize));
  form.append("number_of_parts", String(numberOfParts));

  const res = await rateLimitedFetch(() => fetch(`${BASE_URL}/media/${mediaId}/multipart-upload-v2?action=INIT`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  }));

  const text = await res.text();
  if (!res.ok) {
    console.error("[upload-init] Snapchat error:", res.status, text);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const data = JSON.parse(text) as { upload_id?: string; add_path?: string; finalize_path?: string };

  // Snapchat may return full URLs or relative paths — normalize to relative /v1/... paths.
  function toRelativePath(p: string | undefined): string | undefined {
    if (!p) return p;
    let path: string;
    try {
      const url = new URL(p);
      path = url.pathname + url.search;
    } catch {
      path = p;
    }
    if (!path.includes("/v1/")) {
      path = path.startsWith("/") ? `/v1${path}` : `/v1/${path}`;
    }
    return path;
  }

  const normalizedAddPath = toRelativePath(data.add_path);
  const normalizedFinalizePath = toRelativePath(data.finalize_path);

  // Return 502 immediately if Snapchat omits required fields — prevents orphaned
  // uploads where the client proceeds with undefined upload_id / paths (CR-4).
  if (!data.upload_id || !normalizedAddPath || !normalizedFinalizePath) {
    console.error("[upload-init] Snapchat response missing required fields:", data);
    return NextResponse.json({ error: "internal_error" }, { status: 502 });
  }

  // Pin paths server-side so upload-chunk and upload-finalize ignore the client's copy.
  //
  // CR-13: read the session again rather than reusing the snapshot from the top of the
  // handler. getValidAccessToken() above takes its own getSession() and, on a refresh,
  // saves new snapAccessToken/snapRefreshToken/snapExpiresAt to that instance. Saving the
  // older snapshot writes the pre-refresh values back — and since Snapchat ROTATES
  // refresh tokens, that leaves the cookie holding one Snapchat already invalidated,
  // breaking the connection for every later request.
  //
  // Unlike upload-finalize, this save CANNOT be moved before the token fetch: upload_id
  // only exists after the Snapchat call. So this relies on a second getSession()
  // observing the cookie written earlier in the same request. I could not verify that
  // read-after-write behaviour on Next's cookie store, so treat this as unproven — but it
  // is never WORSE than the previous code, which unconditionally wrote a stale snapshot.
  // If token loss is ever observed here, the fix is to have getValidAccessToken() return
  // its session so callers can mutate that instance directly.
  const freshSession = await getSession();
  freshSession.pendingUploads = freshSession.pendingUploads ?? {};
  freshSession.pendingUploads[data.upload_id] = {
    addPath: normalizedAddPath,
    finalizePath: normalizedFinalizePath,
  };
  await freshSession.save();

  return NextResponse.json({
    ...data,
    add_path: normalizedAddPath,
    finalize_path: normalizedFinalizePath,
  });
}
