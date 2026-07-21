"use client";

import { Handle, Position } from "@xyflow/react";

export function TrafficSourceNode({ data }: {
  data: {
    feedProviderId: string;
    color: string;
    selected: string[]; // "snap" | "meta"
    onToggle: (feedProviderId: string, ts: "snap" | "meta") => void;
    onAddArticle: (providerId: string) => void;
  };
}) {
  const chip = (ts: "snap" | "meta", label: string) => {
    const active = data.selected.includes(ts);
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); data.onToggle(data.feedProviderId, ts); }}
        className={`nodrag px-2 py-1 rounded-md text-xs font-medium border transition-colors ${
          active
            ? "bg-blue-600/20 border-blue-500/40 text-blue-300"
            : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="relative rounded-2xl border border-gray-700 bg-[#111827] shadow-sm w-36 overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: data.color }} />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-7 !h-7 !rounded-full !bg-gray-400 !border-2 !border-white"
        style={{ left: -10 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-7 !h-7 !rounded-full !bg-gray-400 !border-2 !border-white"
      />

      <div className="pl-4 pr-3 py-3">
        <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">Traffic Source</p>
        <div className="flex gap-1.5">
          {chip("snap", "Snap")}
          {chip("meta", "Meta")}
        </div>
        {data.selected.length > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); data.onAddArticle(data.feedProviderId); }}
            className="nodrag mt-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            + Pick articles
          </button>
        )}
      </div>
    </div>
  );
}
