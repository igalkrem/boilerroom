"use client";

import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/hooks/useCanvasStore";

export function RouterNode({ data }: {
  data: { routerId: string; color: string };
}) {
  const store = useCanvasStore();

  return (
    <div className="relative flex items-center justify-center" style={{ width: 48, height: 48 }}>
      <Handle type="target" position={Position.Left} id="in" className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white" />
      <Handle type="source" position={Position.Right} id="out" className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white" />

      {/* Diamond shape */}
      <div
        className="w-9 h-9 rotate-45 border-2 bg-white shadow-sm flex items-center justify-center"
        style={{ borderColor: data.color }}
      />
      {/* Icon inside diamond */}
      <span className="absolute text-xs font-bold" style={{ color: data.color }}>⇀</span>

      {/* Remove button */}
      <button
        type="button"
        onClick={() => store.removeRouter(data.routerId)}
        className="nodrag absolute -top-2 -right-2 w-4 h-4 bg-gray-100 hover:bg-red-100 rounded-full text-gray-400 hover:text-red-500 text-xs flex items-center justify-center border border-gray-200"
        title="Remove router"
      >
        ×
      </button>
    </div>
  );
}
