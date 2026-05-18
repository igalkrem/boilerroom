import { NextResponse } from "next/server";
import { getMetaAdAccounts } from "@/lib/meta/adaccounts";
import { getSession, isSessionValid, isMetaConnected } from "@/lib/session";
import { updateMetaAdAccountIds, runMigrations } from "@/lib/db";

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

    // Cache the user's allowed Meta ad account IDs for ownership checks on other routes.
    session.metaAllowedAdAccountIds = accounts.map((a) => a.id);
    await session.save();

    // Keep DB in sync so the cron knows which Meta accounts to sync (future use).
    if (session.googleUserId) {
      try {
        await runMigrations();
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
