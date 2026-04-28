"use client";

import Link from "next/link";
import { FeedProviderForm } from "@/components/articles/FeedProviderForm";

export default function NewFeedProviderPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/articles/feed-providers"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Feed Providers
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">New Feed Provider</h1>
      </div>
      <FeedProviderForm />
    </div>
  );
}
