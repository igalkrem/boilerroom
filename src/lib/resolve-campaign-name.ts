import type { CampaignBuildItem } from "@/types/wizard";

export function resolveCampaignName(
  template: string,
  item: CampaignBuildItem,
  context: { presetName: string; articleSlug: string; creativeFilename: string }
): string {
  const today = new Date().toISOString().slice(0, 10);
  return template
    .replace(/\{\{preset\.name\}\}/gi, context.presetName)
    .replace(/\{\{article\.name\}\}/gi, context.articleSlug)
    .replace(/\{\{creative\.filename\}\}/gi, context.creativeFilename)
    .replace(/\{\{date\}\}/gi, today)
    .replace(/\{\{index\}\}/gi, String(item.duplicationIndex + 1));
}
