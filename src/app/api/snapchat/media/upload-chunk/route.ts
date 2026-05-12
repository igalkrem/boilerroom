import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isSnapchatConnected, isAdAccountAllowed } from "@/lib/session";
import { getValidAccessToken } from "@/lib/snapchat/client";
import { rateLimitedFetch } from "@/lib/rate-limiter";

export const maxDuration = 60;

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

  const formData = await request.formData();
  const chunk = formData.get("chunk") as File | null;
  const partNumber = formData.get("partNumber") as string | null;
  const uploadId = formData.get("uploadId") as string | null;
  const adAccountId = formData.get("adAccountId") as string | null;

  if (!chunk || !partNumber || !uploadId || !adAccountId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Use the server-pinned addPath stored at upload-init time — ignore the client-supplied value.
  const pinnedAddPath = session.pendingUploads?.[uploadId]?.addPath;
  if (!pinnedAddPath) {
    return NextResponse.json({ error: "unknown_upload_id" }, { status: 400 });
  }

  const addUrl = `https://adsapi.snapchat.com${pinnedAddPath}`;

  const uploadForm = new FormData();
  uploadForm.append("file", chunk);
  uploadForm.append("part_number", partNumber);
  uploadForm.append("upload_id", uploadId);

  const res = await rateLimitedFetch(() => fetch(addUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: uploadForm,
  }));

  const text = await res.text();
  if (!res.ok) {
    console.error(`[upload-chunk] Snapchat error part ${partNumber}:`, res.status, text);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
