import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppUrl } from "@/lib/app-url";

export async function POST() {
  const session = await getSession();
  session.destroy();
  const appUrl = getAppUrl();
  return NextResponse.redirect(`${appUrl}/login`);
}
