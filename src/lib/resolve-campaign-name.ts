import type { CampaignBuildItem } from "@/types/wizard";
import type { NamingSegment } from "@/types/feed-provider";

export function generateUniqueId4(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

type ResolveContext = {
  presetName: string;
  articleSlug: string;
  creativeFilename: string;
  presetTag?: string;
  uniqueId4?: string;
};

export function resolveCampaignName(
  fallbackTemplate: string,
  item: CampaignBuildItem,
  context: ResolveContext,
  providerTemplate?: NamingSegment[]
): string {
  if (providerTemplate && providerTemplate.length > 0) {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    return providerTemplate
      .map((seg) => {
        if (seg.type === "literal") return seg.value;
        switch (seg.value) {
          case "preset.tag":   return context.presetTag ?? "";
          case "article.name": return context.articleSlug;
          case "date_ddmm":    return `${dd}${mm}`;
          case "unique_id_4":  return context.uniqueId4 ?? generateUniqueId4();
          case "preset.name":  return context.presetName;
          case "index":        return String(item.duplicationIndex + 1);
          default:             return seg.value;
        }
      })
      .filter((s) => s.length > 0)
      .join(" | ");
  }

  // Fallback: freeform string-replace template (ReviewAndPost global template)
  const today = new Date().toISOString().slice(0, 10);
  return fallbackTemplate
    .replace(/\{\{preset\.name\}\}/gi, context.presetName)
    .replace(/\{\{article\.name\}\}/gi, context.articleSlug)
    .replace(/\{\{creative\.filename\}\}/gi, context.creativeFilename)
    .replace(/\{\{date\}\}/gi, today)
    .replace(/\{\{index\}\}/gi, String(item.duplicationIndex + 1));
}
