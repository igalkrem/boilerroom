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

export async function getAdSquad(adSquadId: string): Promise<SnapAdSquad> {
  const data = await snapFetch<{ adsquads: Array<SnapApiItem<SnapAdSquad>> }>(
    `/adsquads/${adSquadId}`
  );
  const item = data.adsquads?.[0];
  if (!item?.adsquad) throw new Error("Ad squad not found");
  return item.adsquad;
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
// auto_bid, ranking_score, placement_v2, etc.) is server-computed or locked and causes
// sub_request_status: "ERROR" or E2025 when echoed back.
// placement_v2 is intentionally excluded: squads created with placement_v2 return E2025
// ("Update is not supported for this entity") when it appears in the PUT body.
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
  updates: { daily_budget_micro?: number; bid_micro?: number; status?: "ACTIVE" | "PAUSED" }
): Promise<SnapAdSquad> {
  const current = await getAdSquad(adSquadId);
  // Filter undefined values — spreading undefined overrides valid values from stripForPut,
  // causing bid_micro to disappear from the PUT body and triggering E2771 on non-auto-bid squads.
  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );
  const merged = { ...stripForPut(current), ...cleanUpdates };
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
    const msg = item.message ?? item.error?.message ?? item.sub_request_error_reason;
    const composed = [detail, msg].filter(Boolean).join(": ") || "Snapchat rejected the update";
    console.error("[updateAdSquad] Snapchat ERROR:", { adSquadId, updates, raw: item });
    throw new Error(composed);
  }
  if (!item.adsquad) throw new Error("Ad squad update failed: no adsquad in response");
  return item.adsquad;
}

export async function createAdSquads(
  campaignId: string,
  adsquads: SnapAdSquadPayload[]
): Promise<Array<SnapAdSquad & { error?: string }>> {
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
