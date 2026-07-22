"use client";

import { EdgeProps } from "@xyflow/react";

// Single cubic bezier per edge — both control points sit at the horizontal midpoint
// between source and target, producing a clean S-curve with no self-overlap
// (replaces the old right-angle smooth-step routing).
function getMidpointBezierPath(sourceX: number, sourceY: number, targetX: number, targetY: number): string {
  const midX = (sourceX + targetX) / 2;
  return `M${sourceX},${sourceY} C${midX},${sourceY} ${midX},${targetY} ${targetX},${targetY}`;
}

export function ProviderEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps & { data?: { color?: string } }) {
  const edgePath = getMidpointBezierPath(sourceX, sourceY, targetX, targetY);
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
