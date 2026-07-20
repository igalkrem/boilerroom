import { NextRequest, NextResponse } from "next/server";
import { createAdCreative } from "@/lib/meta/creatives";
import { getSession, isSessionValid, isMetaConnected, isMetaAdAccountAllowed } from "@/lib/session";
import type { MetaAdCreativePayload } from "@/types/meta";
import { z } from "zod";

export const maxDuration = 60;

// Mirrors MetaDegreesOfFreedomSpec (src/types/meta.ts) — without this, Zod's
// default .strip() behavior silently drops degrees_of_freedom_spec before it
// reaches Meta, so "Advantage+ creative optimizations" never actually enrolls
// (confirmed live 2026-07-20: a real launched creative echoed back every flag
// as OPT_OUT even though the orchestrator sent OPT_IN — the field never left
// this route). Keys are a record, not individual optional fields, so any
// current/future flag `buildAdvantagePlusCreativeFeatures` sets passes through.
const degreesOfFreedomSpecSchema = z.object({
  creative_features_spec: z.record(z.string(), z.object({ enroll_status: z.enum(["OPT_IN", "OPT_OUT"]) })),
});

const postSchema = z.object({
  adAccountId: z.string().min(1),
  creative: z.object({
    name: z.string().min(1),
    instagram_actor_id: z.string().optional(),
    degrees_of_freedom_spec: degreesOfFreedomSpecSchema.optional(),
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
        image_hash: z.string().optional(),
        image_url: z.string().optional(), // Meta's auto-generated video thumbnail — required unless image_hash is set
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
    console.error(
      `[meta/creatives] POST error for adAccountId=${adAccountId} pageId=${creative.object_story_spec.page_id} instagram_actor_id=${creative.instagram_actor_id ?? "none"}:`,
      err
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
