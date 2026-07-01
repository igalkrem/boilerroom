import { NextRequest, NextResponse } from "next/server";
import { createAdSquads, deleteAdSquad, getAdSquad, getAdSquadsForAccount, updateAdSquad, setAdSquadPlacement } from "@/lib/snapchat/adsquads";
import { getSession, isSessionValid, isSnapchatConnected, isAdAccountAllowed } from "@/lib/session";
import type { SnapAdSquadPayload } from "@/types/snapchat";
import { z } from "zod";

export const maxDuration = 60;

const bodySchema = z.object({
  adAccountId: z.string().min(1),
  campaignId: z.string().min(1),
  adsquads: z.array(z.record(z.string(), z.unknown())).min(1)
    .refine(
      (items) => { const n = items.map((i) => i.name as string).filter(Boolean); return new Set(n).size === n.length; },
      { message: "Duplicate names in batch" }
    ),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
  }

  const adAccountId = request.nextUrl.searchParams.get("adAccountId");
  const adSquadId = request.nextUrl.searchParams.get("adSquadId");
  if (!adAccountId) {
    return NextResponse.json({ error: "adAccountId query param required" }, { status: 400 });
  }
  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    if (adSquadId) {
      const adsquad = await getAdSquad(adSquadId);
      if (adsquad.ad_account_id && adsquad.ad_account_id !== adAccountId) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      return NextResponse.json({ adsquad });
    }
    const adsquads = await getAdSquadsForAccount(adAccountId);
    return NextResponse.json({ adsquads });
  } catch (err) {
    console.error("Get ad squad(s) error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
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
    console.error("Adsquads body validation failed:", JSON.stringify(parsed.error.flatten()), "body keys:", body ? Object.keys(body) : null);
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }
  const { adAccountId, campaignId, adsquads } = parsed.data as unknown as {
    adAccountId: string;
    campaignId: string;
    adsquads: SnapAdSquadPayload[];
  };

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const results = await createAdSquads(campaignId, adsquads);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Create adsquads error:", err);
    const message = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    adAccountId?: string;
    squadId?: string;
    daily_budget_micro?: number;
    bid_micro?: number;
    status?: "ACTIVE" | "PAUSED";
    placement_v2?: { config: string; platforms?: string[]; snapchat_positions?: string[] };
  } | null;

  if (!body || typeof body.adAccountId !== "string" || typeof body.squadId !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { adAccountId, squadId, daily_budget_micro, bid_micro, status, placement_v2 } = body;

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    if (placement_v2) {
      const updated = await setAdSquadPlacement(squadId, placement_v2, adAccountId);
      return NextResponse.json({ adsquad: updated });
    }
    const updated = await updateAdSquad(squadId, { daily_budget_micro, bid_micro, status }, adAccountId);
    return NextResponse.json({ adsquad: updated });
  } catch (err) {
    console.error("Update ad squad error:", err);
    const raw = err instanceof Error ? err.message : "internal_error";
    if (raw.startsWith("forbidden:")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    // snapFetch throws "Snapchat API error {status}: {full_body}" — strip the raw response body
    // so internal debug_message fields are never forwarded to the browser.
    // Structured sub_request_error_reason strings (e.g. "E2025: ...") are safe to surface.
    if (raw.startsWith("catalogue_squad_readonly:")) {
      return NextResponse.json({ error: "catalogue_squad_readonly", message: raw.replace("catalogue_squad_readonly: ", "") }, { status: 422 });
    }
    const clientMessage = raw.startsWith("Snapchat API error") ? "snapchat_request_failed" : raw;
    return NextResponse.json({ error: "update_failed", message: clientMessage }, { status: 502 });
  }
}

const deleteSchema = z.object({
  adAccountId: z.string().min(1),
  squadId: z.string().min(1),
});

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  }
  const { adAccountId, squadId } = parsed.data;

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    await deleteAdSquad(squadId, adAccountId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete ad squad error:", err);
    const raw = err instanceof Error ? err.message : "internal_error";
    if (raw.startsWith("forbidden:")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const clientMessage = raw.startsWith("Snapchat API error") ? "snapchat_request_failed" : raw;
    return NextResponse.json({ error: "delete_failed", message: clientMessage }, { status: 502 });
  }
}
