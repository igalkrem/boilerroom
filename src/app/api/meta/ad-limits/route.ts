import { NextResponse } from "next/server";
import { getSession, isSessionValid, isMetaConnected } from "@/lib/session";
import { getValidMetaToken } from "@/lib/meta/client";
import { getMetaAdAccounts } from "@/lib/meta/adaccounts";
import { getAdsVolume } from "@/lib/meta/ad-volume";

// GET /api/meta/ad-limits
// Returns each Facebook Page's PAGE-LEVEL running/in-review ad count, merged
// across every Meta ad account (the `ads_volume` breakdown reports the same
// page-level total from each account that can advertise for the page). Facebook
// does not expose the numeric ad limit via the API — the client applies the
// default (250) or a per-page override to compute "ads remaining".
export async function GET() {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  try {
    let accountIds = session.metaAllowedAdAccountIds ?? [];
    if (accountIds.length === 0) {
      const token = await getValidMetaToken();
      const accounts = await getMetaAdAccounts(token);
      accountIds = accounts.map((a) => a.id);
    }

    // pageId -> highest page-level running count seen (values agree across
    // accounts; max guards against an account omitting the field).
    const runningByPage = new Map<string, number>();
    for (const acct of accountIds) {
      try {
        const vol = await getAdsVolume(acct);
        for (const row of vol.data ?? []) {
          if (!row.actor_id) continue;
          const running = row.ads_running_or_in_review_count ?? 0;
          const prev = runningByPage.get(row.actor_id) ?? 0;
          if (running > prev) runningByPage.set(row.actor_id, running);
          else if (!runningByPage.has(row.actor_id)) runningByPage.set(row.actor_id, running);
        }
      } catch (e) {
        // One account failing (e.g. disabled) must not blank the whole report.
        console.error(`[meta/ad-limits] ads_volume failed for ${acct}:`, e);
      }
    }

    const pages = Array.from(runningByPage.entries()).map(([pageId, running]) => ({
      pageId,
      running,
    }));

    return NextResponse.json({ pages });
  } catch (err) {
    console.error("[meta/ad-limits] GET error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
