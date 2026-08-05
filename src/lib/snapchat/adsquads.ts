import { snapFetch } from "./client";
import type { SnapAdSquadPayload, SnapAdSquad, SnapBatchResponse, SnapApiItem } from "@/types/snapchat";

export async function getAdSquads(campaignId: string, token?: string): Promise<SnapAdSquad[]> {
  const data = await snapFetch<{ adsquads: Array<SnapApiItem<SnapAdSquad>> }>(
    `/campaigns/${campaignId}/adsquads`,
    {},
    token
  );
  return (data.adsquads ?? [])
    .filter((item) => item.sub_request_status === "SUCCESS" && item.adsquad)
    .map((item) => item.adsquad!);
}

export async function getAdSquad(adSquadId: string, token?: string): Promise<SnapAdSquad> {
  const data = await snapFetch<{ adsquads: Array<SnapApiItem<SnapAdSquad>> }>(
    `/adsquads/${adSquadId}`,
    {},
    token
  );
  const item = data.adsquads?.[0];
  if (!item?.adsquad) throw new Error("Ad squad not found");
  return item.adsquad;
}

/**
 * Reads the REAL placement_v2 object of a Smart/Custom-placement squad.
 *
 * `placement_v2` is invisible to a plain GET — it is only returned when
 * `?return_placement_v2=true` is passed. That parameter is undocumented publicly; it came from
 * Snapchat TAS via support on 2026-08-05 and is the key to editing locked squads at all
 * (see updateAdSquad below).
 *
 * ONLY call this for a squad already known to be locked (`placement === "UNSUPPORTED"`).
 * For an ordinary squad the flagged GET does NOT return "no placement" — it returns a
 * SYNTHESISED object, confirmed live 2026-08-05 on a squad created with no placement_v2 at all:
 *   {"config":"CUSTOM","platforms":["SNAPCHAT"],
 *    "snapchat_positions":["INTERSTITIAL_USER","INTERSTITIAL_CONTENT","INSTREAM"]}
 * That is Snapchat's placement_v2 translation of the legacy SNAP_ADS default, NOT the squad's
 * own config. Echoing it back on a PIXEL_PURCHASE squad fails with E21011 (CHAT_FEED required),
 * and anywhere it did succeed it would convert a fully editable squad into a locked
 * CUSTOM-placement one. Hence the lock check must come first, and must use the PLAIN GET —
 * the flagged GET omits the legacy `placement` field entirely.
 */
export async function getAdSquadPlacementV2(
  adSquadId: string,
  token?: string
): Promise<SnapAdSquad["placement_v2"] | undefined> {
  const data = await snapFetch<{ adsquads: Array<SnapApiItem<SnapAdSquad>> }>(
    `/adsquads/${adSquadId}?return_placement_v2=true`,
    {},
    token
  );
  return data.adsquads?.[0]?.adsquad?.placement_v2;
}

export async function getAdSquadsByAccount(adAccountId: string, token?: string): Promise<SnapAdSquad[]> {
  const data = await snapFetch<{ adsquads?: Array<SnapApiItem<SnapAdSquad>> }>(
    `/adaccounts/${adAccountId}/adsquads`,
    {},
    token
  );
  return (data.adsquads ?? [])
    .filter((item) => item.sub_request_status === "SUCCESS" && item.adsquad)
    .map((item) => item.adsquad!);
}

export async function getAdSquadsForAccount(adAccountId: string, token?: string): Promise<SnapAdSquad[]> {
  return getAdSquadsByAccount(adAccountId, token);
}

