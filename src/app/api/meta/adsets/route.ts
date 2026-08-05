import { NextRequest, NextResponse } from "next/server";
import { createAdSet, getAdSet, getAdSetsByAccount, updateAdSet } from "@/lib/meta/adsets";
import { getSession, isSessionValid, isMetaConnected, isMetaAdAccountAllowed } from "@/lib/session";
import type { MetaAdSetPayload } from "@/types/meta";
import { z } from "zod";
import { invalidRequest } from "@/lib/api/validation-error";

export const maxDuration = 60;

// SEC-20: `adSet` was z.record(z.string(), z.unknown()) — structurally unvalidated.
// The fix is deliberately NOT a closed z.object: this is the live create path for the
// Meta orchestrator's full payload (targeting, promoted_object, asset_feed_spec, the
// regional_regulated_categories added for Worldwide targeting...), and a closed object
// would SILENTLY STRIP any field omitted here and still return HTTP 200 — the exact
// class of bug that shipped before. `.passthrough()` type-checks what we know and
// forwards the rest untouched.
//
// The account is pinned by createAdSet's path (`/act_${adAccountId}/adsets`), so a
// smuggled account_id in the body cannot redirect the write; adAccountId itself is
// still checked against the session allow-list below.
const adSetShape = z
  .object({
    campaign_id: z.string().min(1),
    name: z.string().min(1),
    status: z.enum(["ACTIVE", "PAUSED"]),
    billing_event: z.string().min(1),
    optimization_goal: z.string().min(1),
    targeting: z.object({}).passthrough(),
    bid_strategy: z.enum(["LOWEST_COST_WITHOUT_CAP", "COST_CAP", "LOWEST_COST_WITH_MIN_ROAS"]).optional(),
    // Meta takes these in minor units. Reject negatives and fractions outright: a
    // fractional budget is silently truncated by Graph, which is how a $10.50 intent
    // becomes an unnoticed $10.00 spend cap.
    bid_amount: z.number().int().nonnegative().optional(),
    daily_budget: z.number().int().positive().optional(),
    lifetime_budget: z.number().int().positive().optional(),
    // No upper bound on purpose: with a provider's roasDisplayDivisor at 100 a
    // legitimate "90%" cell stores 900000, so no single ceiling is correct here.
    // See lib/roas-floor.ts.
    bid_constraints: z.object({ roas_average_floor: z.number().positive() }).passthrough().optional(),
    is_dynamic_creative: z.boolean().optional(),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
  })
  .passthrough();

// Exported for schema round-trip tests (route-schemas.test.ts): these closed z.objects
// silently .strip() any field not named here, which has twice dropped a shipped field.
export const postSchema = z.object({
  adAccountId: z.string().min(1),
  adSet: adSetShape,
});

const patchSchema = z.object({
  adAccountId: z.string().min(1),
  adSetId: z.string().min(1),
  updates: z.object({
    name: z.string().optional(),
    status: z.enum(["ACTIVE", "PAUSED"]).optional(),
    daily_budget: z.number().optional(),
    bid_amount: z.number().optional(),
    bid_strategy: z.enum(["LOWEST_COST_WITHOUT_CAP", "COST_CAP", "LOWEST_COST_WITH_MIN_ROAS"]).optional(),
    // Positive-only is the one safe tightening here (it was a bare z.number(), so
    // zero and negatives passed). No ceiling — see the create path above.
    bid_constraints: z.object({ roas_average_floor: z.number().positive() }).optional(),
  }),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  // Single ad set by ID (used by the meta-debug "Inspect Ad Set" tool).
  // The id alone carries no account, so fetch first and then authorize against the
  // session's allow-list. Note account_id comes back BARE while
  // metaAllowedAdAccountIds stores the act_ prefix.
  const adSetId = request.nextUrl.searchParams.get("adSetId");
  if (adSetId) {
    try {
      const adSet = await getAdSet(adSetId);
      if (!adSet.account_id || !isMetaAdAccountAllowed(session, `act_${adSet.account_id}`)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      return NextResponse.json({ adSet });
    } catch (err) {
      console.error("[meta/adsets] GET by adSetId error:", err);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  }

  const adAccountId = request.nextUrl.searchParams.get("adAccountId");
  if (!adAccountId) {
    return NextResponse.json({ error: "adAccountId required" }, { status: 400 });
  }
  if (!isMetaAdAccountAllowed(session, adAccountId)) {
    console.error(
      `[meta/adsets] GET forbidden: adAccountId=${adAccountId} not in metaAllowedAdAccountIds=${JSON.stringify(session.metaAllowedAdAccountIds)}`
    );
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const adSets = await getAdSetsByAccount(adAccountId);
    return NextResponse.json({ adSets });
  } catch (err) {
    console.error("[meta/adsets] GET error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(parsed.error);
  }

  const { adAccountId, adSet } = parsed.data;
  if (!isMetaAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await createAdSet(adAccountId, adSet as unknown as MetaAdSetPayload);
    return NextResponse.json({ adSet: result });
  } catch (err) {
    console.error("[meta/adsets] POST error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(parsed.error);
  }

  const { adAccountId, adSetId, updates } = parsed.data;
  if (!isMetaAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await updateAdSet(adSetId, updates, adAccountId);
    return NextResponse.json({ success: result.success });
  } catch (err) {
    console.error("[meta/adsets] PATCH error:", err);
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: msg }, { status: msg.startsWith("forbidden") ? 403 : 500 });
  }
}
