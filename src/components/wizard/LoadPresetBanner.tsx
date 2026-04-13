"use client";

import { useEffect, useState } from "react";
import { loadPresets } from "@/lib/presets";
import { useWizardStore } from "@/hooks/useWizardStore";
import { Button } from "@/components/ui";
import type { CampaignPreset } from "@/types/preset";

interface LoadPresetBannerProps {
  onLoad: (presetId: string) => void;
}

export function LoadPresetBanner({ onLoad }: LoadPresetBannerProps) {
  const [presets, setPresets] = useState<CampaignPreset[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const { loadPreset } = useWizardStore();

  useEffect(() => {
    const all = loadPresets();
    setPresets(all);
    if (all.length > 0) setSelectedId(all[0].id);
  }, []);

  if (dismissed || presets.length === 0) return null;

  function handleLoad() {
    const preset = presets.find((p) => p.id === selectedId);
    if (!preset) return;
    loadPreset(preset);
    onLoad(preset.id);
  }

  return (
    <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-cyan-900">Load from a saved preset</p>
        <p className="text-xs text-cyan-700 mt-0.5">
          Pre-fill this wizard with your saved campaign &amp; ad set settings.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="text-sm border border-cyan-300 rounded-md px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-cyan-500"
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" onClick={handleLoad}>
          Load
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-cyan-500 hover:text-cyan-700 text-xs underline whitespace-nowrap"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
