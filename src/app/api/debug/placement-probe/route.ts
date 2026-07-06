import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, isSessionValid, isSnapchatConnected, isAdAccountAllowed } from "@/lib/session";
import { createCampaigns, deleteCampaign, getCampaign } from "@/lib/snapchat/campaigns";
import { createAdSquads, updateAdSquad, deleteAdSquad } from "@/lib/snapchat/adsquads";
import { snapFetch } from "@/lib/snapchat/client";
import type { SnapAdSquadPayload, OptimizationGoal } from "@/types/snapchat";

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY DIAGNOSTIC ROUTE — Smart Placements (placement_v2) investigation.
//
// Snapchat's Marketing API has an unresolved contradiction (14 revert-commits deep):
// requesting Smart/Automatic placement via placement_v2 has historically LOCKED the ad
// squad (E2025 "Update is not supported for this entity"), breaking in-app budget/bid/
// status edits. There is no surviving log evidence of exactly what triggers the lock.
//
// This route runs a controlled, self-cleaning live experiment: it creates a throwaway
// PAUSED campaign, creates one PAUSED ad squad per placement variant, reads each back to
// see the RESOLVED placement, then attempts the exact same budget PUT the app's inline
// editor uses (updateAdSquad) to observe whether the squad is editable — then DELETES
// everything. Nothing spends money.
//
// Gating: authenticated session + Snapchat connected + the ad account must be in the
// user's own allowed list + an explicit confirm token in the body (anti-accidental).
// This route should be DELETED once the placement behaviour is confirmed.
// ─────────────────────────────────────────────────────────────────────────────

export const maxDuration = 120;

const CONFIRM_TOKEN = "RUN_PLACEMENT_PROBE";

// Name prefix for the two-phase "Ads Manager placement" test squads/campaigns.
// The recheck phase refuses to edit/delete anything whose name lacks this prefix — a
// backstop so a stale/wrong id can never mutate or delete a real campaign.
const AM_PREFIX = "__PROBE_AM__";

const bodySchema = z.object({
  adAccountId: z.string().min(1),
  pixelId: z.string().min(1).optional(),
  confirm: z.literal(CONFIRM_TOKEN),
  // "full" (default) = the 5-variant placement matrix. The two "adsmanager-*" modes power
  // the two-phase test: does editing placements in Snapchat Ads Manager (a manual UI action)
  // keep a squad API-editable? create → user edits placements in Ads Manager → recheck.
  mode: z.enum(["full", "adsmanager-create", "adsmanager-recheck"]).optional(),
  squadId: z.string().min(1).optional(),   // required for adsmanager-recheck
  campaignId: z.string().min(1).optional(), // required for adsmanager-recheck
});

type PlacementV2 = NonNullable<SnapAdSquadPayload["placement_v2"]>;

interface Variant {
  key: string;
  label: string;
  optimizationGoal: OptimizationGoal;
  pixelId?: string;
  conversionWindow?: "SWIPE_7DAY";
  placement?: PlacementV2;
}

interface VariantResult {
  key: string;
  label: string;
  sentPlacement: PlacementV2 | null;
  createOk: boolean;
  createError: string | null;
  resolvedPlacementV2: unknown;
  resolvedPlacementLegacy: unknown;
  editOk: boolean | null; // null = edit not attempted (create failed)
  editError: string | null;
  squadId: string | null;
}

// The known-good CUSTOM position set from CLAUDE.md's snapchat_positions table,
// excluding INTERSTITIAL_SPOTLIGHT (video-only — rejects image/web ads).
const CUSTOM_POSITIONS = ["INTERSTITIAL_USER", "INTERSTITIAL_CONTENT", "INSTREAM", "FEED"];

