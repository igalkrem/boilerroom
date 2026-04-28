"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getArticleById } from "@/lib/articles";
import { ArticleForm } from "@/components/articles/ArticleForm";
import type { Article } from "@/types/article";

export default function EditArticlePage() {
  const params = useParams<{ id: string }>();
  const [article, setArticle] = useState<Article | null | undefined>(undefined);

  useEffect(() => {
    setArticle(getArticleById(params.id) ?? null);
  }, [params.id]);

  if (article === undefined) return null;

  if (article === null) {
    return (
      <div className="space-y-4">
        <p className="text-gray-500">Article not found.</p>
        <Link href="/dashboard/articles" className="text-sm text-cyan-600 hover:underline">
          ← Back to Articles
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/articles"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Articles
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Article</h1>
      </div>
      <ArticleForm article={article} />
    </div>
  );
}
