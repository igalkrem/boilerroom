"use client";

import { useEffect, useState } from "react";
import { CampaignCanvas } from "./CampaignCanvas";
import { ReviewAndPost } from "./ReviewAndPost";
import { useCanvasStore } from "@/hooks/useCanvasStore";
import { loadFeedProviders } from "@/lib/feed-providers";
import { loadArticles } from "@/lib/articles";
import { loadPresets } from "@/lib/presets";
import { getAssetById, upsertAsset } from "@/lib/silo";
import { synthesizeCampaign } from "@/lib/synthesize-campaign";
import { runSubmission } from "@/lib/submission-orchestrator";
import type { CampaignBuildItem, SubmissionResults } from "@/types/wizard";
import Link from "next/link";

type Mode = "canvas" | "review" | "done";

export function WizardShell({ adAccountId }: { adAccountId?: string }) {
  const canvasStore = useCanvasStore();
  const [mode, setMode] = useState<Mode>("canvas");

  // When entering via a pre-selected ad account (e.g. from preset use page), seed the store.
  useEffect(() => {
    if (adAccountId && canvasStore.selectedAdAccountIds.length === 0) {
      canvasStore.setSelectedAdAccountIds([adAccountId]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adAccountId]);
  const [launching, setLaunching] = useState(false);
  const [launchProgress, setLaunchProgress] = useState(0);
  const [allResults, setAllResults] = useState<SubmissionResults[]>([]);

  function resolveName(
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

  async function handleLaunch(items: CampaignBuildItem[], nameTemplate: string) {
    setLaunching(true);
    setLaunchProgress(0);
    setAllResults([]);

    const providers = loadFeedProviders();
    const articles = loadArticles();
    const presets = loadPresets();

    const collectedResults: SubmissionResults[] = [];

    for (let i = 0; i < items.length; i++) {
      setLaunchProgress(i);
      const item = items[i];

      const provider = providers.find((p) => p.id === item.feedProviderId);
      const article = articles.find((a) => a.id === item.articleId);
      const preset = presets.find((p) => p.id === item.presetId);
      const asset = getAssetById(item.creativeId);

      if (!provider || !article || !preset || !asset) {
        console.warn(`[wizard] skipping item ${i}: missing provider/article/preset/asset`);
        continue;
      }

      const ctx = {
        presetName: preset.name,
        articleSlug: article.slug,
        creativeFilename: asset.originalFileName,
      };
      const campaignName = resolveName(nameTemplate, item, ctx);

      const synthesis = synthesizeCampaign(item, campaignName, provider, article, preset, asset);

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

    setAllResults(collectedResults);
    setLaunchProgress(items.length);
    setLaunching(false);
    setMode("done");
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
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          ← Accounts
        </Link>
        <span className="text-gray-300">/</span>
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
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                New Build
              </button>
              <Link
                href="/dashboard"
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Back to Accounts
              </Link>
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
