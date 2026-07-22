"use client";

import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 90;
const GROUP_CARD_W = 340; // approx two-card row estimate for dagre
const GROUP_CARD_H = 285;
export const ARTICLE_EXPANDED_H = 230;
export { NODE_WIDTH, NODE_HEIGHT, GROUP_CARD_W, GROUP_CARD_H };

export function computeAutoLayout(nodes: Node[], edges: Edge[], nodePriority?: Record<string, number>, expandedArticleIds?: Set<string>): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 200, nodesep: 60, marginx: 60, marginy: 60 });

  nodes.forEach((n) => {
    const isRouter = n.type === "router";
    const isGroup = n.type === "group";
    const isExpandedArticle = n.type === "article" && expandedArticleIds?.has(n.id);
    const w = isRouter ? 36 : isGroup ? GROUP_CARD_W : NODE_WIDTH;
    const h = isRouter ? 36 : isGroup ? GROUP_CARD_H : isExpandedArticle ? ARTICLE_EXPANDED_H : NODE_HEIGHT;
    g.setNode(n.id, { width: w, height: h });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  const nodeType: Record<string, string | undefined> = {};
  nodes.forEach((n) => { nodeType[n.id] = n.type; });

  const topLeft = (id: string, cx: number, cy: number) => {
    const isRouter = nodeType[id] === "router";
    const isGroup = nodeType[id] === "group";
    const isExpandedArticle = nodeType[id] === "article" && expandedArticleIds?.has(id);
    const w = isRouter ? 36 : isGroup ? GROUP_CARD_W : NODE_WIDTH;
    const h = isRouter ? 36 : isGroup ? GROUP_CARD_H : isExpandedArticle ? ARTICLE_EXPANDED_H : NODE_HEIGHT;
    return { x: cx - w / 2, y: cy - h / 2 };
  };

  // Collect mutable center positions from dagre
  const center: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n) => {
    const pos = g.node(n.id);
    if (pos) center[n.id] = { x: pos.x, y: pos.y };
  });

  const positions: Record<string, { x: number; y: number }> = {};
  for (const id of Object.keys(center)) {
    positions[id] = topLeft(id, center[id].x, center[id].y);
  }

  // Post-process: within each x-rank, re-sort nodes so their vertical order
  // matches the vertical order of their upstream (source) nodes.
  // Iterates left-to-right and propagates updated y-values so the fix cascades
  // through providers → routers → articles → accounts → presets.
  const byX = new Map<number, string[]>();
  for (const [id, c] of Object.entries(center)) {
    if (!byX.has(c.x)) byX.set(c.x, []);
    byX.get(c.x)!.push(id);
  }

  for (const xc of [...byX.keys()].sort((a, b) => a - b).slice(1)) {
    const rankNodes = byX.get(xc)!;
    if (rankNodes.length <= 1) continue;

    const avgUpstreamY = (nodeId: string): number => {
      const srcs = edges.filter((e) => e.target === nodeId).map((e) => center[e.source]?.y ?? 0);
      return srcs.length ? srcs.reduce((a, b) => a + b, 0) / srcs.length : center[nodeId].y;
    };

    const sorted = [...rankNodes].sort((a, b) => {
      const dy = avgUpstreamY(a) - avgUpstreamY(b);
      if (dy !== 0) return dy;
      return (nodePriority?.[a] ?? 999) - (nodePriority?.[b] ?? 999);
    });
    const yCenters = [...rankNodes].map((id) => center[id].y).sort((a, b) => a - b);

    sorted.forEach((nodeId, i) => {
      center[nodeId] = { ...center[nodeId], y: yCenters[i] };
      positions[nodeId] = topLeft(nodeId, center[nodeId].x, yCenters[i]);
    });
  }

  return positions;
}

interface CanvasControlsProps {
  onAutoLayout: () => void;
  campaignCount: number;
  onReview: () => void;
  isValid: boolean;
}

export function CanvasControls({ onAutoLayout, campaignCount, onReview, isValid }: CanvasControlsProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Campaign Builder</span>
        {campaignCount > 0 && (
          <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
            {campaignCount} campaign{campaignCount !== 1 ? "s" : ""} ready
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAutoLayout}
          title="Auto-align nodes"
          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600 rounded-lg font-medium transition-colors"
        >
          ⊞ Auto-align
        </button>
        <button
          type="button"
          disabled={!isValid}
          onClick={onReview}
          className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Review →
        </button>
      </div>
    </div>
  );
}
