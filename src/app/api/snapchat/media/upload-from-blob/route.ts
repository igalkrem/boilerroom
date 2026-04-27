import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isAdAccountAllowed } from "@/lib/session";
import { getValidAccessToken } from "@/lib/snapchat/client";
import { z } from "zod";

export const maxDuration = 60;

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
  const fileBlob = await blobRes.blob();

  const uploadForm = new FormData();
  uploadForm.append("file", fileBlob, fileName ?? "media");

  const snapRes = await fetch(`https://adsapi.snapchat.com/v1/media/${mediaId}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: uploadForm,
  });

  if (!snapRes.ok) {
    const errText = await snapRes.text();
    console.error("[upload-from-blob] Snapchat upload failed:", snapRes.status, errText);
    return NextResponse.json({ error: `Upload failed: ${snapRes.status}` }, { status: 500 });
  }

  return NextResponse.json({ mediaId, status: "READY" });
}
