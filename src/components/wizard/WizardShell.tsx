"use client";

import { useEffect, useState } from "react";
import { useWizardStore } from "@/hooks/useWizardStore";
import { StepIndicator } from "./StepIndicator";
import { Step1Campaigns } from "./steps/Step1Campaigns";
import { Step2AdSets } from "./steps/Step2AdSets";
import { Step3Creatives } from "./steps/Step3Creatives";
import { Step4Review } from "./steps/Step4Review";
import { SubmissionProgress } from "./SubmissionProgress";
import { LoadPresetBanner } from "./LoadPresetBanner";
import Link from "next/link";
import { getAssetById, upsertAsset } from "@/lib/silo";

const STEP_TITLES = [
  "Define Campaigns",
  "Define Ad Sets",
  "Upload Creatives",
  "Review & Launch",
];

export function WizardShell({ adAccountId }: { adAccountId: string }) {
  const { currentStep, campaigns, creatives, setAdAccountId, submissionStatus, submissionResults } = useWizardStore();
  // presetKey forces a remount of step components after a preset is loaded,
  // so react-hook-form re-reads defaultValues from the freshly-populated store.
  const [presetKey, setPresetKey] = useState("fresh");

  useEffect(() => {
    setAdAccountId(adAccountId);
  }, [adAccountId, setAdAccountId]);

  // After successful submission, cache Snapchat mediaIds and record usage in Silo assets.
  useEffect(() => {
    if (submissionStatus !== "done" || !submissionResults) return;
    submissionResults.uploadMedia.forEach((result) => {
      if (result.error || !result.snapId) return;
      const creative = creatives.find((c) => c.id === result.clientId);
      if (!creative?.siloAssetId) return;
      const asset = getAssetById(creative.siloAssetId);
      if (!asset) return;
      const existing = asset.snapchatUploads.find((s) => s.adAccountId === adAccountId);
      const updatedUploads = existing
        ? asset.snapchatUploads.map((s) =>
            s.adAccountId === adAccountId
              ? { ...s, stage: "ready" as const, snapMediaId: result.snapId, completedAt: new Date().toISOString() }
              : s
          )
        : [...asset.snapchatUploads, {
            adAccountId,
            adAccountName: adAccountId,
            stage: "ready" as const,
            snapMediaId: result.snapId,
            completedAt: new Date().toISOString(),
          }];
      upsertAsset({
        ...asset,
        snapchatUploads: updatedUploads,
        usageHistory: [...asset.usageHistory, {
          adAccountId,
          campaignName: campaigns[0]?.name ?? "Unknown",
          creativeName: creative.name,
          usedAt: new Date().toISOString(),
        }],
      });
    });
  }, [submissionStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSubmitting = submissionStatus === "running" || submissionStatus === "done";

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-gray-900 transition-colors">
          ← Back to Accounts
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">Bulk Campaign</span>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Create Bulk Campaign</h1>
        <StepIndicator currentStep={currentStep} />
      </div>

      {!isSubmitting && (
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-800">
            Step {currentStep}: {STEP_TITLES[currentStep - 1]}
          </h2>
        </div>
      )}

      {/* Show preset banner on Step 1 when wizard is fresh (no campaigns yet) */}
      {!isSubmitting && currentStep === 1 && campaigns.length === 0 && (
        <LoadPresetBanner onLoad={(id) => setPresetKey(id)} />
      )}

      {isSubmitting ? (
        <SubmissionProgress />
      ) : currentStep === 1 ? (
        <Step1Campaigns key={presetKey} />
      ) : currentStep === 2 ? (
        <Step2AdSets key={presetKey} />
      ) : currentStep === 3 ? (
        <Step3Creatives />
      ) : (
        <Step4Review />
      )}
    </div>
  );
}
