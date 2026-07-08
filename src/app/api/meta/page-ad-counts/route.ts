import { NextResponse } from "next/server";
import { getSession, isSessionValid, isMetaConnected } from "@/lib/session";
import { getValidMetaToken } from "@/lib/meta/client";
import { getMetaAdAccounts } from "@/lib/meta/adaccounts";
import { getAdsVolume } from "@/lib/meta/ad-volume";

// POST /api/meta/page-ad-counts  { pageIds: string[] }
// Returns running/in-review ad counts for ONLY the requested pages — the feed
// provider's allowed pages at launch time. Unlike GET /api/meta/ad-limits (which
// powers the management table), this does NOT enumerate every Business Manager
// page or resolve display names. It reads the page-level running counts from
// ads_volume, scoped to the pages the launch actually needs.
export async function POST(req: Request) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  let body: { pageIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const pageIds = Array.isArray(body.pageIds)
    ? body.pageIds.filter((x): x is string => typeof x === "string")
    : [];
  if (pageIds.length === 0) return NextResponse.json({ counts: {} });

  const wanted = new Set(pageIds);
  const counts: Record<string, number> = {};
  for (const pid of pageIds) counts[pid] = 0; // unseen page → 0 running (most headroom)

  try {
    let accountIds = session.metaAllowedAdAccountIds ?? [];
    if (accountIds.length === 0) {
      const token = await getValidMetaToken();
      const accounts = await getMetaAdAccounts(token);
      accountIds = accounts.map((a) => a.id);
    }

    // ads_volume returns page-level counts (global, identical across every account
    // referencing the page). Sweep the user's accounts and keep the max seen for
    // each requested page.
    for (const acct of accountIds) {
      try {
        const vol = await getAdsVolume(acct);
        for (const row of vol.data ?? []) {
          if (!row.actor_id || !wanted.has(row.actor_id)) continue;
          const running = row.ads_running_or_in_review_count ?? 0;
          if (running > counts[row.actor_id]) counts[row.actor_id] = running;
        }
      } catch (e) {
        // One account failing (e.g. disabled) must not blank the whole result.
        console.error(`[meta/page-ad-counts] ads_volume failed for ${acct}:`, e);
      }
    }

    return NextResponse.json({ counts });
  } catch (err) {
    console.error("[meta/page-ad-counts] error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
