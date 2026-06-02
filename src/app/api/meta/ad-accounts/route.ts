import { NextResponse } from "next/server";
import { getMetaAdAccounts } from "@/lib/meta/adaccounts";
import { getSession, isSessionValid, isMetaConnected } from "@/lib/session";
import { updateMetaAdAccountIds } from "@/lib/db";

export async function GET() {
  const session = await getSession();

  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  try {
    const accounts = await getMetaAdAccounts(session.metaAccessToken!);

    // Cache allowed IDs for ownership checks on future Meta API calls.
    session.metaAllowedAdAccountIds = accounts.map((a) => a.id);
    await session.save();

    if (session.googleUserId) {
      try {
        await updateMetaAdAccountIds(
          session.googleUserId,
          accounts.map((a) => ({ id: a.id, currency: a.currency, timezone_name: a.timezone_name }))
        );
      } catch (e) {
        console.warn("[meta/ad-accounts] failed to persist account ids:", e);
      }
    }

    return NextResponse.json({ accounts });
  } catch (err) {
    console.error("[meta/ad-accounts] error:", err);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
