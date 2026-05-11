"use client";

import { BaseEdge, EdgeProps, getSmoothStepPath } from "@xyflow/react";

export function ProviderEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps & { data?: { color?: string } }) {
  const [edgePath] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 14,
  });
  const color = data?.color ?? "#94a3b8";

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: color,
        strokeWidth: selected ? 2.5 : 2,
        strokeDasharray: "6 3",
        opacity: selected ? 1 : 0.65,
      }}
    />
  );
}
