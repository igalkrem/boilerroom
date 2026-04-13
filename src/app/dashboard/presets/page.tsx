"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Badge, Card } from "@/components/ui";
import { loadPresets, deletePreset } from "@/lib/presets";
import type { CampaignPreset } from "@/types/preset";

function objectiveLabel(objective: string) {
  const map: Record<string, string> = {
    AWARENESS_AND_ENGAGEMENT: "Awareness & Engagement",
    SALES: "Sales",
    TRAFFIC: "Traffic",
    APP_PROMOTION: "App Promotion",
    LEADS: "Leads",
  };
  return map[objective] ?? objective;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PresetsPage() {
  const router = useRouter();
  const [presets, setPresets] = useState<CampaignPreset[]>([]);

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete preset "${name}"? This cannot be undone.`)) return;
    deletePreset(id);
    setPresets(loadPresets());
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaign Presets</h1>
          <p className="text-sm text-gray-500 mt-1">
            Save campaign &amp; ad set configurations to reuse across multiple campaigns.
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard/presets/new")}>
          + New Preset
        </Button>
      </div>

      {presets.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center space-y-3">
          <p className="text-gray-500 text-sm">No presets saved yet.</p>
          <Button
            variant="secondary"
            onClick={() => router.push("/dashboard/presets/new")}
          >
            Create your first preset
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {presets.map((preset) => (
            <Card key={preset.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-gray-900 text-base leading-snug">
                  {preset.name}
                </h2>
                <Badge variant="gray">
                  {preset.adSquads.length} ad set{preset.adSquads.length !== 1 ? "s" : ""}
                </Badge>
              </div>

              <div className="text-xs text-gray-500 space-y-0.5">
                <p>Objective: {objectiveLabel(preset.campaign.objective)}</p>
                <p>
                  Budget:{" "}
                  {preset.campaign.spendCapType === "DAILY_BUDGET"
                    ? `$${preset.campaign.dailyBudgetUsd}/day`
                    : `$${preset.campaign.lifetimeBudgetUsd} lifetime`}
                </p>
                <p>Created: {formatDate(preset.createdAt)}</p>
              </div>

              <div className="flex flex-col gap-2 mt-auto pt-2 border-t border-gray-100">
                <Link href={`/dashboard/presets/${preset.id}/use`} className="w-full">
                  <Button size="sm" className="w-full">
                    Load in Wizard
                  </Button>
                </Link>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => router.push(`/dashboard/presets/${preset.id}/edit`)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 text-red-600 hover:text-red-700"
                    onClick={() => handleDelete(preset.id, preset.name)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
