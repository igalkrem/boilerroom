import { NextResponse } from "next/server";
import { getPages } from "@/lib/meta/pages";
import { getSession, isSessionValid, isMetaConnected } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  try {
    const pages = await getPages();
    return NextResponse.json({ pages });
  } catch (err) {
    console.error("[meta/pages] GET error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
