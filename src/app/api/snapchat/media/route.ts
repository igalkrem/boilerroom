import { NextRequest, NextResponse } from "next/server";
import { createMediaEntity } from "@/lib/snapchat/media";
import { getSession, isSessionValid, isAdAccountAllowed } from "@/lib/session";
import { z } from "zod";

const bodySchema = z.object({
  adAccountId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["IMAGE", "VIDEO"]),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }
  const { adAccountId, name, type } = parsed.data;

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const { mediaId, uploadUrl } = await createMediaEntity({ ad_account_id: adAccountId, name, type });
    return NextResponse.json({ mediaId, uploadUrl });
  } catch (err) {
    console.error("Create media entity error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
