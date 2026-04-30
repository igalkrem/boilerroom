"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ReviewAndPost } from "./ReviewAndPost";

const CampaignCanvas = dynamic(
  () => import("./CampaignCanvas").then((m) => ({ default: m.CampaignCanvas })),
  { ssr: false }
);
import { useCanvasStore } from "@/hooks/useCanvasStore";
import { loadFeedProviders } from "@/lib/feed-providers";
import { loadArticles } from "@/lib/articles";
import { loadPresets } from "@/lib/presets";
import { getAssetById, upsertAsset } from "@/lib/silo";
import { synthesizeCampaign } from "@/lib/synthesize-campaign";
import { runSubmission } from "@/lib/submission-orchestrator";
import { resolveCampaignName, generateUniqueId4 } from "@/lib/resolve-campaign-name";
import type { CampaignBuildItem, SubmissionResults } from "@/types/wizard";

type Mode = "canvas" | "review" | "done";

export function WizardShell({ adAccountId }: { adAccountId?: string }) {
  const canvasStore = useCanvasStore();
  const [mode, setMode] = useState<Mode>("canvas");

  // adAccountId is no longer pre-seeded — account connections are now drawn explicitly
  // on the canvas by the user (article → ad account edges).
  const [launching, setLaunching] = useState(false);
  const [launchProgress, setLaunchProgress] = useState(0);
  const [allResults, setAllResults] = useState<SubmissionResults[]>([]);

  async function handleLaunch(items: CampaignBuildItem[], nameTemplate: string) {
    setLaunching(true);
    setLaunchProgress(0);
    setAllResults([]);

    const providers = loadFeedProviders();
    const articles = loadArticles();
    const presets = loadPresets();

    const collectedResults: SubmissionResults[] = [];

    try {
      for (let i = 0; i < items.length; i++) {
        setLaunchProgress(i);
        const item = items[i];

        const provider = providers.find((p) => p.id === item.feedProviderId);
        const article = articles.find((a) => a.id === item.articleId);
        const preset = presets.find((p) => p.id === item.presetId);
        const assets = item.creativeIds.map((id) => getAssetById(id)).filter(Boolean) as NonNullable<ReturnType<typeof getAssetById>>[];

        if (!provider || !article || !preset || assets.length === 0) {
          console.warn(`[wizard] skipping item ${i}: missing provider/article/preset/assets`);
          collectedResults.push({
            uploadMedia: [],
            campaigns: [{ clientId: item.creativeIds[0] ?? `item-${i}`, snapId: "", name: `item-${i + 1}`, error: "Missing data: provider/article/preset/assets not found" }],
            adSquads: [],
            creatives: [],
            ads: [],
          });
          continue;
        }

        const ctx = {
          presetName: preset.name,
          articleSlug: article.slug,
          creativeFilename: assets[0].originalFileName,
          presetTag: preset.tag,
          uniqueId4: generateUniqueId4(),
        };
        const campaignName = resolveCampaignName(nameTemplate, item, ctx, provider.snapConfig.campaignNamingTemplate);

        const synthesis = synthesizeCampaign(item, campaignName, provider, article, preset, assets);

        const itemAccountId = item.adAccountId;
        const stageCallback = (stage: string) =>
          console.log(`[wizard] item ${i + 1}/${items.length} stage: ${stage}`);

        const result = await runSubmission(
          itemAccountId,
          synthesis.campaigns,
          synthesis.adSquads,
          synthesis.creatives,
          stageCallback,
          provider
        );

        collectedResults.push(result);

        // Cache new Snapchat mediaIds into Silo assets
        result.uploadMedia.forEach((r) => {
          if (r.error || !r.snapId) return;
          const cr = synthesis.creatives.find((c) => c.id === r.clientId);
          if (!cr?.siloAssetId) return;
          const silo = getAssetById(cr.siloAssetId);
          if (!silo) return;
          const existing = silo.snapchatUploads.find((s) => s.adAccountId === itemAccountId);
          const updatedUploads = existing
            ? silo.snapchatUploads.map((s) =>
                s.adAccountId === itemAccountId
                  ? { ...s, stage: "ready" as const, snapMediaId: r.snapId, completedAt: new Date().toISOString() }
                  : s
              )
            : [
                ...silo.snapchatUploads,
                {
                  adAccountId: itemAccountId,
                  adAccountName: itemAccountId,
                  stage: "ready" as const,
                  snapMediaId: r.snapId,
                  completedAt: new Date().toISOString(),
                },
              ];
          upsertAsset({
            ...silo,
            snapchatUploads: updatedUploads,
            usageHistory: [
              ...silo.usageHistory,
              {
                adAccountId: itemAccountId,
                campaignName,
                creativeName: cr.name,
                usedAt: new Date().toISOString(),
              },
            ],
          });
        });
      }
      setLaunchProgress(items.length);
    } catch (err) {
      console.error("[wizard] handleLaunch threw:", err);
    } finally {
      setAllResults(collectedResults);
      setLaunching(false);
      setMode("done");
    }
  }

  const totalSucceeded =
    mode === "done"
      ? allResults.reduce((acc, r) => acc + (r.campaigns.filter((c) => c.snapId && !c.error).length), 0)
      : 0;
  const totalFailed =
    mode === "done"
      ? allResults.reduce((acc, r) => acc + (r.campaigns.filter((c) => !c.snapId || c.error).length), 0)
      : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Top nav */}
      <div className="shrink-0 flex items-center gap-3 px-6 py-3 border-b border-gray-100 bg-white">
        <span className="text-sm font-medium text-gray-700">Campaign Builder</span>
        <span className="text-gray-300 ml-2">·</span>
        <span
          className={`text-sm px-2 py-0.5 rounded-full font-medium ${
            mode === "canvas" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          Build
        </span>
        <span className="text-gray-300">→</span>
        <span
          className={`text-sm px-2 py-0.5 rounded-full font-medium ${
            mode === "review" ? "bg-blue-100 text-blue-700" : mode === "done" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
          }`}
        >
          Review & Launch
        </span>
        {mode === "done" && (
          <>
            <span className="text-gray-300">→</span>
            <span className="text-sm px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
              Done
            </span>
          </>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0">
        {mode === "done" ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="text-4xl">{totalFailed === 0 ? "🎉" : "⚠️"}</div>
            <h2 className="text-xl font-semibold text-gray-800">
              {totalSucceeded} campaign{totalSucceeded !== 1 ? "s" : ""} launched
              {totalFailed > 0 && `, ${totalFailed} failed`}
            </h2>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setMode("canvas"); canvasStore.reset(); setAllResults([]); }}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                New Build
              </button>
            </div>
          </div>
        ) : mode === "canvas" ? (
          <CampaignCanvas adAccountId={adAccountId} onReview={() => setMode("review")} />
        ) : (
          <ReviewAndPost
            onBack={() => setMode("canvas")}
            onLaunch={handleLaunch}
            launching={launching}
            launchProgress={launchProgress}
          />
        )}
      </div>
    </div>
  );
}
