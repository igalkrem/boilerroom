"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPixelById } from "@/lib/pixels";
import { PixelForm } from "@/components/pixels/PixelForm";
import type { SavedPixel } from "@/types/pixel";

export default function EditPixelPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [pixel, setPixel] = useState<SavedPixel | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const found = getPixelById(params.id);
    if (!found) {
      setNotFound(true);
    } else {
      setPixel(found);
    }
  }, [params.id]);

  if (notFound) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-gray-500">Pixel not found.</p>
        <button
          onClick={() => router.push("/dashboard/pixels")}
          className="text-cyan-600 underline text-sm"
        >
          Back to Pixels
        </button>
      </div>
    );
  }

  if (!pixel) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Edit Pixel</h1>
        <p className="text-sm text-gray-500 mt-1">Update your pixel label or ID.</p>
      </div>
      <PixelForm pixel={pixel} />
    </div>
  );
}
