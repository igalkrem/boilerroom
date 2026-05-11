"use client";

import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/hooks/useCanvasStore";

export function ProviderNode({ data }: {
  data: {
    providerId: string;
    name: string;
    color: string;
    onDisconnectTarget: (nodeId: string) => void;
    onAddArticle?: (providerId: string) => void;
  };
}) {
  const store = useCanvasStore();

  const connectedRows = store.edges.rowToProvider.filter(
    (e) => e.feedProviderId === data.providerId
  ).length;
  const connected = connectedRows > 0;

  return (
    <div
      style={connected ? { backgroundColor: `${data.color}12` } : undefined}
      className={`relative rounded-2xl border shadow-sm w-44 overflow-hidden ${
        connected ? "border-gray-100 dark:border-gray-800" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
      }`}
    >
      {/* Left color accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
        style={{ background: data.color }}
      />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-7 !h-7 !rounded-full !bg-gray-400 !border-2 !border-white cursor-pointer"
        style={{ left: -10 }}
        onClick={() => data.onDisconnectTarget(`provider-${data.providerId}`)}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-7 !h-7 !rounded-full !bg-gray-400 !border-2 !border-white"
      />

      <div className="pl-4 pr-3 py-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: data.color }} />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate flex-1">{data.name}</span>
        </div>
        {connected && (
          <p className="text-xs text-gray-400 mt-0.5 pl-4">
            {connectedRows} row{connectedRows !== 1 ? "s" : ""}
          </p>
        )}
        {connected && data.onAddArticle && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); data.onAddArticle!(data.providerId); }}
            className="nodrag mt-1 pl-4 pb-0.5 text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            + Pick articles
          </button>
        )}
      </div>
    </div>
  );
}
