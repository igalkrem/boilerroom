"use client";

import { useEffect, useRef, useState } from "react";

export interface EdgeDef {
  id: string;
  fromNodeId: string; // data-node-id on the source card
  toNodeId: string;   // data-node-id on the target card
  color: string;
}

interface CanvasEdgesProps {
  edges: EdgeDef[];
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface Segment {
  id: string;
  d: string;
  color: string;
}

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const cx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
}

export function CanvasEdges({ edges, containerRef }: CanvasEdgesProps) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const frameRef = useRef<number | null>(null);

  function recalculate() {
    const container = containerRef.current;
    if (!container) return;
    const cr = container.getBoundingClientRect();
    const next: Segment[] = [];
    for (const edge of edges) {
      const fromEl = container.querySelector<HTMLElement>(`[data-node-id="${edge.fromNodeId}"]`);
      const toEl = container.querySelector<HTMLElement>(`[data-node-id="${edge.toNodeId}"]`);
      if (!fromEl || !toEl) continue;
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      const x1 = fr.right - cr.left;
      const y1 = fr.top - cr.top + fr.height / 2;
      const x2 = tr.left - cr.left;
      const y2 = tr.top - cr.top + tr.height / 2;
      next.push({ id: edge.id, d: bezierPath(x1, y1, x2, y2), color: edge.color });
    }
    setSegments(next);
  }

  useEffect(() => {
    function schedule() {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(recalculate);
    }
    schedule();
    const ro = new ResizeObserver(schedule);
    const container = containerRef.current;
    if (container) ro.observe(container);
    window.addEventListener("scroll", schedule, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", schedule, true);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges]);

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: "100%", height: "100%", overflow: "visible" }}
    >
      {segments.map((seg) => (
        <path
          key={seg.id}
          d={seg.d}
          stroke={seg.color}
          strokeWidth={2}
          fill="none"
          opacity={0.65}
        />
      ))}
    </svg>
  );
}
