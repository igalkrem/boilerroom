"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { loadFeedProviders, deleteFeedProvider } from "@/lib/feed-providers";
import type { FeedProvider } from "@/types/article";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function FeedProvidersPage() {
  const router = useRouter();
  const [providers, setProviders] = useState<FeedProvider[]>([]);

  useEffect(() => {
    setProviders(loadFeedProviders());
  }, []);

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete feed provider "${name}"? Articles using this provider will lose their provider reference.`)) return;
    deleteFeedProvider(id);
    setProviders(loadFeedProviders());
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/articles"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Articles
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Feed Providers</h1>
            <p className="text-sm text-gray-500 mt-1">
              Define the base URL and URL parameter name for each feed.
            </p>
          </div>
        </div>
        <Button onClick={() => router.push("/dashboard/feed-providers/new")}>
          + Add Feed Provider
        </Button>
      </div>

      {providers.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center space-y-3">
          <p className="text-gray-500 text-sm">No feed providers saved yet.</p>
          <Button
            variant="secondary"
            onClick={() => router.push("/dashboard/feed-providers/new")}
          >
            Add your first feed provider
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((provider) => (
            <Card key={provider.id} className="flex flex-col gap-3">
              <div>
                <h2 className="font-semibold text-gray-900 text-base leading-snug">
                  {provider.name}
                </h2>
                <p className="text-xs text-gray-500 font-mono mt-1 break-all">
                  ?<span className="text-cyan-700">{provider.parameterName}</span>=slug
                </p>
                <p className="text-xs text-gray-400 mt-1 break-all">{provider.baseUrl}</p>
              </div>

              <p className="text-xs text-gray-500">Added: {formatDate(provider.createdAt)}</p>

              <div className="flex gap-2 mt-auto pt-2 border-t border-gray-100">
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={() =>
                    router.push(`/dashboard/feed-providers/${provider.id}/edit`)
                  }
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 text-red-600 hover:text-red-700"
                  onClick={() => handleDelete(provider.id, provider.name)}
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
