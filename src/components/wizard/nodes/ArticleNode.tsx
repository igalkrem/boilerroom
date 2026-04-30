"use client";

import { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/hooks/useCanvasStore";
import type { Article } from "@/types/article";

const CTA_OPTIONS = ["MORE","SHOP_NOW","SIGN_UP","DOWNLOAD","WATCH","GET_NOW","ORDER_NOW","BOOK_NOW","APPLY_NOW","BUY_NOW"];

export function ArticleNode({ data }: {
  data: { article: Article; color: string };
}) {
  const store = useCanvasStore();
  const [expanded, setExpanded] = useState(false);

  const articleEdges = store.edges.providerToArticle.filter((e) => e.articleId === data.article.id);
  const connected = articleEdges.length > 0;

  return (
    <div
      style={connected ? { borderColor: data.color, backgroundColor: `${data.color}18`, borderWidth: 2 } : undefined}
      className={`relative rounded-xl border-2 p-3 w-60 shadow-sm ${connected ? "" : "border-gray-200 bg-white"}`}
    >
      <Handle type="target" position={Position.Left} id="in" className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white" />
      <Handle type="source" position={Position.Right} id="out" className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white" />

      <div className="flex items-start gap-2">
        <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: data.color }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{data.article.slug}</p>
          {data.article.query && (
            <p className="text-xs text-gray-400 truncate">{data.article.query}</p>
          )}
        </div>
        {connected && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="nodrag text-xs text-gray-400 hover:text-gray-600 shrink-0"
          >
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>

      {connected && expanded && articleEdges.map((ae) => (
        <div
          key={`${ae.feedProviderId}-${ae.articleId}`}
          className="nodrag mt-2 border border-blue-200 rounded-lg p-2 space-y-2 bg-blue-50/40"
        >
          <div>
            <label className="text-xs text-gray-500 block mb-0.5">Headline</label>
            {data.article.allowedHeadlines.length > 0 ? (
              <select
                value={ae.headline}
                onChange={(e) => {
                  const val = e.target.value;
                  const rac = data.article.allowedHeadlines.find((h) => h.text === val)?.rac ?? "";
                  store.setArticleContent(ae.feedProviderId, data.article.id, val, ae.callToAction, rac);
                }}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
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
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
              />
            )}
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-0.5">Call to Action</label>
            <select
              value={ae.callToAction}
              onChange={(e) =>
                store.setArticleContent(ae.feedProviderId, data.article.id, ae.headline, e.target.value, ae.headlineRac)
              }
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
            >
              <option value="">— None —</option>
              {CTA_OPTIONS.map((c) => (
                <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}
