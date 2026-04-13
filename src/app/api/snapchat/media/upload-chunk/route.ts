import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const chunk = formData.get("chunk") as File | null;
  const partNumber = formData.get("partNumber") as string | null;
  const uploadId = formData.get("uploadId") as string | null;
  const addPath = formData.get("addPath") as string | null;

  if (!chunk || !partNumber || !uploadId || !addPath) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  const addUrl = `https://adsapi.snapchat.com${addPath}`;

  const uploadForm = new FormData();
  uploadForm.append("file", chunk);
  uploadForm.append("part_number", partNumber);
  uploadForm.append("upload_id", uploadId);

  const res = await fetch(addUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: uploadForm,
  });

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: `Chunk ${partNumber} failed: ${res.status} - ${text}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
