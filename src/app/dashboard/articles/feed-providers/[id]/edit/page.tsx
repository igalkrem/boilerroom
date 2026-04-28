"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getFeedProviderById } from "@/lib/feed-providers";
import { FeedProviderForm } from "@/components/articles/FeedProviderForm";
import type { FeedProvider } from "@/types/article";

export default function EditFeedProviderPage() {
  const params = useParams<{ id: string }>();
  const [provider, setProvider] = useState<FeedProvider | null | undefined>(undefined);

  useEffect(() => {
    setProvider(getFeedProviderById(params.id) ?? null);
  }, [params.id]);

  if (provider === undefined) return null;

  if (provider === null) {
    return (
      <div className="space-y-4">
        <p className="text-gray-500">Feed provider not found.</p>
        <Link href="/dashboard/articles/feed-providers" className="text-sm text-cyan-600 hover:underline">
          ← Back to Feed Providers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/articles/feed-providers"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Feed Providers
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Feed Provider</h1>
      </div>
      <FeedProviderForm provider={provider} />
    </div>
  );
}