// snapFetch throws "Snapchat API error {status}: {raw body}" — never forward that raw
// HTTP body to the browser (matches the production adsquads handler). Structured
// sub_request_error_reason messages (e.g. "E2025: ...") do NOT start with that prefix,
// so the diagnostic signal survives; only raw bodies are scrubbed. Full raw errors still
// reach Vercel logs via the console.log("[placement-probe] REPORT:") below.
function sanitizeSnapError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw);
  return msg.startsWith("Snapchat API error") ? "snapchat_request_failed" : msg;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  }
  const { adAccountId, pixelId } = parsed.data;

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const mode = parsed.data.mode ?? "full";
  if (mode === "adsmanager-create") {
    return handleAmCreate(adAccountId);
  }
  if (mode === "adsmanager-recheck") {
    const { squadId, campaignId } = parsed.data;
    if (!squadId || !campaignId) {
      return NextResponse.json({ error: "invalid_request", detail: "squadId and campaignId are required for recheck" }, { status: 400 });
    }
    return handleAmRecheck(adAccountId, squadId, campaignId);
  }

  const ts = Date.now();
  const variants: Variant[] = [
    { key: "A_omit", label: "Omit placement_v2 (current app behaviour)", optimizationGoal: "LANDING_PAGE_VIEW" },
    { key: "B_automatic", label: "placement_v2 { config: AUTOMATIC } (Smart)", optimizationGoal: "LANDING_PAGE_VIEW", placement: { config: "AUTOMATIC" } },
    { key: "C_content", label: "placement_v2 { config: CONTENT }", optimizationGoal: "LANDING_PAGE_VIEW", placement: { config: "CONTENT" } },
    { key: "D_custom", label: "placement_v2 { config: CUSTOM, positions } ", optimizationGoal: "LANDING_PAGE_VIEW", placement: { config: "CUSTOM", platforms: ["SNAPCHAT"], snapchat_positions: CUSTOM_POSITIONS } },
  ];
  if (pixelId) {
    variants.push({
      key: "E_automatic_pixel",
      label: "AUTOMATIC + PIXEL_PURCHASE (DPA/CHAT_FEED interplay)",
      optimizationGoal: "PIXEL_PURCHASE",
      pixelId,
      conversionWindow: "SWIPE_7DAY",
      placement: { config: "AUTOMATIC" },
    });
  }

  let campaignId: string | null = null;
  const createdSquadIds: string[] = [];
  const results: VariantResult[] = [];
  const cleanup: { entity: string; id: string; ok: boolean; error: string | null }[] = [];

  try {
    // 1) Throwaway PAUSED campaign (SALES, no budget). start_time slightly in the future.
    const campRes = await createCampaigns(adAccountId, [
      {
        name: `__PROBE__ campaign ${ts}`,
        ad_account_id: adAccountId,
        status: "PAUSED",
        buy_model: "AUCTION",
        start_time: new Date(ts + 60_000).toISOString(),
        objective_v2_properties: { objective_v2_type: "SALES" },
      },
    ]);
    const camp = campRes[0];
    if (!camp?.id || camp.error) {
      return NextResponse.json(
        { error: "probe_campaign_create_failed", detail: camp?.error ?? "no campaign id returned" },
        { status: 502 }
      );
    }
    campaignId = camp.id;

    // 2) One PAUSED squad per variant → read back resolved placement → try a budget PUT.
    for (const v of variants) {
      const squad: SnapAdSquadPayload = {
        campaign_id: campaignId,
        name: `__PROBE__ ${v.key} ${ts}`,
        type: "SNAP_ADS",
        status: "PAUSED",
        targeting: { geos: [{ country_code: "us" }] },
        delivery_constraint: "DAILY_BUDGET",
        billing_event: "IMPRESSION",
        optimization_goal: v.optimizationGoal,
        bid_strategy: "AUTO_BID",
        daily_budget_micro: 5_000_000,
        pacing_type: "STANDARD",
        ...(v.pixelId ? { pixel_id: v.pixelId } : {}),
        ...(v.conversionWindow ? { conversion_window: v.conversionWindow } : {}),
        ...(v.placement ? { placement_v2: v.placement } : {}),
      };

      const result: VariantResult = {
        key: v.key,
        label: v.label,
        sentPlacement: v.placement ?? null,
        createOk: false,
        createError: null,
        resolvedPlacementV2: null,
        resolvedPlacementLegacy: null,
        editOk: null,
        editError: null,
        squadId: null,
      };

      try {
        const createRes = await createAdSquads(campaignId, [squad]);
        const created = createRes[0];
        if (!created?.id || created.error) {
          result.createError = created?.error ?? "no ad squad id returned";
          results.push(result);
          continue;
        }
        result.createOk = true;
        result.squadId = created.id;
        createdSquadIds.push(created.id);

        // Read the squad back raw to capture whatever placement fields Snapchat returns.
        try {
          const raw = await snapFetch<{ adsquads?: Array<{ adsquad?: Record<string, unknown> }> }>(
            `/adsquads/${created.id}`
          );
          const adsquadRaw = raw.adsquads?.[0]?.adsquad ?? {};
          result.resolvedPlacementV2 = adsquadRaw["placement_v2"] ?? null;
          result.resolvedPlacementLegacy = adsquadRaw["placement"] ?? null;
        } catch (getErr) {
          result.resolvedPlacementV2 = `GET_FAILED: ${sanitizeSnapError(getErr)}`;
        }

        // Attempt the exact budget edit the in-app inline editor uses (updateAdSquad → PUT).
        // Success here = squad stays editable; failure (E2025) = squad is frozen.
        try {
          await updateAdSquad(created.id, { daily_budget_micro: 6_000_000 }, adAccountId);
          result.editOk = true;
        } catch (editErr) {
          result.editOk = false;
          result.editError = sanitizeSnapError(editErr);
        }
      } catch (variantErr) {
        result.createError = sanitizeSnapError(variantErr);
      }

      results.push(result);
    }
  } finally {
    // 3) Clean up EVERYTHING so nothing is left running.
    for (const id of createdSquadIds) {
      try {
        await deleteAdSquad(id, adAccountId);
        cleanup.push({ entity: "adsquad", id, ok: true, error: null });
      } catch (delErr) {
        cleanup.push({ entity: "adsquad", id, ok: false, error: sanitizeSnapError(delErr) });
      }
    }
    if (campaignId) {
      try {
        await deleteCampaign(campaignId, adAccountId);
        cleanup.push({ entity: "campaign", id: campaignId, ok: true, error: null });
      } catch (delErr) {
        cleanup.push({ entity: "campaign", id: campaignId, ok: false, error: sanitizeSnapError(delErr) });
      }
    }
  }

  const report = {
    ranAt: new Date(ts).toISOString(),
    adAccountId,
    withPixelVariant: !!pixelId,
    results,
    cleanup,
    truthTable: results.map((r) => ({
      variant: r.key,
      created: r.createOk,
      resolvedPlacement: r.resolvedPlacementV2 ?? r.resolvedPlacementLegacy,
      editableAfterCreate: r.editOk,
      note: r.createError ?? r.editError ?? "ok",
    })),
  };

  // Log the full report so it can be pulled from Vercel runtime logs even if the
  // HTTP response is lost. This is the primary evidence for the placement debugger.
  console.log("[placement-probe] REPORT:", JSON.stringify(report));

  return NextResponse.json(report);
}

