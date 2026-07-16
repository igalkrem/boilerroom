import { NextRequest, NextResponse } from "next/server";
import { uploadImage, uploadVideo, pollVideoStatus, getVideoThumbnailUrl } from "@/lib/meta/creatives";
import { getOrCreatePageBackedInstagramAccount, isInstagramActorUsableByAdAccount } from "@/lib/meta/business-pages";
import { getCachedInstagramActorId, setCachedInstagramActorId } from "@/lib/meta/instagram-actor-cache";
import { getSession, isSessionValid, isMetaConnected, isMetaAdAccountAllowed } from "@/lib/session";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  const videoId = request.nextUrl.searchParams.get("videoId");
  const pageId = request.nextUrl.searchParams.get("pageId");
  const adAccountId = request.nextUrl.searchParams.get("adAccountId");

  if (pageId) {
    try {
      let instagramActorId = await getCachedInstagramActorId(pageId);
      if (!instagramActorId) {
        instagramActorId = await getOrCreatePageBackedInstagramAccount(pageId);
        if (instagramActorId) {
          await setCachedInstagramActorId(pageId, instagramActorId);
        }
      }

      // A page-backed IG account is only usable by ad accounts sharing the
      // page's Business Manager — confirmed live 2026-07-16 (Meta rejects it
      // outright for an unrelated ad account, "Param instagram_actor_id must
      // be a valid Instagram account id"). Verify against THIS ad account
      // before handing it back; if unusable, fall through the same non-fatal
      // "no Instagram identity" path as a failed/missing PBIA.
      if (instagramActorId && adAccountId) {
        try {
          const usable = await isInstagramActorUsableByAdAccount(adAccountId, instagramActorId);
          if (!usable) instagramActorId = undefined;
        } catch (err) {
          console.error("[meta/media] instagram actor usability check failed:", err);
          instagramActorId = undefined;
        }
      }

      return NextResponse.json({ instagramActorId: instagramActorId ?? null });
    } catch (err) {
      console.error("[meta/media] GET page-backed IG account error:", err);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  }

  if (!videoId) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  try {
    const thumbnailUrl = await getVideoThumbnailUrl(videoId);
    return NextResponse.json({ thumbnailUrl: thumbnailUrl ?? null });
  } catch (err) {
    console.error("[meta/media] GET thumbnail error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export const maxDuration = 120;

const imageSchema = z.object({
  adAccountId: z.string().min(1),
  type: z.literal("IMAGE"),
  blobUrl: z.string().url().refine(
    (url) => url.includes(".vercel-storage.com"),
    "blobUrl must be a Vercel Blob URL"
  ),
  fileName: z.string().min(1),
});

const videoSchema = z.object({
  adAccountId: z.string().min(1),
  type: z.literal("VIDEO"),
  blobUrl: z.string().url().refine(
    (url) => url.includes(".vercel-storage.com"),
    "blobUrl must be a Vercel Blob URL"
  ),
  title: z.string().min(1),
});

const bodySchema = z.discriminatedUnion("type", [imageSchema, videoSchema]);

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }

  const { adAccountId } = parsed.data;
  if (!isMetaAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    if (parsed.data.type === "IMAGE") {
      const blobRes = await fetch(parsed.data.blobUrl);
      if (!blobRes.ok) throw new Error("Failed to fetch blob");
      const imageBytes = Buffer.from(await blobRes.arrayBuffer());
      const result = await uploadImage(adAccountId, imageBytes, parsed.data.fileName);
      return NextResponse.json({ type: "IMAGE", imageHash: result.hash, url: result.url });
    }

    const videoId = await uploadVideo(adAccountId, parsed.data.blobUrl, parsed.data.title);
    await pollVideoStatus(videoId);
    return NextResponse.json({ type: "VIDEO", videoId });
  } catch (err) {
    console.error("[meta/media] POST error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
