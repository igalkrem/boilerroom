import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isSnapchatConnected, isAdAccountAllowed } from "@/lib/session";
import { getValidAccessToken } from "@/lib/snapchat/client";
import { rateLimitedFetch } from "@/lib/rate-limiter";
import { z } from "zod";

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

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }
  const { adAccountId, uploadId } = parsed.data;

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Use the server-pinned finalizePath stored at upload-init time — ignore the client-supplied value.
  const pinnedFinalizePath = session.pendingUploads?.[uploadId]?.finalizePath;
  if (!pinnedFinalizePath) {
    return NextResponse.json({ error: "unknown_upload_id" }, { status: 400 });
  }
  // Clean up after use so the session doesn't grow unboundedly.
  delete session.pendingUploads![uploadId];
  await session.save();

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
