"use client";

import { useEffect, useCallback, useState, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  type Node,
  type NodeChange,
  applyNodeChanges,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useCanvasStore } from "@/hooks/useCanvasStore";
import { SiloBrowser } from "@/components/silo/SiloBrowser";
import { loadFeedProviders } from "@/lib/feed-providers";
import { loadArticles } from "@/lib/articles";
import { loadPresets } from "@/lib/presets";
import { loadAdAccountConfigs } from "@/lib/adAccounts";
import { useAdAccounts } from "@/hooks/useAdAccounts";
import type { FeedProvider } from "@/types/feed-provider";
import type { Article } from "@/types/article";
import type { CampaignPreset } from "@/types/preset";
import type { AdAccountConfig } from "@/types/ad-account";
import { computeAutoLayout, CanvasControls } from "./CanvasControls";
import { CreativeGroupNode } from "./nodes/CreativeGroupNode";

const PROVIDER_COLORS = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ec4899", "#f59e0b"] as const;

const NODE_TYPES = {
  group: CreativeGroupNode,
};

const COLUMN_X = { group: 0 };
const ROW_GAP = 130;
const ROW_CARD_STEP = 172; // CARD_W (160) + CARD_GAP (12) — used to shift row left when prepending a card

interface CampaignCanvasProps {
  adAccountId?: string;
  onReview: () => void;
}

