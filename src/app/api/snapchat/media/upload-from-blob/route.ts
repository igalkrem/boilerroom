import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isSnapchatConnected, isAdAccountAllowed } from "@/lib/session";
import { getValidAccessToken } from "@/lib/snapchat/client";
import { refreshAccessToken } from "@/lib/snapchat/auth";
import { rateLimitedFetch } from "@/lib/rate-limiter";
import { z } from "zod";

export const maxDuration = 120;

// Server fetches the file from Vercel Blob and uploads it directly to Snapchat's
// simple upload endpoint. Bypasses the 4.5 MB Vercel request-body limit that
// forces client-side uploads onto the slow multipart-upload-v2 path.
// After this endpoint returns OK, Snapchat marks the media READY immediately.

const bodySchema = z.object({
  blobUrl: z
    .string()
    .url()
    .refine(
      (url) => new URL(url).hostname.endsWith(".vercel-storage.com"),
      { message: "blobUrl must be a Vercel Blob URL" }
    ),
  mediaId: z.string().min(1),
  adAccountId: z.string().min(1),
  fileName: z.string().min(1).max(100).optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
  }


  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }

  const { blobUrl, mediaId, adAccountId, fileName } = parsed.data;

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Fetch from Vercel Blob — server-to-server, no incoming body size limit applies
  const blobRes = await fetch(blobUrl, { cache: "no-store" });
  if (!blobRes.ok) {
    console.error("[upload-from-blob] Blob fetch failed:", blobRes.status, blobUrl);
    return NextResponse.json({ error: "failed_to_fetch_blob" }, { status: 500 });
  }
  console.log("[upload-from-blob] blob content-type:", blobRes.headers.get("content-type"), "size:", blobRes.headers.get("content-length"), "file:", fileName);
  // Explicitly preserve the content-type from Vercel Blob's response headers.
  // In the Node.js runtime, .blob() doesn't reliably carry Content-Type onto the
  // Blob object, so Snapchat would receive application/octet-stream and reject
  // the file as unrecognisable (E2601).
  const contentType = blobRes.headers.get("content-type") ?? "application/octet-stream";
  const arrayBuffer = await blobRes.arrayBuffer();
  const fileBlob = new Blob([arrayBuffer], { type: contentType });

  const uploadForm = new FormData();
  uploadForm.append("file", fileBlob, fileName ?? "media");

  const snapRes = await rateLimitedFetch(() =>
    fetch(`https://adsapi.snapchat.com/v1/media/${mediaId}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: uploadForm,
    })
  );

  if (!snapRes.ok) {
    let finalRes = snapRes;

    // Snapchat returns 403 E3002 when an access token expires mid-sequence, not
    // just for genuine role-permission failures. Refresh once and retry before
    // giving up — mirrors the same pattern in snapFetch() for 401s.
    if (snapRes.status === 401 || snapRes.status === 403) {
      try {
        const tokens = await refreshAccessToken(session.snapRefreshToken!);
        session.snapAccessToken = tokens.access_token;
        if (tokens.refresh_token) session.snapRefreshToken = tokens.refresh_token;
        session.snapExpiresAt = Date.now() + tokens.expires_in * 1000;
        await session.save();

        const retryForm = new FormData();
        retryForm.append("file", new Blob([arrayBuffer], { type: contentType }), fileName ?? "media");

        const retryRes = await rateLimitedFetch(() =>
          fetch(`https://adsapi.snapchat.com/v1/media/${mediaId}/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${tokens.access_token}` },
            body: retryForm,
          })
        );

        if (retryRes.ok) return NextResponse.json({ mediaId, status: "READY" });
        finalRes = retryRes;
      } catch (refreshErr) {
        console.error("[upload-from-blob] Token refresh failed:", refreshErr);
      }
    }

    const errText = await finalRes.text();
    console.error("[upload-from-blob] Snapchat upload failed:", finalRes.status, errText);
    let userMessage: string | undefined;
    try {
      const errJson = JSON.parse(errText);
      if (errJson.error_code === "E2601") {
        userMessage = "Snapchat rejected this file: format not supported. Videos must be H.264 MP4; images must be JPEG or PNG.";
      }
    } catch { /* not JSON — leave userMessage undefined */ }
    return NextResponse.json({ error: "upload_failed", userMessage }, { status: 500 });
  }

  return NextResponse.json({ mediaId, status: "READY" });
}
