import { NextRequest, NextResponse } from "next/server";
import { createCreatives } from "@/lib/snapchat/creatives";
import { getSession, isSessionValid } from "@/lib/session";
import type { SnapCreativePayload } from "@/types/snapchat";
import { z } from "zod";

const bodySchema = z.object({
  adAccountId: z.string().min(1),
  creatives: z.array(z.record(z.string(), z.unknown())).min(1),
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
  const { adAccountId, creatives } = parsed.data as unknown as {
    adAccountId: string;
    creatives: SnapCreativePayload[];
  };

  try {
    const results = await createCreatives(adAccountId, creatives);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Create creatives error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
