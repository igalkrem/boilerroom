"use client";

import { PixelForm } from "@/components/pixels/PixelForm";

export default function NewPixelPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Add Pixel</h1>
        <p className="text-sm text-gray-500 mt-1">
          Register a Snap Pixel ID to attach to your ad sets.
        </p>
      </div>
      <PixelForm />
    </div>
  );
}
