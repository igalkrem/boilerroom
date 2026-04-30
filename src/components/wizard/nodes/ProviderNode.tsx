"use client";

import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/hooks/useCanvasStore";

export function ProviderNode({ data }: {
  data: {
    providerId: string;
    name: string;
    color: string;
    onDisconnectTarget: (nodeId: string) => void;
  };
}) {
  const store = useCanvasStore();

  const connectedGroups = store.edges.groupToProvider.filter(
    (e) => e.feedProviderId === data.providerId
  ).length;
  const connected = connectedGroups > 0;

  return (
    <div
      style={connected ? { backgroundColor: `${data.color}12` } : undefined}
      className={`relative rounded-2xl border shadow-sm w-44 overflow-hidden ${
        connected ? "border-gray-100" : "border-gray-200 bg-white"
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
        className="!w-5 !h-5 !rounded-full !bg-gray-400 !border-2 !border-white cursor-pointer"
        style={{ left: -10 }}
        onClick={() => data.onDisconnectTarget(`provider-${data.providerId}`)}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-5 !h-5 !rounded-full !bg-gray-400 !border-2 !border-white"
      />

      <div className="pl-4 pr-3 py-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: data.color }} />
          <span className="text-sm font-medium text-gray-800 truncate flex-1">{data.name}</span>
        </div>
        {connected && (
          <p className="text-xs text-gray-400 mt-0.5 pl-4">
            {connectedGroups} group{connectedGroups !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
