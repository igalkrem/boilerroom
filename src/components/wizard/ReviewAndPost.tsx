"use client";

import { useState } from "react";
import { useCanvasStore } from "@/hooks/useCanvasStore";
import { loadFeedProviders } from "@/lib/feed-providers";
import { loadArticles } from "@/lib/articles";
import { loadPresets } from "@/lib/presets";
import { getAssetById } from "@/lib/silo";
import { resolveCampaignName } from "@/lib/resolve-campaign-name";
import type { CampaignBuildItem } from "@/types/wizard";

const NAME_MACROS = [
  { label: "{{preset.name}}", title: "Preset name" },
  { label: "{{article.name}}", title: "Article name" },
  { label: "{{creative.filename}}", title: "Creative filename" },
  { label: "{{date}}", title: "Today YYYY-MM-DD" },
  { label: "{{index}}", title: "1-based duplication index" },
];

interface ReviewAndPostProps {
  onBack: () => void;
  onLaunch: (items: CampaignBuildItem[], nameTemplate: string) => void;
  launching: boolean;
  launchProgress: number; // 0-based index of item currently being processed
}

export function ReviewAndPost({ onBack, onLaunch, launching, launchProgress }: ReviewAndPostProps) {
  const store = useCanvasStore();
  const [nameTemplate, setNameTemplate] = useState("{{preset.name}} {{article.name}} {{date}}");

  const matrix = store.buildCampaignMatrix();

  const providers = loadFeedProviders();
  const articles = loadArticles();
  const presets = loadPresets();

  function getContext(item: CampaignBuildItem) {
    const preset = presets.find((p) => p.id === item.presetId);
    const article = articles.find((a) => a.id === item.articleId);
    const firstAsset = getAssetById(item.creativeIds[0]);
    const extraCount = item.creativeIds.length - 1;
    const creativeFilename = firstAsset
      ? extraCount > 0
        ? `${firstAsset.originalFileName} +${extraCount}`
        : firstAsset.originalFileName
      : item.creativeIds[0] ?? "—";
    return {
      presetName: preset?.name ?? item.presetId,
      articleSlug: article?.slug ?? item.articleId,
      creativeFilename,
    };
  }

  function insertMacro(macro: string) {
    setNameTemplate((t) => t + macro);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white shrink-0">
        <button
          type="button"
          onClick={onBack}
          disabled={launching}
          className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40"
        >
          ← Back to canvas
        </button>
        <button
          type="button"
          disabled={launching || matrix.length === 0}
          onClick={() => onLaunch(matrix, nameTemplate)}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {launching ? `Launching… (${Math.min(launchProgress + 1, matrix.length)}/${matrix.length})` : `Launch ${matrix.length} Campaign${matrix.length !== 1 ? "s" : ""}`}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Name template */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-gray-800 text-sm">Campaign Name Template</h3>
          <p className="text-xs text-gray-500">
            This template is used for the campaign, ad set, and ad name. Macros are resolved per row.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={nameTemplate}
              onChange={(e) => setNameTemplate(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {NAME_MACROS.map((m) => (
              <button
                key={m.label}
                type="button"
                title={m.title}
                onClick={() => insertMacro(m.label)}
                className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-md hover:bg-blue-100 font-mono"
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Campaign matrix table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 text-sm">{matrix.length} Campaign{matrix.length !== 1 ? "s" : ""} to Create</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left">
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Creative</th>
                  <th className="px-4 py-2 font-medium">Provider</th>
                  <th className="px-4 py-2 font-medium">Article</th>
                  <th className="px-4 py-2 font-medium">Preset</th>
                  <th className="px-4 py-2 font-medium">Campaign Name</th>
                  {launching && <th className="px-4 py-2 font-medium">Status</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {matrix.map((item, idx) => {
                  const ctx = getContext(item);
                  const resolvedName = resolveCampaignName(nameTemplate, item, ctx);
                  const provider = providers.find((p) => p.id === item.feedProviderId);
                  const isDone = launching && idx < launchProgress;
                  const isActive = launching && idx === launchProgress;
                  return (
                    <tr key={idx} className={isActive ? "bg-blue-50" : isDone ? "bg-green-50/40" : ""}>
                      <td className="px-4 py-2 text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-2 text-gray-600 truncate max-w-[100px]">{ctx.creativeFilename}</td>
                      <td className="px-4 py-2 text-gray-600">{provider?.name ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-600 font-mono">{ctx.articleSlug}</td>
                      <td className="px-4 py-2 text-gray-600">{ctx.presetName}</td>
                      <td className="px-4 py-2 font-mono text-gray-800">{resolvedName}</td>
                      {launching && (
                        <td className="px-4 py-2">
                          {isDone ? <span className="text-green-600 font-medium">✓</span> : isActive ? <span className="text-blue-600">…</span> : <span className="text-gray-300">–</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
