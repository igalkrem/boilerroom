"use client";

import { EdgeProps } from "@xyflow/react";

// Orthogonal (90°-turn) routing: a short horizontal run out of the source, a single
// rounded corner-pair down/up to the target's row, then a horizontal run into the
// target. Edges in this canvas always flow left-to-right column-wise, so targetX is
// always >= sourceX — the trunk never needs to move backward on x. Matches the
// approved mockup's right-angle routing (replaces the earlier cubic-bezier S-curve).
function getOrthogonalPath(sourceX: number, sourceY: number, targetX: number, targetY: number): string {
  if (Math.abs(sourceY - targetY) < 1.5) return `M${sourceX},${sourceY} L${targetX},${targetY}`;
  const r = 10;
  const trunk = sourceX + Math.min(26, (targetX - sourceX) * 0.42);
  const dir = targetY > sourceY ? 1 : -1;
  const rr = Math.min(r, Math.abs(targetY - sourceY) / 2, targetX - trunk);
  return (
    `M${sourceX},${sourceY} H${trunk - rr} Q${trunk},${sourceY} ${trunk},${sourceY + dir * rr} ` +
    `V${targetY - dir * rr} Q${trunk},${targetY} ${trunk + rr},${targetY} H${targetX}`
  );
}

export function ProviderEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps & { data?: { color?: string } }) {
  const edgePath = getOrthogonalPath(sourceX, sourceY, targetX, targetY);
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
