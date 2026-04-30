"use client";

import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/hooks/useCanvasStore";

export function AdAccountNode({ data }: {
  data: { accountId: string; name: string; color: string; onDisconnectTarget: (nodeId: string) => void };
}) {
  const store = useCanvasStore();
  const connected = store.edges.articleToAdAccount.some((e) => e.adAccountId === data.accountId);

  // 2-letter initials from account name
  const initials = data.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      style={connected ? { borderColor: data.color, backgroundColor: `${data.color}12`, borderWidth: 2 } : undefined}
      className={`relative rounded-2xl border-2 p-3 w-44 shadow-sm transition-all select-none ${
        connected ? "" : "border-gray-200 bg-white"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-5 !h-5 !rounded-full !bg-gray-400 !border-2 !border-white cursor-pointer"
        onClick={() => data.onDisconnectTarget(`account-${data.accountId}`)}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-5 !h-5 !rounded-full !bg-gray-400 !border-2 !border-white"
      />

      <div className="flex items-center gap-2">
        {/* Avatar circle with initials */}
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-semibold"
          style={{ background: connected ? data.color : "#d1d5db" }}
        >
          {initials || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{data.name}</p>
          {connected && (
            <p className="text-xs text-gray-400 truncate">{data.accountId.slice(0, 8)}…</p>
          )}
        </div>
      </div>
    </div>
  );
}
