"use client";

import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/hooks/useCanvasStore";
import { getAssetById } from "@/lib/silo";

export function CreativeNode({ data }: { data: { assetId: string; providerColorMap: Record<string, string> } }) {
  const store = useCanvasStore();
  const asset = getAssetById(data.assetId);

  const connectedColors = store.edges.creativeToProvider
    .filter((e) => e.creativeId === data.assetId)
    .map((e) => data.providerColorMap[e.feedProviderId] ?? "#94a3b8");

  const connected = connectedColors.length > 0;
  const invalid = !connected;

  let borderStyle: React.CSSProperties = {};
  let bgClass = "bg-white";

  if (connected && connectedColors.length > 1) {
    borderStyle = {
      border: "2px solid transparent",
      backgroundImage: `linear-gradient(white, white), linear-gradient(to right, ${connectedColors.join(", ")})`,
      backgroundClip: "padding-box, border-box",
      backgroundOrigin: "border-box",
    };
  } else if (connected && connectedColors.length === 1) {
    borderStyle = { borderColor: connectedColors[0], borderWidth: 2, backgroundColor: `${connectedColors[0]}18` };
    bgClass = "";
  }

  return (
    <div
      style={borderStyle}
      className={`relative rounded-xl border-2 p-3 shadow-sm w-52 ${bgClass} ${
        invalid ? "border-red-300 bg-red-50/30" : connected ? "" : "border-gray-200"
      }`}
    >
      <Handle type="source" position={Position.Right} id="out" className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white" />

      <div className="flex items-start gap-2">
        {asset?.thumbnailUrl ? (
          <img src={asset.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-gray-400 text-xs">
            {asset?.mediaType === "VIDEO" ? "▶" : "🖼"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-700 truncate">{asset?.originalFileName ?? data.assetId}</p>
          <p className="text-xs text-gray-400">{asset?.mediaType ?? "—"}</p>
        </div>
        <button
          type="button"
          onClick={() => store.removeCreative(data.assetId)}
          className="text-gray-300 hover:text-red-500 shrink-0 text-xs nodrag"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
