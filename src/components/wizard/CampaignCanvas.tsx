"use client";

import { useEffect, useCallback, useState, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
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
import { ProviderNode } from "./nodes/ProviderNode";
import { RouterNode } from "./nodes/RouterNode";
import { ArticleNode } from "./nodes/ArticleNode";
import { AdAccountNode } from "./nodes/AdAccountNode";
import { PresetNode } from "./nodes/PresetNode";
import { ProviderEdge } from "./edges/ProviderEdge";

const PROVIDER_COLORS = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ec4899", "#f59e0b"] as const;

const NODE_TYPES = {
  group: CreativeGroupNode,
  provider: ProviderNode,
  router: RouterNode,
  article: ArticleNode,
  adaccount: AdAccountNode,
  preset: PresetNode,
};

const EDGE_TYPES = {
  provider: ProviderEdge,
};

const COLUMN_X = { group: 0, provider: 300, router: 520, article: 740, adaccount: 1040, preset: 1320 };
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
  const [articlePickerProviderId, setArticlePickerProviderId] = useState<string | null>(null);
  const [providerPickerRowId, setProviderPickerRowId] = useState<string | null>(null);
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

  // ─── Visibility logic ────────────────────────────────────────────────────────
  // All memoized — filter/Set always return new references; must be stable to avoid
  // buildNodes→setNodes→re-render loop (#185).
  const activeProviderIdsFromArticles = useMemo(
    () => new Set(store.edges.providerToArticle.map((e) => e.feedProviderId)),
    [store.edges.providerToArticle]
  );

  const visibleArticles = useMemo(() => {
    const providerOrder = new Map(sortedByCreation.map((p, i) => [p.id, i]));
    return articles
      .filter((a) => store.edges.providerToArticle.some((e) => e.articleId === a.id))
      .sort((a, b) => (providerOrder.get(a.feedProviderId) ?? 999) - (providerOrder.get(b.feedProviderId) ?? 999));
  }, [articles, store.edges.providerToArticle, sortedByCreation]);
  // Presets are enabled once any account is wired to any article
  const canSelectPresets = useMemo(
    () => store.edges.articleToAdAccount.length > 0,
    [store.edges.articleToAdAccount]
  );

  const visiblePresets = useMemo(() => {
    if (!canSelectPresets) return [];
    const providerOrder = new Map(sortedByCreation.map((p, i) => [p.id, i]));
    return presets
      .filter((p) => !p.feedProviderId || activeProviderIdsFromArticles.has(p.feedProviderId))
      .sort((a, b) => (providerOrder.get(a.feedProviderId ?? "") ?? 999) - (providerOrder.get(b.feedProviderId ?? "") ?? 999));
  }, [presets, activeProviderIdsFromArticles, sortedByCreation, canSelectPresets]);
  const connectedProviderIds = useMemo(
    () => new Set(store.edges.rowToProvider.map((e) => e.feedProviderId)),
    [store.edges.rowToProvider]
  );

  const visibleAccounts = useMemo(() => {
    const providerOrder = new Map(sortedByCreation.map((p, i) => [p.id, i]));
    const minProviderIndex = (accountId: string): number => {
      const cfg = adAccountConfigs.find((c) => c.id === accountId);
      if (!cfg || cfg.feedProviderIds.length === 0) return 999;
      return Math.min(...cfg.feedProviderIds.map((pid) => providerOrder.get(pid) ?? 999));
    };
    return allAccounts
      .filter((a) => {
        const cfg = adAccountConfigs.find((c) => c.id === a.id);
        if (cfg?.hidden) return false;
        if (cfg && cfg.feedProviderIds.length > 0) {
          return [...activeProviderIdsFromArticles].some((pid) => cfg.feedProviderIds.includes(pid));
        }
        return activeProviderIdsFromArticles.size > 0;
      })
      .sort((a, b) => minProviderIndex(a.id) - minProviderIndex(b.id));
  }, [allAccounts, adAccountConfigs, activeProviderIdsFromArticles, sortedByCreation]);

  // ─── Disconnect callbacks (one per node type) ────────────────────────────────
  // Uses getState() so it reads current store without closing over the store object,
  // keeping this callback stable and preventing it from triggering buildNodes rebuilds.
  const makeDisconnectTarget = useCallback(
    (nodeId: string) => {
      const s = useCanvasStore.getState();
      const type = nodeId.split("-")[0];

      if (type === "provider") {
        const providerId = nodeId.replace(/^provider-/, "");
        const rows = s.edges.rowToProvider.filter((e) => e.feedProviderId === providerId);
        rows.forEach((e) => s.disconnectRowFromProvider(e.rowId, providerId));

      } else if (type === "router") {
        s.removeRouter(nodeId);

      } else if (type === "article") {
        const articleId = nodeId.replace(/^article-/, "");
        const incoming = s.edges.providerToArticle.filter((e) => e.articleId === articleId);
        incoming.forEach((e) => s.toggleProviderToArticle(e.feedProviderId, articleId));

      } else if (type === "account") {
        const accountId = nodeId.replace(/^account-/, "");
        const incoming = s.edges.articleToAdAccount.filter((e) => e.adAccountId === accountId);
        incoming.forEach((e) => s.toggleArticleToAdAccount(e.articleId, accountId));

      } else if (type === "preset") {
        const presetId = nodeId.replace(/^preset-/, "");
        const incoming = s.edges.articleToPreset.filter((e) => e.presetId === presetId);
        incoming.forEach((e) => s.toggleArticleToPreset(e.articleId, presetId));
      }
    },
    []
  );

  // ─── Build React Flow nodes ───────────────────────────────────────────────
  const buildNodes = useCallback((): Node[] => {
    const nodes: Node[] = [];

    const pos = (col: keyof typeof COLUMN_X, index: number, id: string): { x: number; y: number } => {
      if (nodePositionsRef.current[id]) return nodePositionsRef.current[id];
      return { x: COLUMN_X[col], y: index * ROW_GAP };
    };

    // Creative Rows
    store.creativeRows.forEach((row, i) => {
      const nodeId = `row-${row.id}`;
      nodes.push({
        id: nodeId,
        type: "group",
        position: pos("group", i, nodeId),
        style: { background: "transparent", border: "none", padding: 0 },
        data: {
          rowId: row.id,
          providerColorMap,
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
            store.setNodePosition(`row-${newRow.id}`, { x: currentPos.x, y: currentPos.y + 320 });
            setTargetGroupId(null);
            setTargetRowId(newRow.id);
            setSiloOpen(true);
          },
          onDuplicateRow: (rId: string) => {
            const newRow = store.duplicateRow(rId);
            if (newRow) {
              const currentPos = nodePositionsRef.current[`row-${rId}`] ?? { x: COLUMN_X.group, y: i * ROW_GAP };
              store.setNodePosition(`row-${newRow.id}`, { x: currentPos.x, y: currentPos.y + 320 });
            }
          },
          onPickProviders: setProviderPickerRowId,
        },
      });
    });

    // Providers — only ones explicitly connected via rowToProvider edges
    if (store.creativeRows.length > 0) {
      sortedByCreation.forEach((provider, i) => {
        if (!connectedProviderIds.has(provider.id)) return;
        const nodeId = `provider-${provider.id}`;
        nodes.push({
          id: nodeId,
          type: "provider",
          position: pos("provider", i, nodeId),
          data: {
            providerId: provider.id,
            name: provider.name,
            color: providerColorMap[provider.id] ?? "#94a3b8",
            onDisconnectTarget: makeDisconnectTarget,
            onAddArticle: setArticlePickerProviderId,
          },
        });
      });
    }

    // Router nodes
    store.routerNodes.forEach((router, i) => {
      nodes.push({
        id: router.id,
        type: "router",
        position: pos("router", i, router.id),
        data: {
          routerId: router.id,
          color: providerColorMap[router.feedProviderId] ?? "#94a3b8",
          onDisconnectTarget: makeDisconnectTarget,
        },
      });
    });

    // Articles (only visible ones)
    visibleArticles.forEach((article, i) => {
      const nodeId = `article-${article.id}`;
      const color = providerColorMap[article.feedProviderId] ?? "#94a3b8";
      nodes.push({
        id: nodeId,
        type: "article",
        position: pos("article", i, nodeId),
        data: {
          article,
          color,
          onDisconnectTarget: makeDisconnectTarget,
        },
      });
    });

    // Ad accounts (only visible ones)
    visibleAccounts.forEach((account, i) => {
      const nodeId = `account-${account.id}`;
      const cfg = adAccountConfigs.find((c) => c.id === account.id);
      const color = cfg?.feedProviderIds.length
        ? (providerColorMap[cfg.feedProviderIds[0]] ?? "#94a3b8")
        : "#94a3b8";
      nodes.push({
        id: nodeId,
        type: "adaccount",
        position: pos("adaccount", i, nodeId),
        data: {
          accountId: account.id,
          name: account.name,
          color,
          onDisconnectTarget: makeDisconnectTarget,
        },
      });
    });

    // Presets (only visible ones)
    visiblePresets.forEach((preset, i) => {
      const nodeId = `preset-${preset.id}`;
      const provider = preset.feedProviderId ? sortedByCreation.find((p) => p.id === preset.feedProviderId) : null;
      const color = provider ? (providerColorMap[provider.id] ?? "#94a3b8") : "#94a3b8";
      nodes.push({
        id: nodeId,
        type: "preset",
        position: pos("preset", i, nodeId),
        data: {
          preset,
          color,
          articles,
          disabled: !canSelectPresets,
          onDisconnectTarget: makeDisconnectTarget,
        },
      });
    });

    return nodes;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    store.creativeRows, store.routerNodes,
    sortedByCreation, providerColorMap, connectedProviderIds, visibleArticles, visibleAccounts, visiblePresets,
    adAccountConfigs, articles, canSelectPresets, makeDisconnectTarget,
  ]);

  // ─── Build React Flow edges ───────────────────────────────────────────────
  const buildEdges = useCallback((): Edge[] => {
    const edges: Edge[] = [];

    // Row → Provider (or Row → Router)
    for (const e of store.edges.rowToProvider) {
      const router = store.routerNodes.find((r) => r.feedProviderId === e.feedProviderId);
      const target = router ? router.id : `provider-${e.feedProviderId}`;
      edges.push({
        id: `rp-${e.rowId}-${e.feedProviderId}`,
        source: `row-${e.rowId}`,
        sourceHandle: "out",
        target,
        targetHandle: "in",
        type: "provider",
        data: { color: providerColorMap[e.feedProviderId] ?? "#94a3b8" },
      });
    }

    // Router → Provider
    for (const r of store.routerNodes) {
      edges.push({
        id: `rtp-${r.id}`,
        source: r.id,
        sourceHandle: "out",
        target: `provider-${r.feedProviderId}`,
        targetHandle: "in",
        type: "provider",
        data: { color: providerColorMap[r.feedProviderId] ?? "#94a3b8" },
      });
    }

    // Provider → Article (or Router → Article)
    for (const e of store.edges.providerToArticle) {
      const router = store.routerNodes.find((r) => r.feedProviderId === e.feedProviderId);
      const source = router ? router.id : `provider-${e.feedProviderId}`;
      edges.push({
        id: `pa-${e.feedProviderId}-${e.articleId}`,
        source,
        sourceHandle: "out",
        target: `article-${e.articleId}`,
        targetHandle: "in",
        type: "provider",
        data: { color: providerColorMap[e.feedProviderId] ?? "#94a3b8" },
      });
    }

    // Article → AdAccount (explicit edges)
    for (const e of store.edges.articleToAdAccount) {
      const provEdge = store.edges.providerToArticle.find((p) => p.articleId === e.articleId);
      const color = provEdge ? (providerColorMap[provEdge.feedProviderId] ?? "#94a3b8") : "#94a3b8";
      edges.push({
        id: `aa-${e.articleId}-${e.adAccountId}`,
        source: `article-${e.articleId}`,
        sourceHandle: "out",
        target: `account-${e.adAccountId}`,
        targetHandle: "in",
        type: "provider",
        data: { color },
      });
    }

    // AdAccount → Preset (derived from articleToAdAccount + articleToPreset)
    for (const pe of store.edges.articleToPreset) {
      const provEdge = store.edges.providerToArticle.find((e) => e.articleId === pe.articleId);
      const color = provEdge ? (providerColorMap[provEdge.feedProviderId] ?? "#94a3b8") : "#94a3b8";
      const connectedAccounts = store.edges.articleToAdAccount
        .filter((ae) => ae.articleId === pe.articleId)
        .map((ae) => ae.adAccountId);
      for (const accountId of connectedAccounts) {
        const edgeId = `ap-${accountId}-${pe.presetId}-${pe.articleId}`;
        if (!edges.some((ed) => ed.id === edgeId)) {
          edges.push({
            id: edgeId,
            source: `account-${accountId}`,
            sourceHandle: "out",
            target: `preset-${pe.presetId}`,
            targetHandle: "in",
            type: "provider",
            data: { color },
          });
        }
      }
    }

    return edges;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    store.edges, store.routerNodes,
    providerColorMap,
  ]);

  const [nodes, setNodes] = useNodesState(buildNodes());
  const [edges, setEdges] = useEdgesState(buildEdges());

  useEffect(() => { setNodes(buildNodes()); }, [buildNodes, setNodes]);
  useEffect(() => { setEdges(buildEdges()); }, [buildEdges, setEdges]);

  // Sync drag positions back to store
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  // Handle new connections
  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target) return;

      const srcType = source.split("-")[0];
      const tgtType = target.split("-")[0];

      if (srcType === "row" && (tgtType === "provider" || tgtType === "router")) {
        const rowId = source.replace(/^row-/, "");
        const providerId = tgtType === "router"
          ? store.routerNodes.find((r) => r.id === target)?.feedProviderId ?? ""
          : target.replace(/^provider-/, "");
        if (providerId) store.connectRowToProvider(rowId, providerId);

      } else if ((srcType === "provider" || srcType === "router") && tgtType === "article") {
        const providerId = srcType === "router"
          ? store.routerNodes.find((r) => r.id === source)?.feedProviderId ?? ""
          : source.replace(/^provider-/, "");
        const articleId = target.replace(/^article-/, "");
        if (!providerId) return;

        // Auto-insert router when provider already has an article edge and no router yet
        const existingArticleEdges = store.edges.providerToArticle.filter(
          (e) => e.feedProviderId === providerId
        );
        const hasRouter = store.routerNodes.some((r) => r.feedProviderId === providerId);
        if (existingArticleEdges.length >= 1 && !hasRouter) {
          const router = store.addRouter(providerId);
          const provPos = nodePositionsRef.current[`provider-${providerId}`] ?? { x: COLUMN_X.provider, y: 0 };
          store.setNodePosition(router.id, { x: COLUMN_X.router, y: provPos.y });
        }

        const articleForDefault = articles.find((a) => a.id === articleId);
        const dh =
          articleForDefault?.defaultHeadlineIndex !== undefined
            ? articleForDefault.allowedHeadlines[articleForDefault.defaultHeadlineIndex]
            : undefined;
        store.toggleProviderToArticle(providerId, articleId, dh?.text, dh?.rac);

      } else if (srcType === "article" && tgtType === "account") {
        const articleId = source.replace(/^article-/, "");
        const accountId = target.replace(/^account-/, "");
        store.toggleArticleToAdAccount(articleId, accountId);

      } else if (srcType === "account" && tgtType === "preset") {
        const presetId = target.replace(/^preset-/, "");
        const preset = presets.find((p) => p.id === presetId);
        if (preset && canSelectPresets) {
          const activeArticleIds = new Set(store.edges.providerToArticle.map((e) => e.articleId));
          const matching = [...activeArticleIds].filter((aId) => {
            const article = articles.find((a) => a.id === aId);
            return article && (!preset.feedProviderId || article.feedProviderId === preset.feedProviderId);
          });
          matching.forEach((aId) => store.toggleArticleToPreset(aId, presetId));
        }
      }
    },
    [store, presets, articles, canSelectPresets]
  );

  // Handle edge deletion (keyboard Delete/Backspace)
  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      for (const edge of deletedEdges) {
        const { source, target } = edge;
        const srcType = source.split("-")[0];
        const tgtType = target.split("-")[0];

        if (srcType === "row" && (tgtType === "provider" || tgtType === "router")) {
          const rowId = source.replace(/^row-/, "");
          const providerId = tgtType === "router"
            ? store.routerNodes.find((r) => r.id === target)?.feedProviderId ?? ""
            : target.replace(/^provider-/, "");
          if (providerId) store.disconnectRowFromProvider(rowId, providerId);
        } else if ((srcType === "provider" || srcType === "router") && tgtType === "article") {
          const providerId = srcType === "router"
            ? store.routerNodes.find((r) => r.id === source)?.feedProviderId ?? ""
            : source.replace(/^provider-/, "");
          const articleId = target.replace(/^article-/, "");
          if (providerId) store.toggleProviderToArticle(providerId, articleId);
        } else if (srcType === "article" && tgtType === "account") {
          const articleId = source.replace(/^article-/, "");
          const accountId = target.replace(/^account-/, "");
          store.toggleArticleToAdAccount(articleId, accountId);
        }
      }
    },
    [store]
  );

  // Auto-layout — dagre positions connected nodes; disconnected-but-visible nodes
  // are placed in their correct columns so they don't float at y=0.
  const handleAutoLayout = useCallback(() => {
    const currentNodes = buildNodes();
    const currentEdges = buildEdges();
    const connectedIds = new Set<string>();
    currentEdges.forEach((e) => { connectedIds.add(e.source); connectedIds.add(e.target); });
    const connectedNodes = currentNodes.filter((n) => connectedIds.has(n.id));
    if (connectedNodes.length === 0) return;
    const positions = computeAutoLayout(connectedNodes, currentEdges);

    // Override dagre x with the fixed column x — we only use dagre's y values.
    // Skip "group" (row) nodes — their x is dynamically managed by card-prepend shifts
    // and must not be clobbered here.
    for (const n of connectedNodes) {
      if (positions[n.id] && n.type && n.type !== "group") {
        const colX = COLUMN_X[n.type as keyof typeof COLUMN_X];
        if (colX !== undefined) positions[n.id].x = colX;
      }
    }

    // Providers: anchor on a connected provider's y, fill disconnected slots with ROW_GAP spacing.
    const providerNodes = currentNodes.filter((n) => n.type === "provider");
    if (providerNodes.some((n) => !positions[n.id])) {
      const anchorIdx = providerNodes.findIndex((n) => positions[n.id]);
      const anchorY = anchorIdx >= 0 ? positions[providerNodes[anchorIdx].id]!.y : 0;
      providerNodes.forEach((n, i) => {
        if (!positions[n.id]) {
          positions[n.id] = { x: COLUMN_X.provider, y: anchorY + (i - anchorIdx) * ROW_GAP };
        }
      });
    }

    // Accounts/presets: center on the y-range of laid-out articles.
    const articleYs = currentNodes
      .filter((n) => n.type === "article" && positions[n.id])
      .map((n) => positions[n.id]!.y);
    const articleMidY = articleYs.length
      ? (Math.min(...articleYs) + Math.max(...articleYs)) / 2
      : 0;
    const typeCounters: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    for (const n of currentNodes) {
      if (positions[n.id] || n.type === "provider" || !n.type) continue;
      typeCounts[n.type] = (typeCounts[n.type] ?? 0) + 1;
    }
    for (const n of currentNodes) {
      if (positions[n.id] || n.type === "provider" || !n.type) continue;
      const colX = COLUMN_X[n.type as keyof typeof COLUMN_X];
      if (colX === undefined) continue;
      const idx = typeCounters[n.type] ?? 0;
      typeCounters[n.type] = idx + 1;
      const count = typeCounts[n.type];
      positions[n.id] = { x: colX, y: articleMidY + (idx - (count - 1) / 2) * ROW_GAP };
    }

    useCanvasStore.getState().setNodePositions(positions);
    nodePositionsRef.current = { ...nodePositionsRef.current, ...positions };
    setNodes((prev) => prev.map((n) => positions[n.id] ? { ...n, position: positions[n.id] } : n));
  }, [buildNodes, buildEdges, setNodes]);

  useEffect(() => { handleAutoLayout(); }, [handleAutoLayout]);

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
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          colorMode="dark"
          style={{ background: "#1f2937" }}
          nodesDraggable={false}
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

      {/* Article picker modal */}
      {articlePickerProviderId &&
        (() => {
          const providerArticles = articles.filter(
            (a) => a.feedProviderId === articlePickerProviderId
          );
          const selectedIds = new Set(
            store.edges.providerToArticle
              .filter((e) => e.feedProviderId === articlePickerProviderId)
              .map((e) => e.articleId)
          );
          const providerName =
            providers.find((p) => p.id === articlePickerProviderId)?.name ?? "";
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
              onClick={() => setArticlePickerProviderId(null)}
            >
              <div
                className="bg-gray-900 border border-gray-700 rounded-2xl p-4 w-80 max-h-[70vh] flex flex-col shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-200">
                    Articles — {providerName}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setArticlePickerProviderId(null)}
                    className="text-gray-500 hover:text-gray-300 text-lg leading-none"
                  >
                    ✕
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 space-y-1">
                  {providerArticles.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-4">
                      No articles for this provider
                    </p>
                  ) : (
                    providerArticles.map((article) => {
                      const isSelected = selectedIds.has(article.id);
                      const dh =
                        article.defaultHeadlineIndex !== undefined
                          ? article.allowedHeadlines[article.defaultHeadlineIndex]
                          : undefined;
                      return (
                        <button
                          key={article.id}
                          type="button"
                          onClick={() =>
                            store.toggleProviderToArticle(
                              articlePickerProviderId,
                              article.id,
                              dh?.text,
                              dh?.rac
                            )
                          }
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                            isSelected
                              ? "bg-blue-600/20 border border-blue-500/40 text-blue-300"
                              : "bg-gray-800 border border-transparent text-gray-300 hover:bg-gray-700"
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              isSelected
                                ? "bg-blue-600 border-blue-500"
                                : "border-gray-600"
                            }`}
                          >
                            {isSelected && (
                              <span className="text-white text-[10px]">✓</span>
                            )}
                          </span>
                          <span className="truncate">{article.slug}</span>
                        </button>
                      );
                    })
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setArticlePickerProviderId(null)}
                  className="mt-3 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors w-full"
                >
                  Done
                </button>
              </div>
            </div>
          );
        })()}

      {/* Provider picker modal */}
      {providerPickerRowId &&
        (() => {
          const rowId = providerPickerRowId;
          const connectedToRow = new Set(
            store.edges.rowToProvider
              .filter((e) => e.rowId === rowId)
              .map((e) => e.feedProviderId)
          );
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
              onClick={() => setProviderPickerRowId(null)}
            >
              <div
                className="bg-gray-900 border border-gray-700 rounded-2xl p-4 w-80 max-h-[70vh] flex flex-col shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-200">Connect Feed Providers</h3>
                  <button
                    type="button"
                    onClick={() => setProviderPickerRowId(null)}
                    className="text-gray-500 hover:text-gray-300 text-lg leading-none"
                  >
                    ✕
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 space-y-1">
                  {sortedByCreation.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-4">No feed providers configured</p>
                  ) : (
                    sortedByCreation.map((provider) => {
                      const isConnected = connectedToRow.has(provider.id);
                      const color = providerColorMap[provider.id] ?? "#94a3b8";
                      return (
                        <button
                          key={provider.id}
                          type="button"
                          onClick={() =>
                            isConnected
                              ? store.disconnectRowFromProvider(rowId, provider.id)
                              : store.connectRowToProvider(rowId, provider.id)
                          }
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                            isConnected
                              ? "bg-blue-600/20 border border-blue-500/40 text-blue-300"
                              : "bg-gray-800 border border-transparent text-gray-300 hover:bg-gray-700"
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              isConnected ? "bg-blue-600 border-blue-500" : "border-gray-600"
                            }`}
                          >
                            {isConnected && <span className="text-white text-[10px]">✓</span>}
                          </span>
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                          <span className="truncate">{provider.name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setProviderPickerRowId(null)}
                  className="mt-3 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors w-full"
                >
                  Done
                </button>
              </div>
            </div>
          );
        })()}

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
        multiSelect={!!targetRowId}
        onMultiSelect={(assets) => {
          if (!targetRowId) return;
          const s = useCanvasStore.getState();
          const nodeId = `row-${targetRowId}`;
          const rowIdx = s.creativeRows.findIndex((r) => r.id === targetRowId);
          const curPos = nodePositionsRef.current[nodeId] ?? { x: COLUMN_X.group, y: rowIdx * ROW_GAP };
          const existingCount = s.creativeRows.find((r) => r.id === targetRowId)?.groupIds.length ?? 0;
          // Each prepend after the first shifts x left; if existingCount=0 first card doesn't shift
          const shifts = existingCount === 0 ? assets.length - 1 : assets.length;
          assets.forEach((asset) => useCanvasStore.getState().addGroupToRow(targetRowId, asset.id));
          if (shifts > 0) {
            useCanvasStore.getState().setNodePosition(nodeId, { x: curPos.x - shifts * ROW_CARD_STEP, y: curPos.y });
          }
          setSiloOpen(false);
          setTargetRowId(null);
        }}
        adAccountId=""
      />
    </div>
  );
}
