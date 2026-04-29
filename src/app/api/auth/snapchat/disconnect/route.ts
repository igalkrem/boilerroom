import { NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";

export async function POST() {
  const session = await getSession();

  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  session.snapAccessToken = undefined;
  session.snapRefreshToken = undefined;
  session.snapExpiresAt = undefined;
  session.snapUserId = undefined;
  session.allowedAdAccountIds = undefined;
  await session.save();

  return NextResponse.json({ ok: true });
}
