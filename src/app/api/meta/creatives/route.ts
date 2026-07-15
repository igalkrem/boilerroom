import { NextRequest, NextResponse } from "next/server";
import { createAdCreative } from "@/lib/meta/creatives";
import { getSession, isSessionValid, isMetaConnected, isMetaAdAccountAllowed } from "@/lib/session";
import type { MetaAdCreativePayload } from "@/types/meta";
import { z } from "zod";

export const maxDuration = 60;

const postSchema = z.object({
  adAccountId: z.string().min(1),
  creative: z.object({
    name: z.string().min(1),
    object_story_spec: z.object({
      page_id: z.string().min(1),
      link_data: z.object({
        link: z.string().min(1),
        message: z.string().optional(),
        image_hash: z.string().min(1),
        name: z.string().optional(),
        call_to_action: z.object({
          type: z.string(),
          value: z.object({ link: z.string().optional() }).optional(),
        }).optional(),
      }).optional(),
      video_data: z.object({
        video_id: z.string().min(1),
        image_hash: z.string(), // "" is valid — Meta doesn't require an explicit thumbnail override
        title: z.string().optional(),
        message: z.string().optional(),
        call_to_action: z.object({
          type: z.string(),
          value: z.object({ link: z.string().optional() }).optional(),
        }).optional(),
      }).optional(),
    }),
  }),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }

  const { adAccountId, creative } = parsed.data;
  if (!isMetaAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await createAdCreative(adAccountId, creative as MetaAdCreativePayload);
    return NextResponse.json({ creative: result });
  } catch (err) {
    console.error("[meta/creatives] POST error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