// ── Phase 1 of the Ads-Manager test ──────────────────────────────────────────
// Create ONE editable squad (no placement_v2), confirm it's editable, and LEAVE it
// running (paused) so the user can change its placements in Snapchat Ads Manager.
async function handleAmCreate(adAccountId: string) {
  const ts = Date.now();
  const campRes = await createCampaigns(adAccountId, [
    {
      name: `${AM_PREFIX} campaign ${ts}`,
      ad_account_id: adAccountId,
      status: "PAUSED",
      buy_model: "AUCTION",
      start_time: new Date(ts + 60_000).toISOString(),
      objective_v2_properties: { objective_v2_type: "SALES" },
    },
  ]);
  const camp = campRes[0];
  if (!camp?.id || camp.error) {
    return NextResponse.json({ error: "probe_campaign_create_failed", detail: sanitizeSnapError(camp?.error ?? "no campaign id returned") }, { status: 502 });
  }
  const campaignId = camp.id;

  const squadName = `${AM_PREFIX} editable ${ts}`;
  const squad: SnapAdSquadPayload = {
    campaign_id: campaignId,
    name: squadName,
    type: "SNAP_ADS",
    status: "PAUSED",
    targeting: { geos: [{ country_code: "us" }] },
    delivery_constraint: "DAILY_BUDGET",
    billing_event: "IMPRESSION",
    optimization_goal: "LANDING_PAGE_VIEW",
    bid_strategy: "AUTO_BID",
    daily_budget_micro: 5_000_000,
    pacing_type: "STANDARD",
  };
  const createRes = await createAdSquads(campaignId, [squad]);
  const created = createRes[0];
  if (!created?.id || created.error) {
    try { await deleteCampaign(campaignId, adAccountId); } catch { /* best effort */ }
    return NextResponse.json({ error: "probe_squad_create_failed", detail: sanitizeSnapError(created?.error ?? "no ad squad id returned") }, { status: 502 });
  }
  const squadId = created.id;

  // Confirm the app CAN edit it right now (before any Ads Manager change).
  let initialEditOk = false;
  let initialEditError: string | null = null;
  try {
    await updateAdSquad(squadId, { daily_budget_micro: 6_000_000 }, adAccountId);
    initialEditOk = true;
  } catch (e) {
    initialEditError = sanitizeSnapError(e);
  }

  const report = { mode: "adsmanager-create", ranAt: new Date(ts).toISOString(), adAccountId, campaignId, squadId, squadName, initialEditOk, initialEditError };
  console.log("[placement-probe] AM-CREATE:", JSON.stringify(report));
  return NextResponse.json(report);
}

