"use client";

import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/hooks/useCanvasStore";

export function ProviderNode({ data }: {
  data: {
    providerId: string;
    name: string;
    color: string;
    selectedTrafficSources: ("snap" | "meta")[];
    onDisconnectTarget: (nodeId: string) => void;
    onToggleTrafficSource: (providerId: string, ts: "snap" | "meta") => void;
  };
}) {
  const store = useCanvasStore();

  const connectedRows = store.edges.rowToProvider.filter(
    (e) => e.feedProviderId === data.providerId
  ).length;
  const connected = connectedRows > 0;

  const tsButton = (ts: "snap" | "meta", label: string) => {
    const active = data.selectedTrafficSources.includes(ts);
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); data.onToggleTrafficSource(data.providerId, ts); }}
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
    <div
      style={
        connected
          ? {
              background: `linear-gradient(135deg, ${data.color}22 0%, #111827 70%)`,
              boxShadow: `0 4px 24px ${data.color}20, inset 0 0 0 1px ${data.color}20`,
            }
          : undefined
      }
      className={`relative rounded-2xl border shadow-sm w-44 overflow-hidden ${
        connected ? "" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-[#111827]"
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
        {connected && (
          <div className="flex gap-1.5 mt-1.5 pl-4">
            {tsButton("snap", "Snap")}
            {tsButton("meta", "Meta")}
          </div>
        )}
      </div>
    </div>
  );
}
