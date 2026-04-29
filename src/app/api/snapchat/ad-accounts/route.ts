import { NextResponse } from "next/server";
import { getAdAccounts } from "@/lib/snapchat/adaccounts";
import { getSession, isSessionValid, isSnapchatConnected } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
  }

  try {
    const accounts = await getAdAccounts();

    // Cache the user's allowed ad account IDs so other routes can verify
    // ownership without making an additional Snapchat API call.
    session.allowedAdAccountIds = accounts.map((a) => a.id);
    await session.save();

    return NextResponse.json({ accounts });
  } catch (err) {
    console.error("Ad accounts error:", err);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
