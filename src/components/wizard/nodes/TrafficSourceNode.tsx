"use client";

import { Handle, Position } from "@xyflow/react";

export function TrafficSourceNode({ data }: {
  data: {
    feedProviderId: string;
    platform: "snap" | "meta";
    color: string;
    onAddArticle: (providerId: string, platform: "snap" | "meta") => void;
    onDisconnectTarget: (nodeId: string) => void;
  };
}) {
  return (
    <div className="relative rounded-2xl border border-gray-700 bg-[#111827] shadow-sm w-32 overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: data.color }} />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-7 !h-7 !rounded-full !bg-gray-400 !border-2 !border-white cursor-pointer"
        style={{ left: -10 }}
        onClick={() => data.onDisconnectTarget(`ts-${data.feedProviderId}-${data.platform}`)}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-7 !h-7 !rounded-full !bg-gray-400 !border-2 !border-white"
      />

      <div className="pl-4 pr-3 py-3">
        <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Traffic Source</p>
        <p className="text-sm font-medium text-gray-200 mb-1.5">{data.platform === "meta" ? "Meta" : "Snap"}</p>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); data.onAddArticle(data.feedProviderId, data.platform); }}
          className="nodrag text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
        >
          + Pick articles
        </button>
      </div>
    </div>
  );
}
