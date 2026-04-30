"use client";

import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/hooks/useCanvasStore";

export function ProviderNode({ data }: {
  data: {
    providerId: string;
    name: string;
    color: string;
    onAddRouter: (providerId: string) => void;
  };
}) {
  const store = useCanvasStore();

  const connectedCreatives = store.edges.creativeToProvider.filter(
    (e) => e.feedProviderId === data.providerId
  ).length;
  const connected = connectedCreatives > 0;

  const hasRouter = store.routerNodes.some((r) => r.feedProviderId === data.providerId);

  return (
    <div
      style={connected ? { borderColor: data.color, backgroundColor: `${data.color}18`, borderWidth: 2 } : undefined}
      className={`relative rounded-xl border-2 p-3 w-48 shadow-sm ${connected ? "" : "border-gray-200 bg-white"}`}
    >
      <Handle type="target" position={Position.Left} id="in" className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white" />
      <Handle type="source" position={Position.Right} id="out" className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white" />

      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: data.color }} />
        <span className="text-sm font-medium text-gray-800 truncate flex-1">{data.name}</span>
      </div>

      {connected && (
        <p className="text-xs text-gray-400 mt-1 pl-4">
          {connectedCreatives} creative{connectedCreatives !== 1 ? "s" : ""}
        </p>
      )}

      {connected && !hasRouter && (
        <button
          type="button"
          onClick={() => data.onAddRouter(data.providerId)}
          className="nodrag mt-2 text-xs text-gray-400 hover:text-blue-500 border border-dashed border-gray-200 hover:border-blue-300 rounded px-1.5 py-0.5 w-full text-center transition-colors"
        >
          + Router
        </button>
      )}
    </div>
  );
}
