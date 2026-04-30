"use client";

import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 90;

export function computeAutoLayout(nodes: Node[], edges: Edge[]): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 120, nodesep: 40, marginx: 40, marginy: 40 });

  nodes.forEach((n) => {
    const h = n.type === "router" ? 48 : NODE_HEIGHT;
    const w = n.type === "router" ? 48 : NODE_WIDTH;
    g.setNode(n.id, { width: w, height: h });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n) => {
    const pos = g.node(n.id);
    if (pos) {
      const w = n.type === "router" ? 48 : NODE_WIDTH;
      const h = n.type === "router" ? 48 : NODE_HEIGHT;
      positions[n.id] = { x: pos.x - w / 2, y: pos.y - h / 2 };
    }
  });
  return positions;
}

interface CanvasControlsProps {
  onAutoLayout: () => void;
  onAddCreative: () => void;
  campaignCount: number;
  onReview: () => void;
  isValid: boolean;
}

export function CanvasControls({ onAutoLayout, onAddCreative, campaignCount, onReview, isValid }: CanvasControlsProps) {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-700">Campaign Builder</span>
        {campaignCount > 0 && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
            {campaignCount} campaign{campaignCount !== 1 ? "s" : ""} ready
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAddCreative}
          className="px-3 py-1.5 text-xs text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-400 rounded-lg font-medium transition-colors"
        >
          + Add Creative
        </button>
        <button
          type="button"
          onClick={onAutoLayout}
          title="Auto-align nodes"
          className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 border border-gray-200 hover:border-gray-400 rounded-lg font-medium transition-colors"
        >
          ⊞ Auto-align
        </button>
        <button
          type="button"
          disabled={!isValid}
          onClick={onReview}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Review →
        </button>
      </div>
    </div>
  );
}
