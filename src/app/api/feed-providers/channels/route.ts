import { type NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";
import { runMigrations, listChannels, bulkInsertChannels, deleteChannels, forceChannelStatus, bulkForceChannelStatus } from "@/lib/db";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await runMigrations();
  const feedProviderId = req.nextUrl.searchParams.get("feedProviderId");
  const trafficSource = req.nextUrl.searchParams.get("trafficSource") ?? undefined;
  if (!feedProviderId) {
    return NextResponse.json({ error: "feedProviderId required" }, { status: 400 });
  }
  try {
    const rows = await listChannels(feedProviderId, session.googleUserId, trafficSource);
    const grouped = {
      available: rows.filter((r) => r.status === "available"),
      inUse: rows.filter((r) => r.status === "in-use"),
      cooldown: rows.filter((r) => r.status === "cooldown"),
    };
    return NextResponse.json(grouped);
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await runMigrations();
  let body: { feedProviderId: string; rows: Array<{ channelId: string; trafficSource: string }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.feedProviderId || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "feedProviderId and rows required" }, { status: 400 });
  }
  try {
    await bulkInsertChannels(body.feedProviderId, body.rows, session.googleUserId);
    return NextResponse.json({ ok: true, count: body.rows.length });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await runMigrations();
  let body: { id?: string; feedProviderId?: string; newStatus: "available" | "cooldown" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!["available", "cooldown"].includes(body.newStatus)) {
    return NextResponse.json({ error: "newStatus (available|cooldown) required" }, { status: 400 });
  }
  try {
    // Bulk: move all in-use channels for a provider at once
    if (body.feedProviderId && !body.id) {
      const updated = await bulkForceChannelStatus(body.feedProviderId, session.googleUserId, body.newStatus);
      return NextResponse.json({ ok: true, updated });
    }
    // Single: move one channel by row ID
    if (!body.id) {
      return NextResponse.json({ error: "id or feedProviderId required" }, { status: 400 });
    }
    await forceChannelStatus(body.id, session.googleUserId, body.newStatus);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await runMigrations();
  let body: { ids: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!Array.isArray(body.ids)) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  try {
    await deleteChannels(body.ids, session.googleUserId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
