"use client";

import Link from "next/link";
import { ArticleForm } from "@/components/articles/ArticleForm";

export default function NewArticlePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/articles"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Articles
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">New Article</h1>
      </div>
      <ArticleForm />
    </div>
  );
}
