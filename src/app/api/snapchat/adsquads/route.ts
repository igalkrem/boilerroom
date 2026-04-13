import { NextRequest, NextResponse } from "next/server";
import { createAdSquads } from "@/lib/snapchat/adsquads";
import { getSession, isSessionValid } from "@/lib/session";
import type { SnapAdSquadPayload } from "@/types/snapchat";
import { z } from "zod";

const bodySchema = z.object({
  campaignId: z.string().min(1),
  adsquads: z.array(z.record(z.string(), z.unknown())).min(1),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 422 });
  }
  const { campaignId, adsquads } = parsed.data as unknown as {
    campaignId: string;
    adsquads: SnapAdSquadPayload[];
  };

  try {
    const results = await createAdSquads(campaignId, adsquads);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Create adsquads error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
