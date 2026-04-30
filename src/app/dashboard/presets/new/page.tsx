"use client";

import Link from "next/link";
import { PresetForm } from "@/components/presets/PresetForm";

export default function NewPresetPage() {
  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <Link
          href="/dashboard/presets"
          className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-3"
        >
          ← Presets
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">New Preset</h1>
      </div>
      <PresetForm />
    </div>
  );
}
