"use client";

import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/hooks/useCanvasStore";
import type { CampaignPreset } from "@/types/preset";
import type { Article } from "@/types/article";

export function PresetNode({ data }: {
  data: {
    preset: CampaignPreset;
    color: string;
    articles: Article[];
    disabled: boolean;
    onDisconnectTarget: (nodeId: string) => void;
  };
}) {
  const store = useCanvasStore();
  const presetEdges = store.edges.articleToPreset.filter((e) => e.presetId === data.preset.id);
  const connected = presetEdges.length > 0;

  return (
    <div
      style={
        connected
          ? { borderColor: data.color, backgroundColor: `${data.color}12`, borderWidth: 2 }
          : undefined
      }
      className={`relative rounded-2xl border-2 p-3 w-60 shadow-sm select-none transition-all ${
        data.disabled
          ? "opacity-40 cursor-not-allowed"
          : "cursor-pointer hover:shadow-md"
      } ${connected ? "" : "border-gray-200 bg-white hover:border-gray-300"}`}
      onClick={() => {
        if (data.disabled) return;
        const activeArticleIds = new Set(store.edges.providerToArticle.map((e) => e.articleId));
        const matchingArticles = [...activeArticleIds].filter((aId) => {
          const article = data.articles.find((a) => a.id === aId);
          return article && (!data.preset.feedProviderId || article.feedProviderId === data.preset.feedProviderId);
        });
        matchingArticles.forEach((aId) => store.toggleArticleToPreset(aId, data.preset.id));
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-5 !h-5 !rounded-full !bg-gray-400 !border-2 !border-white cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          data.onDisconnectTarget(`preset-${data.preset.id}`);
        }}
      />

      <div className="flex items-start gap-2">
        {data.color !== "#94a3b8" && (
          <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: data.color }} />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{data.preset.name}</p>
          <p className="text-xs text-gray-400">
            {data.preset.adSquads[0]?.geoCountryCodes?.join(", ") ?? ""}
            {data.preset.adSquads[0]?.dailyBudgetUsd ? ` · $${data.preset.adSquads[0].dailyBudgetUsd}/day` : ""}
          </p>
        </div>
      </div>

      {connected && (
        <div className="nodrag mt-2 space-y-1" onClick={(e) => e.stopPropagation()}>
          {presetEdges.map((pe) => {
            const article = data.articles.find((a) => a.id === pe.articleId);
            return (
              <div key={pe.articleId} className="flex items-center gap-2 justify-between">
                <span className="text-xs text-gray-500 truncate">{article?.slug ?? pe.articleId}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => store.setDuplications(pe.articleId, data.preset.id, pe.duplications - 1)}
                    className="w-5 h-5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="text-xs font-medium text-gray-700 w-5 text-center">{pe.duplications}</span>
                  <button
                    type="button"
                    onClick={() => store.setDuplications(pe.articleId, data.preset.id, pe.duplications + 1)}
                    className="w-5 h-5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
