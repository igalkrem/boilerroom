"use client";

import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/hooks/useCanvasStore";

export function AdAccountNode({ data }: {
  data: { accountId: string; name: string; platform: "snap" | "meta"; color: string; onDisconnectTarget: (nodeId: string) => void };
}) {
  const store = useCanvasStore();
  const connected = store.edges.articleToAdAccount.some((e) => e.adAccountId === data.accountId);

  // 2-letter initials from account name
  const initials = data.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const handleStyle = connected
    ? {
        border: `2px solid ${data.color}`,
        boxShadow: `inset 0 0 5px ${data.color}50, 0 0 8px ${data.color}45`,
      }
    : { border: "2px solid #374151" };

  return (
    <div
      style={
        connected
          ? {
              background: `linear-gradient(135deg, ${data.color}18 0%, #111827 65%)`,
              borderColor: data.color,
              borderWidth: 2,
              boxShadow: `0 4px 24px ${data.color}25`,
            }
          : undefined
      }
      className={`relative rounded-2xl border-2 p-3 w-44 shadow-sm transition-all select-none ${
        connected ? "" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-[#111827]"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3.5 !h-3.5 !rounded-full !bg-gray-900 cursor-pointer"
        style={handleStyle}
        onClick={() => data.onDisconnectTarget(`account-${data.accountId}`)}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-3.5 !h-3.5 !rounded-full !bg-gray-900 cursor-pointer"
        style={handleStyle}
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
          <div className="flex items-center gap-1">
            {data.platform === "meta" ? (
              <span className="shrink-0 w-4 h-4 rounded bg-blue-600 flex items-center justify-center text-[9px] font-bold text-white leading-none">f</span>
            ) : (
              <SnapGhost className="shrink-0 w-4 h-4 text-yellow-400" />
            )}
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{data.name}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SnapGhost({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 1.74.56 3.35 1.5 4.67-.12.56-.72 1.04-1.38 1.2-.24.06-.12.18.12.18.6 0 1.08-.18 1.5-.42-.06.3-.06.6 0 .9-.66.36-1.38.54-2.16.54-.18 0-.12.18.06.24.96.3 1.86.42 2.64.3C8.4 18.06 10.08 19 12 19s3.6-.94 4.72-2.39c.78.12 1.68 0 2.64-.3.18-.06.24-.24.06-.24-.78 0-1.5-.18-2.16-.54.06-.3.06-.6 0-.9.42.24.9.42 1.5.42.24 0 .36-.12.12-.18-.66-.16-1.26-.64-1.38-1.2A7.96 7.96 0 0 0 19 9c0-3.87-3.13-7-7-7z" />
    </svg>
  );
}
