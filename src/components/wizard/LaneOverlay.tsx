"use client";

import { useViewport } from "@xyflow/react";

export interface LaneBound {
  providerId: string;
  name: string;
  color: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  providerRightX?: number;
  tsCenters?: { x: number; y: number }[];
  orphanDividers?: { col: "adaccount" | "preset"; y: number; xLeft: number; xRight: number }[];
}

const LANE_PAD_Y = 40;
const LANE_PAD_X = 60;

// Decorative-only overlay: reads the live pan/zoom transform and draws provider
// swim-lane bands + dividers directly in screen space. Rendered as a child of
// <ReactFlow>, never as a node — keeping it out of the nodes array means it can
// never affect fitView's bounding-box calculation.
export function LaneOverlay({ lanes }: { lanes: LaneBound[] }) {
  const { x: vx, y: vy, zoom } = useViewport();
  if (lanes.length === 0) return null;

  const toScreen = (fx: number, fy: number) => ({ x: fx * zoom + vx, y: fy * zoom + vy });

  const sorted = [...lanes].sort((a, b) => a.minY - b.minY);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {sorted.map((lane) => {
        const tl = toScreen(lane.minX - LANE_PAD_X, lane.minY - LANE_PAD_Y);
        const br = toScreen(lane.maxX + LANE_PAD_X, lane.maxY + LANE_PAD_Y);
        return (
          <div
            key={lane.providerId}
            style={{
              position: "absolute",
              left: tl.x,
              top: tl.y,
              width: Math.max(0, br.x - tl.x),
              height: Math.max(0, br.y - tl.y),
              background: `linear-gradient(180deg, ${lane.color}14 0%, transparent 45%)`,
              borderRadius: 16 * zoom,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 14 * zoom,
                top: 10 * zoom,
                fontSize: Math.max(9, 11 * zoom),
                fontWeight: 650,
                letterSpacing: "0.01em",
                color: lane.color,
                whiteSpace: "nowrap",
              }}
            >
              {lane.name}
            </div>
          </div>
        );
      })}

      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <defs>
          {sorted.slice(1).map((lane, i) => {
            const prev = sorted[i];
            return (
              <linearGradient key={`h-${lane.providerId}`} id={`laneDividerFade-${lane.providerId}`} gradientUnits="userSpaceOnUse"
                x1={toScreen(Math.min(prev.minX, lane.minX) - LANE_PAD_X, 0).x} y1="0"
                x2={toScreen(Math.max(prev.maxX, lane.maxX) + LANE_PAD_X, 0).x} y2="0">
                <stop offset="0%" stopColor="#3a4562" stopOpacity="0" />
                <stop offset="50%" stopColor="#3a4562" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#3a4562" stopOpacity="0" />
              </linearGradient>
            );
          })}
          {sorted.map((lane) => lane.tsCenters && lane.tsCenters.length === 2 && (
            <linearGradient key={`v-${lane.providerId}`} id={`branchDividerFade-${lane.providerId}`} gradientUnits="userSpaceOnUse"
              x1="0" y1={toScreen(0, Math.min(lane.tsCenters[0].y, lane.tsCenters[1].y)).y}
              x2="0" y2={toScreen(0, Math.max(lane.tsCenters[0].y, lane.tsCenters[1].y)).y}>
              <stop offset="0%" stopColor="#3a4562" stopOpacity="0" />
              <stop offset="50%" stopColor="#3a4562" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#3a4562" stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* lane divider — fades in from 0% at each end to ~12% at the middle. Skipped when
            the two lanes' actual content ranges overlap (e.g. they share a connected node) —
            there's no sensible single y to draw a divider at in that case. */}
        {sorted.slice(1).map((lane, i) => {
          const prev = sorted[i];
          if (lane.minY <= prev.maxY) return null;
          const dividerFlowY = (prev.maxY + LANE_PAD_Y + lane.minY - LANE_PAD_Y) / 2;
          const x1 = toScreen(Math.min(prev.minX, lane.minX) - LANE_PAD_X, dividerFlowY);
          const x2 = toScreen(Math.max(prev.maxX, lane.maxX) + LANE_PAD_X, dividerFlowY);
          return (
            <line
              key={`hd-${lane.providerId}`}
              x1={x1.x} y1={x1.y} x2={x2.x} y2={x2.y}
              stroke={`url(#laneDividerFade-${lane.providerId})`}
              strokeWidth={1.5}
              strokeDasharray="5 5"
            />
          );
        })}

        {/* branch divider — short vertical, same fade, sitting between two active
            Traffic Source siblings (Snap/Meta) at the midpoint between the Provider
            and Traffic Source columns */}
        {sorted.map((lane) => {
          if (!lane.tsCenters || lane.tsCenters.length !== 2 || lane.providerRightX === undefined) return null;
          const [a, b] = lane.tsCenters;
          const tsLeftX = Math.min(a.x, b.x); // both ts nodes share the same column x
          const splitX = (lane.providerRightX + tsLeftX) / 2;
          const centerY = (a.y + b.y) / 2;
          const halfSpan = Math.max(20, Math.min(80, Math.abs(b.y - a.y) / 2 - 20));
          const top = toScreen(splitX, centerY - halfSpan);
          const bottom = toScreen(splitX, centerY + halfSpan);
          return (
            <line
              key={`vd-${lane.providerId}`}
              x1={top.x} y1={top.y} x2={bottom.x} y2={bottom.y}
              stroke={`url(#branchDividerFade-${lane.providerId})`}
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          );
        })}

        {/* "Unassigned" divider — a plain (non-fading) dashed line + label marking the
            seam, within one lane's account/preset column, between connected nodes above
            and not-yet-wired ("orphan") nodes below. Deliberately not the fading style
            used above, so it reads as a distinct annotation rather than a lane boundary. */}
        {sorted.flatMap((lane) =>
          (lane.orphanDividers ?? []).map((od) => {
            const p1 = toScreen(od.xLeft - 6, od.y);
            const p2 = toScreen(od.xRight + 6, od.y);
            return (
              <g key={`od-${lane.providerId}-${od.col}`}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#414d6c" strokeWidth={1} strokeDasharray="3 3" />
                <text
                  x={p1.x}
                  y={p1.y - 6 * zoom}
                  fontSize={Math.max(8, 8.5 * zoom)}
                  fontWeight={700}
                  letterSpacing="0.1em"
                  fill="#5c6884"
                  style={{ textTransform: "uppercase" }}
                >
                  Unassigned
                </text>
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}
