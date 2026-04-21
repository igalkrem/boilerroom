import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/snapchat/client";
import { rateLimitedCall } from "@/lib/rate-limiter";

export const maxDuration = 60;

const BASE_URL = "https://adsapi.snapchat.com/v1";

export async function POST(request: NextRequest) {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const mediaId = formData.get("mediaId") as string | null;
  const adAccountId = formData.get("adAccountId") as string | null;

  if (!file || !mediaId || !adAccountId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  const ALLOWED_MIME_TYPES = ["video/mp4", "image/jpeg", "image/png", "image/gif"];
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "unsupported_file_type" }, { status: 400 });
  }

  // Correct Snapchat upload endpoint: /media/{media_id}/upload (no /adaccounts/ prefix)
  const snapUploadUrl = `${BASE_URL}/media/${mediaId}/upload`;

  const uploadForm = new FormData();
  uploadForm.append("file", file);

  const uploadRes = await rateLimitedCall(() => fetch(snapUploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: uploadForm,
  }));

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    console.error("[media/upload] Failed:", uploadRes.status, errText);
    return NextResponse.json({ error: `Upload failed: ${uploadRes.status}` }, { status: 500 });
  }

  return NextResponse.json({ mediaId, status: "COMPLETE" });
}
