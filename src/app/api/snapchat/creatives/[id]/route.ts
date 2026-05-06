import { type NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isSnapchatConnected, isAdAccountAllowed } from "@/lib/session";
import { snapFetch } from "@/lib/snapchat/client";
import { getCreative } from "@/lib/snapchat/creatives";
import { z } from "zod";

const bodySchema = z.object({
  adAccountId: z.string().min(1),
  webViewUrl: z.string().min(1),
  creativeName: z.string().min(1),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
  }


  const { id: creativeId } = await params;

  let body: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 422 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isAdAccountAllowed(session, body.adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    // Fetch current creative first — Snapchat PUT replaces the full object,
    // so omitting fields like type/top_snap_media_id would reset them to defaults.
    const existing = await getCreative(creativeId);
    const data = await snapFetch<{ creatives: Array<{ creative?: { id: string }; sub_request_status?: string }> }>(
      `/adaccounts/${body.adAccountId}/creatives`,
      {
        method: "PUT",
        body: JSON.stringify({
          creatives: [
            {
              id: creativeId,
              ad_account_id: existing.ad_account_id,
              name: existing.name,
              type: existing.type,
              top_snap_media_id: existing.top_snap_media_id,
              ...(existing.headline !== undefined ? { headline: existing.headline } : {}),
              ...(existing.call_to_action ? { call_to_action: existing.call_to_action } : {}),
              ...(existing.brand_name ? { brand_name: existing.brand_name } : {}),
              ...(existing.profile_properties ? { profile_properties: existing.profile_properties } : {}),
              ...(existing.deep_link_properties ? { deep_link_properties: existing.deep_link_properties } : {}),
              web_view_properties: { url: body.webViewUrl },
            },
          ],
        }),
      }
    );
    const result = data.creatives?.[0];
    if (result?.sub_request_status && result.sub_request_status !== "SUCCESS") {
      console.error(`[patchCreative] ${creativeId} update failed:`, JSON.stringify(result));
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[patchCreative] error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
