import { NextRequest, NextResponse } from "next/server";
import { pollMediaStatus } from "@/lib/snapchat/media";
import { getSession, isSessionValid } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const uploadUrl = formData.get("uploadUrl") as string | null;
  const mediaId = formData.get("mediaId") as string | null;
  const adAccountId = formData.get("adAccountId") as string | null;

  if (!file || !uploadUrl || !mediaId || !adAccountId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  // Upload the file to Snapchat's S3-backed URL
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: await file.arrayBuffer(),
  });

  if (!uploadRes.ok) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadRes.status}` },
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
