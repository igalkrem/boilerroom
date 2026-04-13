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

  if (!file || !mediaId || !adAccountId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  // Upload the file directly to Snapchat's media upload endpoint
  const uploadEndpoint = `${BASE_URL}/adaccounts/${adAccountId}/media/${mediaId}/upload`;

  const uploadForm = new FormData();
  uploadForm.append("file", file);

  const uploadRes = await fetch(uploadEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: uploadForm,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    return NextResponse.json(
      { error: `Upload failed: ${uploadRes.status} - ${errText}` },
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
