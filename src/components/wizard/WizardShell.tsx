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
import { appendSession } from "@/lib/build-log";
import type { BuildLogSquad } from "@/types/build-log";

type Mode = "canvas" | "review" | "done";

export function WizardShell({ adAccountId }: { adAccountId?: string }) {
  const canvasStore = useCanvasStore();
  const [mode, setMode] = useState<Mode>("canvas");

  // adAccountId is no longer pre-seeded — account connections are now drawn explicitly
  // on the canvas by the user (article → ad account edges).
  const [launching, setLaunching] = useState(false);
  const [launchProgress, setLaunchProgress] = useState(0);
  const [allResults, setAllResults] = useState<SubmissionResults[]>([]);
  const [launchError, setLaunchError] = useState<string | null>(null);

  async function handleLaunch(items: CampaignBuildItem[], nameTemplate: string) {
    setLaunching(true);
    setLaunchProgress(0);
    setAllResults([]);
    setLaunchError(null);

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

        // Catalogue (Collection Ads) still need a hero Silo asset, so the asset check applies to all.
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

        // Block submission for VIDEO assets uploaded before the H.264 transcoding pipeline —
        // they lack optimizedUrl and the raw original will be rejected by Snapchat (E2601).
        // Catalogue heroes are real Silo videos too, so this check applies to all builds.
        const legacyVideos = assets.filter((a) => a.mediaType === "VIDEO" && !a.optimizedUrl);
        if (legacyVideos.length > 0) {
          const names = legacyVideos.map((a) => a.originalFileName).join(", ");
          collectedResults.push({
            uploadMedia: [],
            campaigns: [{ clientId: item.creativeIds[0] ?? `item-${i}`, snapId: "", name: `item-${i + 1}`, error: `Video(s) need re-upload for Snap compatibility: ${names} — go to the Silo, delete and re-upload to get H.264 transcoding.` }],
            adSquads: [],
            creatives: [],
            ads: [],
          });
          continue;
        }

        const ctx = {
          presetName: preset.name,
          articleSlug: article.slug,
          creativeFilename: assets[0]?.originalFileName ?? preset.name,
          creativeVname: assets[0]?.vname,
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
      setLaunchError(err instanceof Error ? err.message : String(err));
    } finally {
      // Persist build log session
      try {
        const squads: BuildLogSquad[] = [];
        for (let i = 0; i < collectedResults.length; i++) {
          const result = collectedResults[i];
          const item = items[i];
          const campaign = result.campaigns[0];
          const squad = result.adSquads[0];
          if (campaign && squad) {
            squads.push({
              adAccountId: item.adAccountId,
              campaignSnapId: campaign.snapId ?? "",
              campaignName: campaign.name,
              adSquadSnapId: squad.snapId ?? "",
              adSquadName: squad.name,
              status: "ACTIVE",
              creativeCount: result.creatives.filter((c) => c.snapId && !c.error).length,
              adCount: result.ads.filter((a) => a.snapId && !a.error).length,
              error: squad.error ?? (campaign.error ? campaign.error : undefined),
              timestamp: new Date().toISOString(),
            });
          }
        }
        if (squads.length > 0) {
          appendSession({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), squads });
        }
      } catch (e) {
        console.warn("[wizard] failed to persist build log:", e);
      }
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

  // Collect sub-stage errors (adSquads/creatives/ads) that succeeded at campaign level but
  // failed downstream — these are hidden from totalFailed since the campaign was created.
  const subErrors: string[] =
    mode === "done"
      ? allResults.flatMap((r) => [
          ...r.adSquads.filter((s) => s.error).map((s) => `Ad set "${s.name}": ${s.error}`),
          ...r.creatives.filter((c) => c.error).map((c) => `Creative "${c.name}": ${c.error}`),
          ...r.ads.filter((a) => a.error).map((a) => `Ad "${a.name}": ${a.error}`),
        ])
      : [];

  return (
    <div className="flex flex-col h-full">
      {/* Top nav */}
      <div className="shrink-0 flex items-center gap-3 px-6 py-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Campaign Builder</span>
        <span className="text-gray-300 ml-2">·</span>
        <span
          className={`text-sm px-2 py-0.5 rounded-full font-medium ${
            mode === "canvas" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
          }`}
        >
          Build
        </span>
        <span className="text-gray-300">→</span>
        <span
          className={`text-sm px-2 py-0.5 rounded-full font-medium ${
            mode === "review" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : mode === "done" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-400"
          }`}
        >
          Review & Launch
        </span>
        {mode === "done" && (
          <>
            <span className="text-gray-300">→</span>
            <span className="text-sm px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Done
            </span>
          </>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0">
        {mode === "done" ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="text-4xl">{launchError || totalFailed > 0 || subErrors.length > 0 ? "⚠️" : "🎉"}</div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
              {totalSucceeded} campaign{totalSucceeded !== 1 ? "s" : ""} launched
              {totalFailed > 0 && `, ${totalFailed} failed`}
            </h2>
            {launchError && (
              <p className="text-sm text-red-500 dark:text-red-400 max-w-md text-center bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg">
                {launchError}
              </p>
            )}
            {subErrors.length > 0 && (
              <div className="max-w-lg w-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-3 space-y-1">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Partial failures — campaign created but some sub-stages failed:</p>
                {subErrors.map((e, i) => (
                  <p key={i} className="text-xs text-amber-800 dark:text-amber-300 font-mono break-all">{e}</p>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setMode("canvas"); canvasStore.reset(); setAllResults([]); setLaunchError(null); }}
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