// ── Phase 2 of the Ads-Manager test ──────────────────────────────────────────
// After the user edits the squad's placements in Ads Manager, check whether the app
// can STILL edit its budget via the API. Then delete the test squad + campaign.
async function handleAmRecheck(adAccountId: string, squadId: string, campaignId: string) {
  // Safety backstop: only ever touch squads THIS probe created. Verify the name prefix
  // before editing or deleting, so a stale/wrong id can't mutate a real squad.
  let squadName = "";
  let resolvedPlacementV2: unknown = null;
  let resolvedPlacementLegacy: unknown = null;
  try {
    const raw = await snapFetch<{ adsquads?: Array<{ adsquad?: Record<string, unknown> }> }>(`/adsquads/${squadId}`);
    const a = raw.adsquads?.[0]?.adsquad ?? {};
    squadName = String(a["name"] ?? "");
    resolvedPlacementV2 = a["placement_v2"] ?? null;
    resolvedPlacementLegacy = a["placement"] ?? null;
  } catch (e) {
    return NextResponse.json({ error: "squad_lookup_failed", detail: sanitizeSnapError(e) }, { status: 502 });
  }
  if (!squadName.startsWith(AM_PREFIX)) {
    return NextResponse.json({ error: "not_a_probe_squad", detail: "Refusing to edit or delete a squad this probe did not create." }, { status: 400 });
  }

  // THE TEST: can the app still change budget after the Ads Manager placement edit?
  let editableAfterAdsManagerChange = false;
  let editError: string | null = null;
  try {
    await updateAdSquad(squadId, { daily_budget_micro: 7_000_000 }, adAccountId);
    editableAfterAdsManagerChange = true;
  } catch (e) {
    editError = sanitizeSnapError(e);
  }

  // Clean up: delete the squad, then the campaign (campaign only if it's a probe campaign).
  const cleanup: { entity: string; id: string; ok: boolean; error: string | null }[] = [];
  try {
    await deleteAdSquad(squadId, adAccountId);
    cleanup.push({ entity: "adsquad", id: squadId, ok: true, error: null });
  } catch (e) {
    cleanup.push({ entity: "adsquad", id: squadId, ok: false, error: sanitizeSnapError(e) });
  }
  try {
    const camp = await getCampaign(campaignId);
    if (String(camp.name ?? "").startsWith(AM_PREFIX)) {
      await deleteCampaign(campaignId, adAccountId);
      cleanup.push({ entity: "campaign", id: campaignId, ok: true, error: null });
    } else {
      cleanup.push({ entity: "campaign", id: campaignId, ok: false, error: "not a probe campaign — not deleted" });
    }
  } catch (e) {
    cleanup.push({ entity: "campaign", id: campaignId, ok: false, error: sanitizeSnapError(e) });
  }

  const report = {
    mode: "adsmanager-recheck",
    squadId,
    campaignId,
    resolvedPlacementV2,
    resolvedPlacementLegacy,
    editableAfterAdsManagerChange,
    editError,
    cleanup,
  };
  console.log("[placement-probe] AM-RECHECK:", JSON.stringify(report));
  return NextResponse.json(report);
}
