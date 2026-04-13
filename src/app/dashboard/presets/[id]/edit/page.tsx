"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPresetById } from "@/lib/presets";
import { PresetForm } from "@/components/presets/PresetForm";
import type { CampaignPreset } from "@/types/preset";

export default function EditPresetPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [preset, setPreset] = useState<CampaignPreset | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const found = getPresetById(params.id);
    if (!found) {
      setNotFound(true);
    } else {
      setPreset(found);
    }
  }, [params.id]);

  if (notFound) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-gray-500">Preset not found.</p>
        <button
          onClick={() => router.push("/dashboard/presets")}
          className="text-cyan-600 underline text-sm"
        >
          Back to Presets
        </button>
      </div>
    );
  }

  if (!preset) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Edit Preset</h1>
        <p className="text-sm text-gray-500 mt-1">Update your campaign template settings.</p>
      </div>
      <PresetForm preset={preset} />
    </div>
  );
}
