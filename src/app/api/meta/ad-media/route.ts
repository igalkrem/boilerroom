import { NextRequest, NextResponse } from "next/server";
import { getAd } from "@/lib/meta/ads";
import { getAdCreative } from "@/lib/meta/creatives";
import { resolveAdMedia } from "@/lib/meta/media-download";
import { getSession, isSessionValid, isMetaConnected, isMetaAdAccountAllowed } from "@/lib/session";
import JSZip from "jszip";

export const maxDuration = 120;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ad";
}

function extensionFor(contentType: string | null, type: "image" | "video"): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
  };
  if (contentType) {
    const [base] = contentType.split(";");
    if (map[base.trim()]) return map[base.trim()];
  }
  return type === "image" ? "jpg" : "mp4";
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  const adId = request.nextUrl.searchParams.get("adId");
  const download = request.nextUrl.searchParams.get("download");
  if (!adId) {
    return NextResponse.json({ error: "adId required" }, { status: 400 });
  }

  let ad;
  try {
    ad = await getAd(adId);
  } catch (err) {
    console.error("[meta/ad-media] getAd failed:", err);
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!ad.account_id || !isMetaAdAccountAllowed(session, `act_${ad.account_id}`)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const creativeId = (ad.creative as { id?: string } | undefined)?.id;
  const creative = creativeId ? await getAdCreative(creativeId).catch(() => null) : null;

  let resolved;
  try {
    resolved = await resolveAdMedia(ad, creative);
  } catch (err) {
    console.error("[meta/ad-media] resolveAdMedia failed:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const slug = slugify(ad.name);

  if (!download) {
    const items = resolved.items.map((item, idx) => ({
      key: item.key,
      type: item.type,
      url: item.url,
      filename: `${slug}_${item.type}_${idx + 1}_${item.key.slice(0, 8)}`,
    }));
    return NextResponse.json({
      adName: ad.name,
      items,
      truncated: resolved.truncated,
      unresolvedCount: resolved.unresolvedCount,
    });
  }

  const zip = new JSZip();
  let zipped = 0;
  await Promise.all(
    resolved.items.map(async (item, idx) => {
      try {
        const res = await fetch(item.url);
        if (!res.ok) return;
        const contentType = res.headers.get("content-type");
        if (contentType && !contentType.startsWith("image/") && !contentType.startsWith("video/")) return;
        const buffer = Buffer.from(await res.arrayBuffer());
        const ext = extensionFor(contentType, item.type);
        zip.file(`${slug}_${item.type}_${idx + 1}_${item.key.slice(0, 8)}.${ext}`, buffer);
        zipped++;
      } catch (err) {
        console.error(`[meta/ad-media] failed to fetch media ${item.key}:`, err);
      }
    })
  );

  if (zipped === 0) {
    return NextResponse.json({ error: "no_media_downloaded" }, { status: 502 });
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer", compression: "STORE" });
  return new NextResponse(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}-media.zip"`,
    },
  });
}
