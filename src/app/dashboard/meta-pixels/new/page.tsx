"use client";

import { MetaPixelForm } from "@/components/pixels/MetaPixelForm";

export default function NewMetaPixelPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Add Meta Pixel</h1>
        <p className="text-sm text-gray-500 mt-1">
          Register a Meta Pixel ID to attach to your ad sets.
        </p>
      </div>
      <MetaPixelForm />
    </div>
  );
}
