"use client";

import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/hooks/useCanvasStore";
import { SNAP_CTA_OPTIONS, META_CTA_GROUPS, SHARED_CTA_OPTIONS } from "@/lib/cta-options";
import type { Article } from "@/types/article";

export function ArticleNode({ id, data }: {
  id: string;
  data: {
    article: Article;
    color: string;
    platforms: ReadonlySet<"snap" | "meta">;
    onDisconnectTarget: (nodeId: string) => void;
  };
}) {
  const store = useCanvasStore();
  const expanded = useCanvasStore((s) => s.expandedArticleIds.has(id));

  const articleEdges = store.edges.providerToArticle.filter((e) => e.articleId === data.article.id);
  const connected = articleEdges.length > 0;
  const hasSnap = data.platforms.has("snap");
  const hasMeta = data.platforms.has("meta");

  const handleStyle = connected
    ? {
        border: `2px solid ${data.color}`,
        boxShadow: `inset 0 0 5px ${data.color}50, 0 0 8px ${data.color}45`,
      }
    : { border: "2px solid #374151" };

  return (
    <div
      style={
        connected
          ? {
              background: `linear-gradient(135deg, ${data.color}18 0%, #111827 65%)`,
              borderColor: data.color,
              borderWidth: 2,
              boxShadow: `0 4px 24px ${data.color}25`,
            }
          : undefined
      }
      className={`relative rounded-2xl border-2 p-3 w-60 shadow-sm ${connected ? "" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-[#111827]"}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3.5 !h-3.5 !rounded-full !bg-gray-900 cursor-pointer"
        style={handleStyle}
        onClick={() => data.onDisconnectTarget(`article-${data.article.id}`)}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-3.5 !h-3.5 !rounded-full !bg-gray-900 cursor-pointer"
        style={handleStyle}
      />

      <div className="flex items-start gap-2">
        <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: data.color }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 break-words">{data.article.slug}</p>
        </div>
        {connected && (
          <button
            type="button"
            onClick={() => useCanvasStore.getState().toggleArticleExpanded(id)}
            className="nodrag shrink-0 w-5 h-5 flex items-center justify-center rounded-md text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>

      {connected && expanded && articleEdges.map((ae) => (
        <div
          key={`${ae.feedProviderId}-${ae.articleId}`}
          className="nodrag mt-2 rounded-xl p-2.5 space-y-2 border"
          style={{ borderColor: `${data.color}30`, background: `${data.color}08` }}
        >
          <div>
            <label className="text-[10px] font-semibold text-gray-500 block mb-1 uppercase tracking-wider">Headline</label>
            {data.article.allowedHeadlines.length > 0 ? (
              <select
                value={ae.headline}
                onChange={(e) => {
                  const val = e.target.value;
                  const rac = data.article.allowedHeadlines.find((h) => h.text === val)?.rac ?? "";
                  store.setArticleContent(ae.feedProviderId, data.article.id, val, ae.callToAction, rac);
                }}
                className="w-full text-xs rounded-lg px-2 py-1 focus:outline-none bg-white/5 border border-white/10 text-gray-300"
              >
                <option value="">— Select headline —</option>
                {data.article.allowedHeadlines.map((h) => (
                  <option key={h.text} value={h.text}>{h.text}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                maxLength={34}
                value={ae.headline}
                placeholder="Headline (max 34 chars)"
                onChange={(e) =>
                  store.setArticleContent(ae.feedProviderId, data.article.id, e.target.value, ae.callToAction, "")
                }
                className="w-full text-xs rounded-lg px-2 py-1 focus:outline-none bg-white/5 border border-white/10 text-gray-300 placeholder-gray-600"
              />
            )}
          </div>
          <div>
            <label className="text-[10px] font-semibold text-gray-500 block mb-1 uppercase tracking-wider">Call to Action</label>
            <select
              value={ae.callToAction}
              onChange={(e) =>
                store.setArticleContent(ae.feedProviderId, data.article.id, ae.headline, e.target.value, ae.headlineRac)
              }
              className="w-full text-xs rounded-lg px-2 py-1 focus:outline-none bg-white/5 border border-white/10 text-gray-300"
            >
              {hasMeta && !hasSnap ? (
                <>
                  <option value="">— None —</option>
                  {META_CTA_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </>
              ) : hasMeta && hasSnap ? (
                SHARED_CTA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))
              ) : (
                SNAP_CTA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))
              )}
            </select>
            {hasMeta && hasSnap && (
              <p className="text-[9px] text-gray-500 mt-0.5">
                Only CTAs valid on both Snapchat &amp; Meta shown — this article is connected to both.
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
