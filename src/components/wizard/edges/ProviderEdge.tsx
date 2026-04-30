"use client";

import { BaseEdge, EdgeProps, getBezierPath } from "@xyflow/react";

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
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const color = data?.color ?? "#94a3b8";

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: color,
        strokeWidth: selected ? 2.5 : 2,
        strokeDasharray: "6 3",
        opacity: selected ? 1 : 0.7,
      }}
    />
  );
}
