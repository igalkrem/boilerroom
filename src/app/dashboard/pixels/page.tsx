"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { loadPixels, deletePixel } from "@/lib/pixels";
import type { SavedPixel } from "@/types/pixel";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PixelsPage() {
  const router = useRouter();
  const [pixels, setPixels] = useState<SavedPixel[]>([]);

  useEffect(() => {
    setPixels(loadPixels());
  }, []);

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete pixel "${name}"? This cannot be undone.`)) return;
    deletePixel(id);
    setPixels(loadPixels());
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Snap Pixels</h1>
          <p className="text-sm text-gray-500 mt-1">
            Save your Snap Pixel IDs here to quickly attach them to ad sets.
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard/pixels/new")}>
          + Add Pixel
        </Button>
      </div>

      {pixels.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center space-y-3">
          <p className="text-gray-500 text-sm">No pixels saved yet.</p>
          <Button
            variant="secondary"
            onClick={() => router.push("/dashboard/pixels/new")}
          >
            Add your first pixel
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pixels.map((pixel) => (
            <Card key={pixel.id} className="flex flex-col gap-3">
              <div>
                <h2 className="font-semibold text-gray-900 text-base leading-snug">
                  {pixel.name}
                </h2>
                <p className="text-xs text-gray-400 font-mono mt-1 break-all">
                  {pixel.pixelId}
                </p>
              </div>

              <p className="text-xs text-gray-500">Added: {formatDate(pixel.createdAt)}</p>

              <div className="flex gap-2 mt-auto pt-2 border-t border-gray-100">
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => router.push(`/dashboard/pixels/${pixel.id}/edit`)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 text-red-600 hover:text-red-700"
                  onClick={() => handleDelete(pixel.id, pixel.name)}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
