"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { SiloUploader } from "@/components/silo/SiloUploader";
import { loadTags } from "@/lib/silo-tags";
import type { SiloAsset } from "@/types/silo";

export default function SiloUploadPage() {
  const router = useRouter();
  const tags = loadTags();
  const [selectedTagId, setSelectedTagId] = useState<string>(tags[0]?.id ?? "");
  const [uploaded, setUploaded] = useState<SiloAsset[]>([]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Upload Media</h1>
          <p className="text-sm text-gray-500 mt-1">Files are stored in your Silo library and can be reused across campaigns.</p>
        </div>
        <Button variant="ghost" onClick={() => router.push("/dashboard/silo")}>
          ← Back to Library
        </Button>
      </div>

      {/* Tag selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">Tag (optional)</label>
        <div className="flex gap-3 items-center flex-wrap">
          <select
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            value={selectedTagId}
            onChange={(e) => setSelectedTagId(e.target.value)}
          >
            <option value="">No tag — use filename</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>{t.name} (next: {t.prefix}_v_{String(t.nextIndex).padStart(3, "0")})</option>
            ))}
          </select>
          <Button variant="secondary" size="sm" onClick={() => router.push("/dashboard/silo/tags")}>
            Manage Tags
          </Button>
        </div>
        {selectedTagId && (
          <p className="text-xs text-gray-500 mt-2">
            Files will be automatically named using the tag prefix and auto-incremented index.
          </p>
        )}
      </div>

      {/* Uploader */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <SiloUploader
          tagId={selectedTagId || undefined}
          onComplete={(assets) => setUploaded((prev) => [...prev, ...assets])}
        />
      </div>

      {/* Post-upload actions */}
      {uploaded.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
          <p className="text-sm font-semibold text-green-800">
            ✅ {uploaded.length} file{uploaded.length !== 1 ? "s" : ""} uploaded successfully
          </p>
          <div className="flex gap-3">
            <Button onClick={() => router.push("/dashboard/silo")}>
              Go to Library
            </Button>
            <Button variant="secondary" onClick={() => setUploaded([])}>
              Upload More
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