// Fields Snapchat will accept on a PUT /adsquads/{id} body. Anything else
// (created_at, updated_at, delivery_status, effective_status, forced_view_eligibility,
// auto_bid, ranking_score, etc.) is server-computed and causes sub_request_status: "ERROR"
// when echoed back.
// placement_v2 is absent from this list on purpose, but NOT because it must never be sent —
// it is added explicitly in updateAdSquad for locked squads, sourced from the flagged GET.
// A plain GET never returns it, so stripForPut (which operates on a plain-GET squad) could
// not populate it anyway.
const ADSQUAD_PUT_ALLOWED_FIELDS = [
  "id",
  "campaign_id",
  "name",
  "type",
  "status",
  "targeting",
  "delivery_constraint",
  "billing_event",
  "optimization_goal",
  "bid_strategy",
  "bid_micro",
  "daily_budget_micro",
  "lifetime_budget_micro",
  "conversion_window",
  "pacing_type",
  "start_time",
  "end_time",
  "pixel_id",
] as const;

function stripForPut(adsquad: SnapAdSquad): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ADSQUAD_PUT_ALLOWED_FIELDS) {
    const v = (adsquad as unknown as Record<string, unknown>)[k];
    // Exclude null/undefined — null from the API response is not the same as "not set"
    // and sending bid_micro: null triggers E2771 "Bid is required on ad squad".
    // Also exclude bid_micro: 0 (auto-bid squads return 0; Snapchat still rejects it).
    if (v == null) continue;
    if (k === "bid_micro" && (typeof v !== "number" || v <= 0)) continue;
    out[k] = v;
  }
  return out;
}

export async function updateAdSquad(
  adSquadId: string,
  updates: { daily_budget_micro?: number; bid_micro?: number; status?: "ACTIVE" | "PAUSED" },
  expectedAdAccountId: string
): Promise<SnapAdSquad> {
  const current = await getAdSquad(adSquadId);
  if (current.ad_account_id && current.ad_account_id !== expectedAdAccountId) {
    throw new Error("forbidden: ad squad does not belong to the specified ad account");
  }

  // Smart-placement squads ARE editable. E2025 was never an entity lock — it fires because the
  // PUT body OMITS placement_v2, which Snapchat reads as an attempt to clear the field. Echo the
  // squad's own placement_v2 back and budget, bid and status all apply normally.
  //
  // Confirmed live 2026-08-05 on the same squad seconds apart: PUT with placement_v2 echoed ->
  // SUCCESS (budget 5,000,000 -> 6,000,000, verified by fresh GET); the identical PUT with that
  // one field removed -> "E2025: Update is not supported for this entity : [AdSquad was created
  // with placement v2, please update the placement in Ads Manager]". Re-confirmed for bid_micro
  // and status on a squad with an explicit bid strategy. The `return_placement_v2=true` GET
  // parameter that makes this possible came from Snapchat TAS via support; a plain GET does not
  // return placement_v2 at all, which is why this went undiagnosed for so long.
  //
  // Order matters and is load-bearing:
  //   1. Lock detection uses the PLAIN GET's legacy `placement` field. The flagged GET omits
  //      `placement` entirely, so it cannot be used for this.
  //   2. Only then fetch placement_v2, and only for a locked squad — see getAdSquadPlacementV2
  //      for why calling it on an ordinary squad would corrupt that squad's placement.
  const isLocked = current.placement === "UNSUPPORTED";
  const placementV2 = isLocked ? await getAdSquadPlacementV2(adSquadId) : undefined;

  // Filter undefined values — spreading undefined overrides valid values from stripForPut,
  // causing bid_micro to disappear from the PUT body and triggering E2771 on non-auto-bid squads.
  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );
  const merged: Record<string, unknown> = { ...stripForPut(current), ...cleanUpdates };
  // Echo the locked squad's own placement_v2 verbatim. Omitting it is what triggers E2025.
  if (placementV2) merged.placement_v2 = placementV2;
  const data = await snapFetch<{ adsquads: Array<SnapApiItem<SnapAdSquad>> }>(
    `/campaigns/${current.campaign_id}/adsquads`,
    {
      method: "PUT",
      body: JSON.stringify({ adsquads: [merged] }),
    }
  );
  const item = data.adsquads?.[0];
  if (!item) throw new Error("Ad squad update failed: empty response");
  if (item.sub_request_status !== "SUCCESS") {
    const detail = item.error_type ?? item.error?.error_type;
    const msg = item.message ?? item.error?.message ?? item.sub_request_error_reason ?? "";
    console.error("[updateAdSquad] Snapchat ERROR:", { adSquadId, updates, raw: item });
    // E4001: Snapchat server-side bug — fails to copy immutable catalogVertical on Collection ad squads.
    // Budget/bid/status changes to Catalogue campaigns are not supported via the API.
    if (typeof msg === "string" && msg.includes("catalogVertical")) {
      throw new Error("catalogue_squad_readonly: Budget, bid, and status edits are not supported for Catalogue (Collection) campaigns via the Snapchat API.");
    }
    const composed = [detail, msg].filter(Boolean).join(": ") || "Snapchat rejected the update";
    throw new Error(composed);
  }
  if (!item.adsquad) throw new Error("Ad squad update failed: no adsquad in response");
  return item.adsquad;
}

