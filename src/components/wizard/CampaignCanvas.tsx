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

interface CampaignCanvasProps {
  adAccountId?: string;
  onReview: () => void;
}

export function CampaignCanvas({ onReview }: CampaignCanvasProps) {
  const store = useCanvasStore();
  const [siloOpen, setSiloOpen] = useState(false);
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

  // ─── Visibility logic ────────────────────────────────────────────────────────
  // All memoized — filter/Set always return new references; must be stable to avoid
  // buildNodes→setNodes→re-render loop (#185).
  const activeProviderIds = useMemo(
    () => new Set(store.edges.groupToProvider.map((e) => e.feedProviderId)),
    [store.edges.groupToProvider]
  );
  const activeProviderIdsFromArticles = useMemo(
    () => new Set(store.edges.providerToArticle.map((e) => e.feedProviderId)),
    [store.edges.providerToArticle]
  );

  const visibleArticles = useMemo(
    () => articles.filter((a) => activeProviderIds.has(a.feedProviderId)),
    [articles, activeProviderIds]
  );
  const visiblePresets = useMemo(
    () => presets.filter((p) => !p.feedProviderId || activeProviderIdsFromArticles.has(p.feedProviderId)),
    [presets, activeProviderIdsFromArticles]
  );
  const visibleAccounts = useMemo(
    () => allAccounts.filter((a) => {
      const cfg = adAccountConfigs.find((c) => c.id === a.id);
      if (cfg?.hidden) return false;
      if (cfg && cfg.feedProviderIds.length > 0) {
        return [...activeProviderIdsFromArticles].some((pid) => cfg.feedProviderIds.includes(pid));
      }
      // Show all unhidden accounts once any article is connected
      return activeProviderIdsFromArticles.size > 0;
    }),
    [allAccounts, adAccountConfigs, activeProviderIdsFromArticles]
  );

  // Presets are enabled once any account is wired to any article
  const canSelectPresets = useMemo(
    () => store.edges.articleToAdAccount.length > 0,
    [store.edges.articleToAdAccount]
  );

  // ─── Disconnect callbacks (one per node type) ────────────────────────────────
  const makeDisconnectTarget = useCallback(
    (nodeId: string) => {
      const type = nodeId.split("-")[0];

      if (type === "provider") {
        const providerId = nodeId.replace(/^provider-/, "");
        const groups = store.edges.groupToProvider.filter((e) => e.feedProviderId === providerId);
        groups.forEach((e) => store.toggleGroupToProvider(e.groupId, providerId));

      } else if (type === "router") {
        store.removeRouter(nodeId);

      } else if (type === "article") {
        const articleId = nodeId.replace(/^article-/, "");
        const incoming = store.edges.providerToArticle.filter((e) => e.articleId === articleId);
        incoming.forEach((e) => store.toggleProviderToArticle(e.feedProviderId, articleId));

      } else if (type === "account") {
        const accountId = nodeId.replace(/^account-/, "");
        const incoming = store.edges.articleToAdAccount.filter((e) => e.adAccountId === accountId);
        incoming.forEach((e) => store.toggleArticleToAdAccount(e.articleId, accountId));

      } else if (type === "preset") {
        const presetId = nodeId.replace(/^preset-/, "");
        const incoming = store.edges.articleToPreset.filter((e) => e.presetId === presetId);
        incoming.forEach((e) => store.toggleArticleToPreset(e.articleId, presetId));
      }
    },
    [store]
  );

  // ─── Build React Flow nodes ───────────────────────────────────────────────
  const buildNodes = useCallback((): Node[] => {
    const nodes: Node[] = [];

    const pos = (col: keyof typeof COLUMN_X, index: number, id: string): { x: number; y: number } => {
      if (nodePositionsRef.current[id]) return nodePositionsRef.current[id];
      return { x: COLUMN_X[col], y: index * ROW_GAP };
    };

    // Creative Groups
    store.creativeGroups.forEach((group, i) => {
      const nodeId = `group-${group.id}`;
      nodes.push({
        id: nodeId,
        type: "group",
        position: pos("group", i, nodeId),
        data: {
          groupId: group.id,
          providerColorMap,
          onAddCreative: (gId: string) => {
            setTargetGroupId(gId);
            setSiloOpen(true);
          },
          onRemoveGroup: (gId: string) => store.removeGroup(gId),
        },
      });
    });

    // Providers — only when at least one group exists
    if (store.creativeGroups.length > 0) {
      sortedByCreation.forEach((provider, i) => {
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
    store.creativeGroups, store.routerNodes,
    sortedByCreation, providerColorMap, visibleArticles, visibleAccounts, visiblePresets,
    adAccountConfigs, articles, canSelectPresets, makeDisconnectTarget,
  ]);

  // ─── Build React Flow edges ───────────────────────────────────────────────
  const buildEdges = useCallback((): Edge[] => {
    const edges: Edge[] = [];

    // Group → Provider (or Group → Router)
    for (const e of store.edges.groupToProvider) {
      const router = store.routerNodes.find((r) => r.feedProviderId === e.feedProviderId);
      const target = router ? router.id : `provider-${e.feedProviderId}`;
      edges.push({
        id: `gp-${e.groupId}-${e.feedProviderId}`,
        source: `group-${e.groupId}`,
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
        id: `rp-${r.id}`,
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

      if (srcType === "group" && (tgtType === "provider" || tgtType === "router")) {
        const groupId = source.replace(/^group-/, "");
        const providerId = tgtType === "router"
          ? store.routerNodes.find((r) => r.id === target)?.feedProviderId ?? ""
          : target.replace(/^provider-/, "");
        if (providerId) store.toggleGroupToProvider(groupId, providerId);

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

        store.toggleProviderToArticle(providerId, articleId);

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

        if (srcType === "group" && (tgtType === "provider" || tgtType === "router")) {
          const groupId = source.replace(/^group-/, "");
          const providerId = tgtType === "router"
            ? store.routerNodes.find((r) => r.id === target)?.feedProviderId ?? ""
            : target.replace(/^provider-/, "");
          if (providerId) store.toggleGroupToProvider(groupId, providerId);
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

  // Auto-layout
  const handleAutoLayout = useCallback(() => {
    const currentNodes = buildNodes();
    const currentEdges = buildEdges();
    const positions = computeAutoLayout(currentNodes, currentEdges);
    store.setNodePositions(positions);
  }, [buildNodes, buildEdges, store]);

  const matrix = store.buildCampaignMatrix();

  const openAddCreative = useCallback(() => {
    const newGroup = store.addGroup();
    setTargetGroupId(newGroup.id);
    setSiloOpen(true);
  }, [store]);

  return (
    <div className="flex flex-col h-full">
      <CanvasControls
        onAddCreative={openAddCreative}
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
          style={{ background: "#f5f5f5" }}
          fitView
          fitViewOptions={{ padding: 1.5, maxZoom: 0.75 }}
          deleteKeyCode={["Backspace", "Delete"]}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d0d0d0" />
          <Controls showInteractive={false} />
          <MiniMap nodeStrokeWidth={3} zoomable pannable />
        </ReactFlow>
      </div>

      {store.creativeGroups.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: 52 }}>
          <button
            type="button"
            onClick={openAddCreative}
            className="pointer-events-auto border-2 border-dashed border-gray-300 rounded-2xl px-10 py-8 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors bg-white/80 backdrop-blur-sm shadow-sm"
          >
            + Add a Creative to start building
          </button>
        </div>
      )}

      <SiloBrowser
        isOpen={siloOpen}
        onClose={() => { setSiloOpen(false); setTargetGroupId(null); }}
        onSelect={(asset) => {
          if (targetGroupId) {
            store.addCreativeToGroup(targetGroupId, asset.id);
          }
          setSiloOpen(false);
          setTargetGroupId(null);
        }}
        adAccountId=""
      />
    </div>
  );
}
