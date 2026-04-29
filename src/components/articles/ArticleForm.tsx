"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import { Input, Select, Button } from "@/components/ui";
import { upsertArticle } from "@/lib/articles";
import { loadFeedProviders } from "@/lib/feed-providers";
import type { Article } from "@/types/article";
import type { FeedProvider } from "@/types/feed-provider";

const articleFormSchema = z.object({
  feedProviderId: z.string().min(1, "Feed provider is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(200)
    .regex(/^[a-zA-Z0-9_-]+$/, "Only letters, numbers, hyphens, and underscores"),
  query: z.string().max(500),
  allowedHeadlines: z.array(
    z.object({
      value: z.string().max(34, "Max 34 characters"),
    })
  ),
});

type ArticleFormValues = z.infer<typeof articleFormSchema>;

interface ArticleFormProps {
  article?: Article;
}

export function ArticleForm({ article }: ArticleFormProps) {
  const router = useRouter();
  const [providers, setProviders] = useState<FeedProvider[]>([]);

  useEffect(() => {
    setProviders(loadFeedProviders());
  }, []);

  const providerOptions = [
    { value: "", label: "Select feed provider" },
    ...providers.map((p) => ({ value: p.id, label: p.name })),
  ];

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ArticleFormValues>({
    resolver: zodResolver(articleFormSchema),
    defaultValues: article
      ? {
          feedProviderId: article.feedProviderId,
          slug: article.slug,
          query: article.query ?? "",
          allowedHeadlines: article.allowedHeadlines.map((h) => ({ value: h })),
        }
      : { feedProviderId: "", slug: "", query: "", allowedHeadlines: [] },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "allowedHeadlines",
  });

  const onSubmit = (data: ArticleFormValues) => {
    const saved: Article = {
      id: article?.id ?? uuid(),
      feedProviderId: data.feedProviderId,
      slug: data.slug,
      query: data.query.trim(),
      allowedHeadlines: data.allowedHeadlines
        .map((h) => h.value.trim())
        .filter((h) => h.length > 0),
      createdAt: article?.createdAt ?? new Date().toISOString(),
    };
    upsertArticle(saved);
    router.push("/dashboard/articles");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="space-y-4 max-w-md">
          {providers.length === 0 ? (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              No feed providers yet.{" "}
              <a
                href="/dashboard/feed-providers/new"
                className="underline font-medium"
              >
                Create one first
              </a>
              .
            </div>
          ) : (
            <Select
              label="Feed Provider"
              options={providerOptions}
              {...register("feedProviderId")}
              error={errors.feedProviderId?.message}
            />
          )}

          <Input
            label="Article Slug"
            placeholder="e.g. best-cars-2026"
            {...register("slug")}
            error={errors.slug?.message}
          />
          <p className="text-xs text-gray-500">
            Used as the URL parameter value (letters, numbers, hyphens, underscores only).
          </p>
          <Input
            label="Search Query"
            placeholder="e.g. best cars 2026"
            {...register("query")}
            error={errors.query?.message}
          />
          <p className="text-xs text-gray-500">
            Keyword passed as the search= / q= parameter in the URL. Resolves{" "}
            <code className="font-mono bg-gray-100 px-1 rounded">{"{{article.query}}"}</code>.
          </p>
        </div>
      </div>

      {/* Allowed Headlines */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Allowed Headlines</h2>
            <p className="text-xs text-gray-500 mt-0.5">Max 34 characters each (Snapchat limit).</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => append({ value: "" })}
          >
            + Add Headline
          </Button>
        </div>

        {fields.length === 0 ? (
          <p className="text-sm text-gray-400 italic">
            No headlines added — the headline field in the wizard will accept any text.
          </p>
        ) : (
          <div className="space-y-2">
            {fields.map((field, i) => (
              <div key={field.id} className="flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Enter headline (max 34 chars)"
                    maxLength={34}
                    {...register(`allowedHeadlines.${i}.value`)}
                    error={errors.allowedHeadlines?.[i]?.value?.message}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 text-red-500 hover:text-red-700 shrink-0"
                  onClick={() => remove(i)}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/dashboard/articles")}
        >
          Cancel
        </Button>
        <Button type="submit" size="lg">
          {article ? "Update Article" : "Save Article"}
        </Button>
      </div>
    </form>
  );
}
