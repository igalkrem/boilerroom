import { NextRequest, NextResponse } from "next/server";
import { getAd } from "@/lib/meta/ads";
import { getAdCreative } from "@/lib/meta/creatives";
import { resolveBatchMedia, MAX_ADS, type AdWithCreative } from "@/lib/meta/media-download";
import { getSession, isSessionValid, isMetaConnected, isMetaAdAccountAllowed } from "@/lib/session";
import type { MetaAd } from "@/types/meta";
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

interface AdStatus {
  adId: string;
  adName?: string;
  error?: "not_found" | "forbidden";
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  const idsParam = request.nextUrl.searchParams.get("adIds") ?? request.nextUrl.searchParams.get("adId");
  const download = request.nextUrl.searchParams.get("download");
  const adIds = [...new Set((idsParam ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, MAX_ADS);
  if (adIds.length === 0) {
    return NextResponse.json({ error: "adIds required" }, { status: 400 });
  }

  const statusByAdId = new Map<string, AdStatus>();
  const adsByAdId = new Map<string, AdWithCreative>();

  await Promise.all(
    adIds.map(async (adId) => {
      let ad: MetaAd;
      try {
        ad = await getAd(adId);
      } catch (err) {
        console.error(`[meta/ad-media] getAd failed for ${adId}:`, err);
        statusByAdId.set(adId, { adId, error: "not_found" });
        return;
      }
      if (!ad.account_id || !isMetaAdAccountAllowed(session, `act_${ad.account_id}`)) {
        statusByAdId.set(adId, { adId, error: "forbidden" });
        return;
      }
      const creativeId = (ad.creative as { id?: string } | undefined)?.id;
      const creative = creativeId ? await getAdCreative(creativeId).catch(() => null) : null;
      adsByAdId.set(adId, { adId, ad, creative });
      statusByAdId.set(adId, { adId, adName: ad.name });
    })
  );

  const adStatuses = adIds.map((adId) => statusByAdId.get(adId)!);
  const validAds = adIds.map((adId) => adsByAdId.get(adId)).filter((a): a is AdWithCreative => !!a);

  if (validAds.length === 0) {
    return NextResponse.json({ error: "no_accessible_ads", ads: adStatuses }, { status: 403 });
  }

  let resolved;
  try {
    resolved = await resolveBatchMedia(validAds);
  } catch (err) {
    console.error("[meta/ad-media] resolveBatchMedia failed:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const zipSlug = validAds.length === 1 ? slugify(validAds[0].ad.name) : `ads-${validAds.length}`;

  if (!download) {
    const items = resolved.items.map((item, idx) => ({
      key: item.key,
      type: item.type,
      url: item.url,
      filename: `${item.type}_${idx + 1}_${item.key.slice(0, 8)}`,
    }));
    return NextResponse.json({
      ads: adStatuses,
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
        zip.file(`${item.type}_${idx + 1}_${item.key.slice(0, 8)}.${ext}`, buffer);
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
      "Content-Disposition": `attachment; filename="${zipSlug}-media.zip"`,
    },
  });
}
