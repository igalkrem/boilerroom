"use client";

import { EdgeProps, getSmoothStepPath } from "@xyflow/react";

export function ProviderEdge({
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
    borderRadius: 16,
  });
  const color = data?.color ?? "#94a3b8";

  return (
    <>
      {/* Glow halo — wide blurred stroke behind the crisp line */}
      <path
        d={edgePath}
        stroke={color}
        strokeWidth={selected ? 12 : 8}
        fill="none"
        opacity={0.18}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Main crisp stroke */}
      <path
        d={edgePath}
        stroke={color}
        strokeWidth={selected ? 3 : 2.5}
        fill="none"
        opacity={selected ? 1 : 0.85}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}
