import { metaFetch } from "./client";

export interface BusinessPageInfo {
  name?: string;
  businessName?: string;
}

interface PageEdgeResponse {
  data?: { id: string; name?: string }[];
  paging?: { next?: string };
}

// Walk a paginated pages edge (owned_pages / client_pages), recording each page's
// name + owning business. First business to claim a page id wins (dedup).
async function collectPages(
  firstPath: string,
  businessName: string | undefined,
  out: Record<string, BusinessPageInfo>
): Promise<void> {
  let path: string | null = firstPath;
  while (path) {
    const res: PageEdgeResponse = await metaFetch<PageEdgeResponse>(path);
    for (const p of res.data ?? []) {
      if (!out[p.id]) out[p.id] = { name: p.name, businessName };
    }
    path = res.paging?.next ?? null;
  }
}

/**
 * Every Facebook Page across the user's Business Managers, keyed by page id,
 * with its name + owning Business Manager name. This is the authoritative page
 * list for the Ad Limits table (it includes pages with zero running ads that
 * the ads_volume feed omits) and supplies names in one pass (no per-id lookups).
 * Requires the business_management scope. Per-business/edge failures are
 * swallowed so one inaccessible business doesn't blank the whole list.
 */
export async function getBusinessPages(): Promise<Record<string, BusinessPageInfo>> {
  const out: Record<string, BusinessPageInfo> = {};
  const bizes = await metaFetch<{ data: { id: string; name?: string }[] }>(
    `/me/businesses?fields=id,name&limit=100`
  );
  for (const b of bizes.data ?? []) {
    try {
      await collectPages(`/${b.id}/owned_pages?fields=id,name&limit=200`, b.name, out);
    } catch (e) {
      console.error(`[meta/business-pages] owned_pages failed for ${b.id}:`, e);
    }
    try {
      await collectPages(`/${b.id}/client_pages?fields=id,name&limit=200`, b.name, out);
    } catch (e) {
      console.error(`[meta/business-pages] client_pages failed for ${b.id}:`, e);
    }
  }
  return out;
}
