import { NextRequest, NextResponse } from "next/server";
import { createCreativeElements } from "@/lib/snapchat/collection";
import { getSession, isSessionValid, isSnapchatConnected, isAdAccountAllowed } from "@/lib/session";
import type { SnapCreativeElementPayload } from "@/types/snapchat";
import { z } from "zod";

export const maxDuration = 60;

const bodySchema = z.object({
  adAccountId: z.string().min(1),
  elements: z.array(z.record(z.string(), z.unknown())).min(1).max(10),
});

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
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }
  const { adAccountId, elements } = parsed.data as unknown as {
    adAccountId: string;
    elements: SnapCreativeElementPayload[];
  };

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const results = await createCreativeElements(adAccountId, elements);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Create creative elements error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