export async function deleteAdSquad(
  adSquadId: string,
  expectedAdAccountId: string
): Promise<void> {
  const current = await getAdSquad(adSquadId);
  if (current.ad_account_id && current.ad_account_id !== expectedAdAccountId) {
    throw new Error("forbidden: ad squad does not belong to the specified ad account");
  }
  await snapFetch<unknown>(`/adsquads/${adSquadId}`, { method: "DELETE" });
}

export async function setAdSquadPlacement(
  squadId: string,
  placement: { config: string; platforms?: string[]; snapchat_positions?: string[] },
  expectedAdAccountId: string
): Promise<SnapAdSquad> {
  const current = await getAdSquad(squadId);
  if (current.ad_account_id && current.ad_account_id !== expectedAdAccountId) {
    throw new Error("forbidden: ad squad does not belong to the specified ad account");
  }
  const putBody = { ...stripForPut(current as SnapAdSquad), placement_v2: placement };
  const data = await snapFetch<{ adsquads: Array<SnapApiItem<SnapAdSquad>> }>(
    `/campaigns/${current.campaign_id}/adsquads`,
    { method: "PUT", body: JSON.stringify({ adsquads: [putBody] }) }
  );
  const item = data.adsquads?.[0];
  if (!item) throw new Error("Placement update: empty response");
  if (item.sub_request_status !== "SUCCESS") {
    const detail = item.error_type ?? item.error?.error_type;
    const msg = item.message ?? item.error?.message ?? item.sub_request_error_reason;
    console.error("[setAdSquadPlacement] ERROR:", { squadId, raw: item });
    throw new Error([detail, msg].filter(Boolean).join(": ") || "Snapchat rejected placement update");
  }
  if (!item.adsquad) throw new Error("Placement update: no adsquad in response");
  return item.adsquad;
}

export async function createAdSquads(
  campaignId: string,
  adsquads: SnapAdSquadPayload[]
): Promise<Array<SnapAdSquad & { error?: string }>> {
  // Log payload in all environments — E1001 batch failures are invisible without this
  console.log("[createAdSquads] payload:", JSON.stringify({ adsquads }));
  const data = await snapFetch<SnapBatchResponse<SnapAdSquad>>(
    `/campaigns/${campaignId}/adsquads`,
    {
      method: "POST",
      body: JSON.stringify({ adsquads }),
    }
  );

  const mapped = (data.adsquads ?? []).map((item) => {
    if (item.sub_request_status !== "SUCCESS") {
      const msg = item.message ?? item.error?.message;
      const detail = item.error_type ?? item.error?.error_type;
      console.error("Ad squad create failed:", { error_type: detail, message: msg, raw: item });
    }
    return {
      ...(item.adsquad ?? ({} as SnapAdSquad)),
      error:
        item.sub_request_status !== "SUCCESS"
          ? item.sub_request_error_reason || [item.error_type ?? item.error?.error_type, item.message ?? item.error?.message].filter(Boolean).join(": ") || "Unknown error"
          : undefined,
    };
  });
  console.log("[createAdSquads] results:", mapped.map((r) => ({ id: r.id ?? "MISSING", hasError: !!r.error, error: r.error })));
  return mapped;
}
