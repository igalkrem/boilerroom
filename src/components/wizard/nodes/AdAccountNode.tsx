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
    <span className={`inline-flex items-center justify-center rounded-md bg-yellow-400 ${className ?? "w-4 h-4"}`}>
      <svg viewBox="0.87 -0.8 20.14 21.67" className="w-[86%] h-[86%]" fill="#fff" stroke="#111827" strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
        <path d="M12.166.002c.83-.005 3.39.229 4.643 2.848.422.88.338 2.352.269 3.562l-.012.2c-.006.09.049.125.106.101.225-.093.456-.24.7-.397.328-.21.664-.426 1.021-.506a1.53 1.53 0 01.379-.024c.498.032.938.346 1.106.785.217.567-.045 1.128-.779 1.663-.118.086-.247.164-.375.241-.403.241-.732.437-.665.671.044.152.19.332.364.553.536.677 1.344 1.7 1.344 3.414 0 2.618-1.83 4.62-4.99 5.544-.193.056-.236.151-.267.27-.046.175-.085.325-.296.484-.271.2-.68.3-1.252.302-.494.002-1.102-.08-1.76-.167-.77-.102-1.566-.209-2.27-.153-.703.055-1.377.22-2.018.379-.548.138-1.072.27-1.572.27h-.049c-.545-.008-.938-.106-1.198-.3-.208-.158-.248-.307-.291-.48-.03-.117-.072-.212-.265-.268C3.83 18.625 2 16.623 2 14.005c0-1.715.808-2.737 1.344-3.414.174-.22.32-.401.364-.553.068-.233-.262-.43-.665-.671a5.39 5.39 0 01-.375-.241C1.934 8.59 1.672 8.03 1.89 7.46c.167-.439.608-.753 1.106-.785a1.51 1.51 0 01.379.024c.357.08.693.296 1.021.506.244.157.475.304.7.397.056.023.112-.011.106-.1l-.012-.201C5.12 6.09 5.037 4.617 5.46 3.736 6.574 1.388 8.91.807 10.316.36 10.83.193 11.444.006 12.166.002z" />
      </svg>
    </span>
  );
}
