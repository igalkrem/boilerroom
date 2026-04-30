"use client";

import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/hooks/useCanvasStore";

export function AdAccountNode({ data }: {
  data: { accountId: string; name: string; color: string };
}) {
  const store = useCanvasStore();
  const selected = store.selectedAdAccountIds.includes(data.accountId);

  return (
    <div
      style={selected ? { borderColor: data.color, backgroundColor: `${data.color}18`, borderWidth: 2 } : undefined}
      className={`relative rounded-xl border-2 p-3 w-48 shadow-sm cursor-pointer hover:shadow-md transition-all select-none ${
        selected ? "" : "border-gray-200 bg-white hover:border-gray-300"
      }`}
      onClick={() => store.toggleAdAccount(data.accountId)}
    >
      <Handle type="target" position={Position.Left} id="in" className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white" />
      <Handle type="source" position={Position.Right} id="out" className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white" />

      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: selected ? data.color : "#d1d5db" }}
        />
        <span className="text-sm font-medium text-gray-800 truncate">{data.name}</span>
      </div>
      {selected && (
        <p className="text-xs text-gray-400 mt-1 pl-4 truncate">{data.accountId.slice(0, 8)}…</p>
      )}
    </div>
  );
}