export function CampaignCanvas({ onReview }: CampaignCanvasProps) {
  const store = useCanvasStore();
  const [siloOpen, setSiloOpen] = useState(false);
  const [targetRowId, setTargetRowId] = useState<string | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);
  const [providers, setProviders] = useState<FeedProvider[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [presets, setPresets] = useState<CampaignPreset[]>([]);
  const [adAccountConfigs, setAdAccountConfigs] = useState<AdAccountConfig[]>([]);
  const { accounts: allAccounts } = useAdAccounts();

  useEffect(() => {
    setProviders(loadFeedProviders());
    setArticles(loadArticles());
    setPresets(loadPresets());
    setAdAccountConfigs(loadAdAccountConfigs());
  }, []);

  // Read nodePositions via ref to avoid including them in buildNodes deps (prevents render loop).
  const nodePositionsRef = useRef(store.nodePositions);
  useEffect(() => { nodePositionsRef.current = store.nodePositions; }, [store.nodePositions]);

  // Stable provider color map
  const sortedByCreation = useMemo(
    () => [...providers].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [providers]
  );
  const providerColorMap: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {};
    sortedByCreation.forEach((p, i) => { map[p.id] = PROVIDER_COLORS[i % PROVIDER_COLORS.length]; });
    return map;
  }, [sortedByCreation]);

  // Visible accounts: filter out hidden ones; pass {id, name} to row node config panel
  const visibleAccounts = useMemo(
    () =>
      allAccounts
        .filter((a) => {
          const cfg = adAccountConfigs.find((c) => c.id === a.id);
          return !cfg?.hidden;
        })
        .map((a) => ({ id: a.id, name: a.name })),
    [allAccounts, adAccountConfigs]
  );

  // ─── Build React Flow nodes ───────────────────────────────────────────────
  const buildNodes = useCallback((): Node[] => {
    const nodes: Node[] = [];

    const pos = (index: number, id: string): { x: number; y: number } => {
      if (nodePositionsRef.current[id]) return nodePositionsRef.current[id];
      return { x: COLUMN_X.group, y: index * ROW_GAP };
    };

    store.creativeRows.forEach((row, i) => {
      const nodeId = `row-${row.id}`;
      nodes.push({
        id: nodeId,
        type: "group",
        position: pos(i, nodeId),
        style: { background: "transparent", border: "none", padding: 0 },
        data: {
          rowId: row.id,
          providerColorMap,
          providers: sortedByCreation,
          articles,
          accounts: visibleAccounts,
          presets,
          onAddToRow: (rId: string) => {
            setTargetGroupId(null);
            setTargetRowId(rId);
            setSiloOpen(true);
          },
          onAddToSlot: (gId: string) => {
            setTargetRowId(null);
            setTargetGroupId(gId);
            setSiloOpen(true);
          },
          onRemoveRow: (rId: string) => store.removeRow(rId),
          onNewRow: () => {
            const newRow = store.addRow();
            const currentPos = nodePositionsRef.current[`row-${row.id}`] ?? { x: COLUMN_X.group, y: i * ROW_GAP };
            store.setNodePosition(`row-${newRow.id}`, { x: currentPos.x, y: currentPos.y + 480 });
            setTargetGroupId(null);
            setTargetRowId(newRow.id);
            setSiloOpen(true);
          },
          onDuplicateRow: (rId: string) => {
            const newRow = store.duplicateRow(rId);
            if (newRow) {
              const currentPos = nodePositionsRef.current[`row-${rId}`] ?? { x: COLUMN_X.group, y: i * ROW_GAP };
              store.setNodePosition(`row-${newRow.id}`, { x: currentPos.x, y: currentPos.y + 480 });
            }
          },
        },
      });
    });

    return nodes;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    store.creativeRows,
    sortedByCreation, providerColorMap, articles, presets, visibleAccounts,
  ]);

  const [nodes, setNodes] = useNodesState(buildNodes());

  useEffect(() => { setNodes(buildNodes()); }, [buildNodes, setNodes]);

  // Sync drag positions back to store
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      for (const change of changes) {
        if (change.type === "position" && change.position && change.dragging === false) {
          store.setNodePosition(change.id, change.position);
        }
      }
    },
    [setNodes, store]
  );

  // Auto-layout
  const handleAutoLayout = useCallback(() => {
    const currentNodes = buildNodes();
    const positions = computeAutoLayout(currentNodes, []);
    store.setNodePositions(positions);
  }, [buildNodes, store]);

  const matrix = store.buildCampaignMatrix();

  const openAddCreative = useCallback(() => {
    const newRow = store.addRow();
    setTargetRowId(newRow.id);
    setSiloOpen(true);
  }, [store]);

  return (
    <div className="flex flex-col h-full">
      <CanvasControls
        onAutoLayout={handleAutoLayout}
        campaignCount={matrix.length}
        onReview={onReview}
        isValid={matrix.length > 0}
      />

      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={[]}
          onNodesChange={onNodesChange}
          nodeTypes={NODE_TYPES}
          colorMode="dark"
          style={{ background: "#1f2937" }}
          fitView
          fitViewOptions={{ padding: 1.5, maxZoom: 0.75 }}
          deleteKeyCode={["Backspace", "Delete"]}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#374151" />
          <Controls showInteractive={false} />
          <MiniMap nodeStrokeWidth={3} zoomable pannable />
        </ReactFlow>
      </div>

      {store.creativeRows.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: 52 }}>
          <button
            type="button"
            onClick={openAddCreative}
            className="pointer-events-auto border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl px-10 py-8 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm shadow-sm"
          >
            + Add a Creative to start building
          </button>
        </div>
      )}

      <SiloBrowser
        isOpen={siloOpen}
        onClose={() => {
          if (targetRowId) {
            const row = useCanvasStore.getState().creativeRows.find((r) => r.id === targetRowId);
            if (row && row.groupIds.length === 0) {
              useCanvasStore.getState().removeRow(targetRowId);
            }
          }
          setSiloOpen(false);
          setTargetRowId(null);
          setTargetGroupId(null);
        }}
        onSelect={(asset) => {
          if (targetGroupId) {
            store.addCreativeToGroup(targetGroupId, asset.id);
          } else if (targetRowId) {
            const existingCount = store.creativeRows.find(r => r.id === targetRowId)?.groupIds.length ?? 0;
            store.addGroupToRow(targetRowId, asset.id);
            if (existingCount > 0) {
              // New card prepends (leftmost), so shift node left to keep rightmost card anchored
              const nodeId = `row-${targetRowId}`;
              const rowIdx = store.creativeRows.findIndex(r => r.id === targetRowId);
              const curPos = nodePositionsRef.current[nodeId] ?? { x: COLUMN_X.group, y: rowIdx * ROW_GAP };
              store.setNodePosition(nodeId, { x: curPos.x - ROW_CARD_STEP, y: curPos.y });
            }
          }
          setSiloOpen(false);
          setTargetRowId(null);
          setTargetGroupId(null);
        }}
        adAccountId=""
      />
    </div>
  );
}
