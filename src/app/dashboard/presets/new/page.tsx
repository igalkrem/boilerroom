"use client";

import { PresetForm } from "@/components/presets/PresetForm";

export default function NewPresetPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Preset</h1>
        <p className="text-sm text-gray-500 mt-1">
          Define campaign and ad set defaults to reuse when creating campaigns.
        </p>
      </div>
      <PresetForm />
    </div>
  );
}
