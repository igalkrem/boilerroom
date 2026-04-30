"use client";

import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/hooks/useCanvasStore";

export function RouterNode({ data }: {
  data: { routerId: string; color: string; onDisconnectTarget: (nodeId: string) => void };
}) {
  const store = useCanvasStore();

  return (
    <div className="relative flex items-center justify-center" style={{ width: 36, height: 36 }}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-5 !h-5 !rounded-full !bg-gray-400 !border-2 !border-white cursor-pointer"
        onClick={() => data.onDisconnectTarget(data.routerId)}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-5 !h-5 !rounded-full !bg-gray-400 !border-2 !border-white"
      />

      {/* Sleek circle */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center select-none"
        style={{
          background: "white",
          border: `2.5px solid ${data.color}`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        }}
      >
        <span style={{ color: data.color, fontSize: 13, fontWeight: 700 }}>⑃</span>
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={() => store.removeRouter(data.routerId)}
        className="nodrag absolute -top-1.5 -right-1.5 w-4 h-4 bg-white border border-gray-200 rounded-full text-gray-300 hover:text-red-400 hover:border-red-200 text-[9px] flex items-center justify-center shadow-sm transition-colors"
      >
        ✕
      </button>
    </div>
  );
}
