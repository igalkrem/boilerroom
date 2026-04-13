import { NextRequest, NextResponse } from "next/server";
import { pollMediaStatus } from "@/lib/snapchat/media";
import { getSession, isSessionValid } from "@/lib/session";

const BASE_URL = process.env.SNAPCHAT_API_BASE_URL ?? "https://adsapi.snapchat.com/v1";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const mediaId = formData.get("mediaId") as string | null;
  const adAccountId = formData.get("adAccountId") as string | null;
  const uploadUrl = formData.get("uploadUrl") as string | null;

  if (!file || !mediaId || !adAccountId) {
    return NextResponse.json({
      error: "missing_params",
      _debug: { hasFile: !!file, mediaId, adAccountId },
    }, { status: 400 });
  }

  // Correct Snapchat upload endpoint: /media/{media_id}/upload (no /adaccounts/ prefix)
  const snapUploadUrl = `${BASE_URL}/media/${mediaId}/upload`;

  console.log("[media/upload] Uploading to:", snapUploadUrl, "| mediaId:", mediaId, "| file:", file.name, file.size);

  const uploadForm = new FormData();
  uploadForm.append("file", file);

  const uploadRes = await fetch(snapUploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: uploadForm,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    console.error("[media/upload] Failed:", snapUploadUrl, uploadRes.status, errText);
    return NextResponse.json(
      { error: `Upload failed: ${uploadRes.status} - ${errText}`, _debug: { snapUploadUrl, mediaId } },
      { status: 500 }
    );
  }

  // Poll until COMPLETE
  try {
    await pollMediaStatus(mediaId, adAccountId);
    return NextResponse.json({ mediaId, status: "COMPLETE" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
