import { NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    snapUserId: session.snapUserId,
  });
}
