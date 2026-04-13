import { NextRequest, NextResponse } from "next/server";
import { createAds } from "@/lib/snapchat/ads";
import { getSession, isSessionValid } from "@/lib/session";
import type { SnapAdPayload } from "@/types/snapchat";
import { z } from "zod";

const bodySchema = z.object({
  adSquadId: z.string().min(1),
  ads: z.array(z.record(z.string(), z.unknown())).min(1),
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
  const { adSquadId, ads } = parsed.data as unknown as {
    adSquadId: string;
    ads: SnapAdPayload[];
  };

  try {
    const results = await createAds(adSquadId, ads);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Create ads error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
