"use client";

import { useWizardStore } from "@/hooks/useWizardStore";
import { Button } from "@/components/ui";
import { clsx } from "clsx";
import type { SubmissionStage, SubmissionResults } from "@/types/wizard";

const STAGES: Array<{ key: SubmissionStage; label: string }> = [
  { key: "uploadMedia", label: "Uploading Media" },
  { key: "campaigns", label: "Creating Campaigns" },
  { key: "adSquads", label: "Creating Ad Sets" },
  { key: "creatives", label: "Creating Creatives" },
  { key: "ads", label: "Creating Ads" },
];

type ResultItem = { clientId: string; snapId: string; name: string; error?: string };

function StageRow({ stage, currentStage, results }: {
  stage: typeof STAGES[0];
  currentStage: SubmissionStage | null;
  results: SubmissionResults | null;
}) {
  const stageOrder = ["uploadMedia", "campaigns", "adSquads", "creatives", "ads", "done"];
  const currentIdx = stageOrder.indexOf(currentStage ?? "");
  const stageIdx = stageOrder.indexOf(stage.key);
  const isPast = currentIdx > stageIdx;
  const isActive = currentStage === stage.key;
  const isPending = currentIdx < stageIdx;

  const resultItems: ResultItem[] = results
    ? stage.key === "uploadMedia"
      ? results.uploadMedia
      : stage.key === "campaigns"
      ? results.campaigns
      : stage.key === "adSquads"
      ? results.adSquads
      : stage.key === "creatives"
      ? results.creatives
      : results.ads
    : [];

  const successCount = resultItems.filter((r: ResultItem) => !r.error).length;
  const errorCount = resultItems.filter((r: ResultItem) => r.error).length;

  return (
    <div className="flex items-start gap-3">
      <div className={clsx(
        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 flex-shrink-0",
        isPast && errorCount === 0 ? "bg-green-100 text-green-700" :
        isPast && errorCount > 0 ? "bg-yellow-100 text-yellow-700" :
        isActive ? "bg-yellow-400 text-gray-900 animate-pulse" :
        "bg-gray-100 text-gray-400"
      )}>
        {isPast && errorCount === 0 ? "✓" : isPast && errorCount > 0 ? "!" : isActive ? "…" : "○"}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={clsx("text-sm font-medium", isPending ? "text-gray-400" : "text-gray-800")}>
            {stage.label}
          </span>
          {isPast && (
            <span className="text-xs text-gray-500">
              {successCount}/{resultItems.length} {stage.key === "uploadMedia" ? "uploaded" : "created"}
              {errorCount > 0 && <span className="text-red-600 ml-1">({errorCount} failed)</span>}
            </span>
          )}
          {isActive && (
            <span className="text-xs text-yellow-600">In progress...</span>
          )}
        </div>
        {isPast && errorCount > 0 && (
          <ul className="mt-1 space-y-0.5">
            {resultItems.filter((r: ResultItem) => r.error).map((r: ResultItem) => (
              <li key={r.clientId} className="text-xs text-red-600">
                {r.name}: {r.error}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SubmissionProgress() {
  const {
    submissionStatus,
    submissionStage,
    submissionResults,
    reset,
  } = useWizardStore();

  const isDone = submissionStage === "done" || submissionStatus === "done";

  if (isDone && submissionResults) {
    const hasErrors = [
      ...submissionResults.uploadMedia,
      ...submissionResults.campaigns,
      ...submissionResults.adSquads,
      ...submissionResults.creatives,
      ...submissionResults.ads,
    ].some((r) => r.error);

    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center space-y-4">
        <div className="text-5xl">{hasErrors ? "⚠️" : "🎉"}</div>
        <h2 className="text-xl font-bold text-gray-900">
          {hasErrors ? "Campaign Created with Some Errors" : "Campaign Launched Successfully!"}
        </h2>
        <div className="flex items-center justify-center gap-6 text-sm text-gray-600">
          <span>✅ {submissionResults.campaigns.filter((r) => !r.error).length} Campaign(s)</span>
          <span>✅ {submissionResults.adSquads.filter((r) => !r.error).length} Ad Set(s)</span>
          <span>✅ {submissionResults.ads.filter((r) => !r.error).length} Ad(s)</span>
        </div>
        {hasErrors && (
          <div className="text-left space-y-1 max-w-sm mx-auto">
            {(() => {
              // uploadMedia errors take precedence — deduplicate by clientId so downstream
              // "Media upload failed" entries don't shadow the real upload error.
              const seen = new Set<string>();
              return [
                ...submissionResults.uploadMedia,
                ...submissionResults.campaigns,
                ...submissionResults.adSquads,
                ...submissionResults.creatives,
                ...submissionResults.ads,
              ]
                .filter((r) => r.error)
                .filter((r) => {
                  if (seen.has(r.clientId)) return false;
                  seen.add(r.clientId);
                  return true;
                })
                .map((r) => (
                  <p key={r.clientId} className="text-xs text-red-600">{r.name}: {r.error}</p>
                ));
            })()}
          </div>
        )}
        <Button onClick={reset} variant="secondary">
          Create Another Campaign
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <h2 className="font-semibold text-gray-900">Launching your campaign...</h2>
      <div className="space-y-3">
        {STAGES.map((s) => (
          <StageRow
            key={s.key}
            stage={s}
            currentStage={submissionStage}
            results={submissionResults}
          />
        ))}
      </div>
    </div>
  );
}
