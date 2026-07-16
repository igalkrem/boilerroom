import { NextResponse } from "next/server";
import { getSession, isSessionValid, isMetaConnected } from "@/lib/session";
import { getValidMetaToken, metaFetch } from "@/lib/meta/client";
import { getMetaAdAccounts } from "@/lib/meta/adaccounts";
import { getAdsVolume } from "@/lib/meta/ad-volume";
import { getBusinessPages, getOrCreatePageBackedInstagramAccount } from "@/lib/meta/business-pages";
import {
  readAdLimitsCache,
  writeAdLimitsCache,
  AD_LIMITS_TTL_MS,
  type AdLimitPageRow,
} from "@/lib/meta/ad-limits-cache";
import { readInstagramActorCache, writeInstagramActorCacheEntries } from "@/lib/meta/instagram-actor-cache";

// A page's page-backed Instagram account never changes, so most pages hit the
// permanent cache; only genuinely new pages need a live Meta call. Bounded
// concurrency keeps a large first-ever page list from tripping rate limits.
const INSTAGRAM_LOOKUP_CONCURRENCY = 5;

async function resolveInstagramActorIds(pageIds: string[]): Promise<Record<string, string>> {
  const cached = await readInstagramActorCache();
  const uncached = pageIds.filter((id) => !cached[id]);
  const resolved: Record<string, string> = {};

  let i = 0;
  async function worker() {
    while (i < uncached.length) {
      const pageId = uncached[i++];
      try {
        const id = await getOrCreatePageBackedInstagramAccount(pageId);
        if (id) resolved[pageId] = id;
      } catch (e) {
        console.error(`[meta/ad-limits] instagram actor lookup failed for ${pageId}:`, e);
      }
    }
  }
  await Promise.all(Array.from({ length: INSTAGRAM_LOOKUP_CONCURRENCY }, worker));

  if (Object.keys(resolved).length > 0) {
    await writeInstagramActorCacheEntries(resolved);
  }
  return { ...cached, ...resolved };
}

// Resolve page names for ids not covered by the Business Manager page list, via
// the batch `?ids=` node (50 max per call). Only used as a fallback for pages
// that surface in ads_volume but aren't owned/client pages of any business.
async function resolvePageNames(pageIds: string[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  for (let i = 0; i < pageIds.length; i += 50) {
    const chunk = pageIds.slice(i, i + 50);
    try {
      const res = await metaFetch<Record<string, { id: string; name?: string }>>(
        `/?ids=${encodeURIComponent(chunk.join(","))}&fields=name`
      );
      for (const [id, node] of Object.entries(res)) {
        if (node?.name) names[id] = node.name;
      }
    } catch {
      // The batch `?ids=` call fails atomically if ANY id in the chunk is
      // inaccessible — resolve individually so one bad page doesn't blank the rest.
      for (const id of chunk) {
        try {
          const node = await metaFetch<{ id: string; name?: string }>(`/${id}?fields=name`);
          if (node?.name) names[id] = node.name;
        } catch {
          /* leave unresolved — the UI falls back to the page id */
        }
      }
    }
  }
  return names;
}

// GET /api/meta/ad-limits
// Returns every Facebook Page across the user's Business Managers with its name,
// owning Business Manager name, and PAGE-LEVEL running/in-review ad count. The
// page list comes from the business owned/client pages (so pages with zero ads
// are included, matching business.facebook.com/latest/ad_limits); running counts
// come from ads_volume merged across all Meta ad accounts. Facebook does not
// expose the numeric ad limit via the API — the client applies the 250 default.
export async function GET(req: Request) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  const userId = session.googleUserId;
  const force = new URL(req.url).searchParams.get("refresh") === "1";

  // Serve from cache unless it's stale or a refresh was explicitly requested.
  const cache = userId ? await readAdLimitsCache(userId) : null;
  if (cache && !force && Date.now() - cache.cachedAt < AD_LIMITS_TTL_MS) {
    return NextResponse.json({ pages: cache.pages, cachedAt: cache.cachedAt, cached: true });
  }

  try {
    // 1) Full page list (+ names + Business Manager) from the businesses.
    let bizPages: Record<string, { name?: string; businessName?: string }> = {};
    try {
      bizPages = await getBusinessPages();
    } catch (e) {
      console.error("[meta/ad-limits] business page list failed:", e);
    }

    // 2) Page-level running/in-review counts from ads_volume across all accounts.
    let accountIds = session.metaAllowedAdAccountIds ?? [];
    if (accountIds.length === 0) {
      const token = await getValidMetaToken();
      const accounts = await getMetaAdAccounts(token);
      accountIds = accounts.map((a) => a.id);
    }

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

    // 3) Union of business pages + any ads_volume-only pages.
    const allIds = new Set<string>([...Object.keys(bizPages), ...runningByPage.keys()]);

    // Names only needed for pages the business list didn't cover.
    const missingName = [...allIds].filter((id) => !bizPages[id]?.name);
    const resolved = missingName.length ? await resolvePageNames(missingName) : {};

    let instagramActorIds: Record<string, string> = {};
    try {
      instagramActorIds = await resolveInstagramActorIds([...allIds]);
    } catch (e) {
      console.error("[meta/ad-limits] instagram actor id resolution failed:", e);
    }

    const pages: AdLimitPageRow[] = [...allIds].map((pageId) => ({
      pageId,
      name: bizPages[pageId]?.name ?? resolved[pageId] ?? pageId,
      businessName: bizPages[pageId]?.businessName ?? null,
      running: runningByPage.get(pageId) ?? 0,
      instagramActorId: instagramActorIds[pageId] ?? null,
    }));

    // If the fresh fetch came back empty (e.g. a transient rate limit blanked
    // every call) but we have a prior cache, serve the stale cache rather than
    // an empty table.
    if (pages.length === 0 && cache) {
      return NextResponse.json({
        pages: cache.pages,
        cachedAt: cache.cachedAt,
        cached: true,
        stale: true,
      });
    }

    const cachedAt = Date.now();
    if (userId) await writeAdLimitsCache(userId, pages, cachedAt);

    return NextResponse.json({ pages, cachedAt, cached: false });
  } catch (err) {
    console.error("[meta/ad-limits] GET error:", err);
    // On unexpected failure, fall back to any cache we have.
    if (cache) {
      return NextResponse.json({
        pages: cache.pages,
        cachedAt: cache.cachedAt,
        cached: true,
        stale: true,
      });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
