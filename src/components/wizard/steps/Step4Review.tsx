"use client";

import { useState } from "react";
import { useWizardStore } from "@/hooks/useWizardStore";
import { Button } from "@/components/ui";
import { runSubmission } from "@/lib/submission-orchestrator";

export function Step4Review() {
  const [isLaunching, setIsLaunching] = useState(false);
  const {
    adAccountId,
    campaigns,
    adSquads,
    creatives,
    setStep,
    setSubmissionStatus,
    setSubmissionStage,
    setSubmissionResults,
    submissionStatus,
  } = useWizardStore();

  const adSquadMap = Object.fromEntries(adSquads.map((s) => [s.id, s.name]));
  const campaignMap = Object.fromEntries(campaigns.map((c) => [c.id, c.name]));

  const handleLaunch = async () => {
    setIsLaunching(true);
    setSubmissionStatus("running");

    try {
      const results = await runSubmission(
        adAccountId,
        campaigns,
        adSquads,
        creatives,
        (stage) => setSubmissionStage(stage)
      );
      setSubmissionResults(results);
      setSubmissionStatus("done");
    } catch (err) {
      console.error("Submission error:", err);
      setSubmissionStatus("error");
    } finally {
      setIsLaunching(false);
    }
  };

  if (submissionStatus === "running" || submissionStatus === "done") {
    return null; // WizardShell renders SubmissionProgress instead
  }

  return (
    <div className="space-y-6">
      {/* Campaigns */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="font-semibold text-gray-800">Campaigns ({campaigns.length})</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {campaigns.map((c, i) => (
            <div key={c.id} className="px-5 py-3">
              <p className="font-medium text-gray-900 text-sm">{c.name || `Campaign #${i + 1}`}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {c.objective} ·{" "}
                {c.spendCapType === "DAILY_BUDGET"
                  ? `$${c.dailyBudgetUsd}/day`
                  : `$${c.lifetimeBudgetUsd} lifetime`}{" "}
                · {c.status} · {c.startDate}
                {c.endDate ? ` – ${c.endDate}` : ""}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Ad Sets */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="font-semibold text-gray-800">Ad Sets ({adSquads.length})</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {adSquads.map((s, i) => {
            const targetingParts: string[] = [];
            if (s.targetingAgeMin || s.targetingAgeMax) {
              targetingParts.push(`Ages ${s.targetingAgeMin ?? 13}–${s.targetingAgeMax ?? "50+"}`);
            }
            if (s.targetingGender && s.targetingGender !== "ALL") targetingParts.push(s.targetingGender);
            if (s.targetingDeviceType && s.targetingDeviceType !== "ALL") targetingParts.push(s.targetingDeviceType);
            return (
              <div key={s.id} className="px-5 py-3">
                <p className="font-medium text-gray-900 text-sm">{s.name || `Ad Set #${i + 1}`}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {s.bidStrategy} ·{" "}
                  {s.spendCapType === "DAILY_BUDGET"
                    ? `$${s.dailyBudgetUsd}/day`
                    : `$${s.lifetimeBudgetUsd} lifetime`}{" "}
                  · {s.geoCountryCode} · {s.pacingType} · {s.placementConfig}
                  {targetingParts.length > 0 ? ` · ${targetingParts.join(", ")}` : ""}
                  {s.frequencyCapMaxImpressions ? ` · Cap: ${s.frequencyCapMaxImpressions}/${s.frequencyCapTimePeriod}` : ""}
                  {" · →"} {campaignMap[s.campaignId] ?? "—"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Creatives */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="font-semibold text-gray-800">Creatives & Ads ({creatives.length})</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {creatives.map((cr, i) => (
            <div key={cr.id} className="px-5 py-3">
              <p className="font-medium text-gray-900 text-sm">
                {cr.mediaFileName ? `🎬 ${cr.mediaFileName}` : `Creative #${i + 1}`}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                &quot;{cr.headline}&quot; · {cr.interactionType} · {cr.adStatus}
                {cr.shareable ? " · Shareable" : ""}
                {" · →"} {adSquadMap[cr.adSquadId] ?? "—"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="secondary" onClick={() => setStep(3)}>
          ← Back
        </Button>
        <Button size="lg" onClick={handleLaunch} loading={isLaunching}>
          🚀 Launch Campaign
        </Button>
      </div>
    </div>
  );
}
