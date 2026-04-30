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
import { CreativeNode } from "./nodes/CreativeNode";
import { ProviderNode } from "./nodes/ProviderNode";
import { RouterNode } from "./nodes/RouterNode";
import { ArticleNode } from "./nodes/ArticleNode";
import { AdAccountNode } from "./nodes/AdAccountNode";
import { PresetNode } from "./nodes/PresetNode";
import { ProviderEdge } from "./edges/ProviderEdge";

const PROVIDER_COLORS = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ec4899", "#f59e0b"] as const;

const NODE_TYPES = {
  creative: CreativeNode,
  provider: ProviderNode,
  router: RouterNode,
  article: ArticleNode,
  adaccount: AdAccountNode,
  preset: PresetNode,
};

const EDGE_TYPES = {
  provider: ProviderEdge,
};

// Default column x-positions for auto-placing new nodes
const COLUMN_X = { creative: 0, provider: 300, router: 520, article: 740, adaccount: 1040, preset: 1320 };
const ROW_GAP = 110;

interface CampaignCanvasProps {
  adAccountId?: string;
  onReview: () => void;
}

export function CampaignCanvas({ adAccountId, onReview }: CampaignCanvasProps) {
  const store = useCanvasStore();
  const [siloOpen, setSiloOpen] = useState(false);

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

  // Seed pre-selected ad account if provided
  useEffect(() => {
    if (adAccountId && store.selectedAdAccountIds.length === 0) {
      store.setSelectedAdAccountIds([adAccountId]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adAccountId]);

  // Read nodePositions via ref so buildNodes doesn't subscribe to position changes.
  // If nodePositions were in buildNodes deps, every drag would update the store →
  // rebuild nodes → React Flow fires more position changes → infinite loop (#185).
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

  // ─── Visibility logic (same rules as old canvas) ─────────────────────────
  // All of these MUST be memoized — filter/Set always return new references,
  // and they flow into buildNodes useCallback deps → setNodes useEffect.
  // Without useMemo every render triggers a new buildNodes → setNodes → re-render loop (#185).
  const activeProviderIds = useMemo(
    () => new Set(store.edges.creativeToProvider.map((e) => e.feedProviderId)),
    [store.edges.creativeToProvider]
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
      return true;
    }),
    [allAccounts, adAccountConfigs, activeProviderIdsFromArticles]
  );

  // Auto-deselect stale accounts
  const visibleAccountIds = useMemo(() => visibleAccounts.map((a) => a.id), [visibleAccounts]);
  useEffect(() => {
    const visibleSet = new Set(visibleAccountIds);
    const stale = store.selectedAdAccountIds.filter((id) => !visibleSet.has(id));
    if (stale.length > 0) {
      store.setSelectedAdAccountIds(store.selectedAdAccountIds.filter((id) => visibleSet.has(id)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleAccountIds.join(",")]);

  const canSelectPresets = store.selectedAdAccountIds.length > 0;

  // ─── Build React Flow nodes ───────────────────────────────────────────────
  const buildNodes = useCallback((): Node[] => {
    const nodes: Node[] = [];

    const pos = (type: keyof typeof COLUMN_X, index: number, id: string): { x: number; y: number } => {
      if (nodePositionsRef.current[id]) return nodePositionsRef.current[id];
      return { x: COLUMN_X[type], y: index * ROW_GAP };
    };

    // Creatives
    store.creativeIds.forEach((assetId, i) => {
      nodes.push({
        id: `creative-${assetId}`,
        type: "creative",
        position: pos("creative", i, `creative-${assetId}`),
        data: { assetId, providerColorMap },
      });
    });

    // Providers (all, not just active)
    sortedByCreation.forEach((provider, i) => {
      nodes.push({
        id: `provider-${provider.id}`,
        type: "provider",
        position: pos("provider", i, `provider-${provider.id}`),
        data: {
          providerId: provider.id,
          name: provider.name,
          color: providerColorMap[provider.id] ?? "#94a3b8",
          onAddRouter: (pId: string) => {
            const router = store.addRouter(pId);
            // Place router between provider and articles
            const provPos = store.nodePositions[`provider-${pId}`] ?? { x: COLUMN_X.provider, y: i * ROW_GAP };
            store.setNodePosition(router.id, { x: COLUMN_X.router, y: provPos.y });
          },
        },
      });
    });

    // Router nodes
    store.routerNodes.forEach((router, i) => {
      nodes.push({
        id: router.id,
        type: "router",
        position: pos("router", i, router.id),
        data: {
          routerId: router.id,
          color: providerColorMap[router.feedProviderId] ?? "#94a3b8",
        },
      });
    });

    // Articles (only visible ones)
    visibleArticles.forEach((article, i) => {
      const color = providerColorMap[article.feedProviderId] ?? "#94a3b8";
      nodes.push({
        id: `article-${article.id}`,
        type: "article",
        position: pos("article", i, `article-${article.id}`),
        data: { article, color },
      });
    });

    // Ad accounts (only visible ones)
    visibleAccounts.forEach((account, i) => {
      const cfg = adAccountConfigs.find((c) => c.id === account.id);
      const color = cfg?.feedProviderIds.length
        ? (providerColorMap[cfg.feedProviderIds[0]] ?? "#94a3b8")
        : "#94a3b8";
      nodes.push({
        id: `account-${account.id}`,
        type: "adaccount",
        position: pos("adaccount", i, `account-${account.id}`),
        data: { accountId: account.id, name: account.name, color },
      });
    });

    // Presets (only visible ones)
    visiblePresets.forEach((preset, i) => {
      const provider = preset.feedProviderId ? sortedByCreation.find((p) => p.id === preset.feedProviderId) : null;
      const color = provider ? (providerColorMap[provider.id] ?? "#94a3b8") : "#94a3b8";
      nodes.push({
        id: `preset-${preset.id}`,
        type: "preset",
        position: pos("preset", i, `preset-${preset.id}`),
        data: { preset, color, articles, disabled: !canSelectPresets },
      });
    });

    return nodes;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    store.creativeIds, store.routerNodes, store.selectedAdAccountIds,
    sortedByCreation, providerColorMap, visibleArticles, visibleAccounts, visiblePresets,
    adAccountConfigs, articles, canSelectPresets,
  ]);

  // ─── Build React Flow edges ───────────────────────────────────────────────
  const buildEdges = useCallback((): Edge[] => {
    const edges: Edge[] = [];

    // Creative → Provider (or Creative → Router if router exists for that provider)
    for (const e of store.edges.creativeToProvider) {
      const router = store.routerNodes.find((r) => r.feedProviderId === e.feedProviderId);
      const target = router ? router.id : `provider-${e.feedProviderId}`;
      edges.push({
        id: `cp-${e.creativeId}-${e.feedProviderId}`,
        source: `creative-${e.creativeId}`,
        sourceHandle: "out",
        target,
        targetHandle: "in",
        type: "provider",
        data: { color: providerColorMap[e.feedProviderId] ?? "#94a3b8" },
      });
    }

    // Router → Provider (router to its provider)
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

    // Article → AdAccount (derived from providerToArticle + selectedAccounts)
    for (const ae of store.edges.providerToArticle) {
      const color = providerColorMap[ae.feedProviderId] ?? "#94a3b8";
      for (const accountId of store.selectedAdAccountIds) {
        const cfg = adAccountConfigs.find((c) => c.id === accountId);
        const matches = !cfg?.feedProviderIds.length || cfg.feedProviderIds.includes(ae.feedProviderId);
        if (!matches) continue;
        const edgeId = `aa-${ae.articleId}-${accountId}`;
        if (!edges.some((ed) => ed.id === edgeId)) {
          edges.push({
            id: edgeId,
            source: `article-${ae.articleId}`,
            sourceHandle: "out",
            target: `account-${accountId}`,
            targetHandle: "in",
            type: "provider",
            data: { color },
          });
        }
      }
    }

    // AdAccount → Preset
    for (const pe of store.edges.articleToPreset) {
      const provEdge = store.edges.providerToArticle.find((e) => e.articleId === pe.articleId);
      const color = provEdge ? (providerColorMap[provEdge.feedProviderId] ?? "#94a3b8") : "#94a3b8";
      const provId = provEdge?.feedProviderId;
      for (const accountId of store.selectedAdAccountIds) {
        const cfg = adAccountConfigs.find((c) => c.id === accountId);
        const matches = !provId || !cfg?.feedProviderIds.length || cfg.feedProviderIds.includes(provId);
        if (!matches) continue;
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
    store.edges, store.routerNodes, store.selectedAdAccountIds,
    providerColorMap, adAccountConfigs,
  ]);

  const [nodes, setNodes] = useNodesState(buildNodes());
  const [edges, setEdges] = useEdgesState(buildEdges());

  // Keep React Flow state in sync with Zustand store
  useEffect(() => { setNodes(buildNodes()); }, [buildNodes, setNodes]);
  useEffect(() => { setEdges(buildEdges()); }, [buildEdges, setEdges]);

  // Sync node position changes back to store
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      for (const change of changes) {
        // Use === false (not !dragging) — React Flow fires dragging: undefined on init,
        // which would write to the store and trigger a rebuild loop.
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

  // Handle new connections drawn by the user
  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target) return;

      const srcType = source.split("-")[0];
      const tgtType = target.split("-")[0];

      if (srcType === "creative" && (tgtType === "provider" || tgtType === "router")) {
        const creativeId = source.replace(/^creative-/, "");
        const providerId = tgtType === "router"
          ? store.routerNodes.find((r) => r.id === target)?.feedProviderId ?? ""
          : target.replace(/^provider-/, "");
        if (providerId) store.toggleCreativeToProvider(creativeId, providerId);
      } else if ((srcType === "provider" || srcType === "router") && tgtType === "article") {
        const providerId = srcType === "router"
          ? store.routerNodes.find((r) => r.id === source)?.feedProviderId ?? ""
          : source.replace(/^provider-/, "");
        const articleId = target.replace(/^article-/, "");
        if (providerId) store.toggleProviderToArticle(providerId, articleId);
      } else if (srcType === "article" && tgtType === "account") {
        // Ad account selection is click-based, not edge-based; but acknowledge the drag
        const accountId = target.replace(/^account-/, "");
        store.toggleAdAccount(accountId);
      } else if (srcType === "account" && tgtType === "preset") {
        // Preset connection is click-based; acknowledge drag
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

  // Handle edge deletion
  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      for (const edge of deletedEdges) {
        const { source, target } = edge;
        const srcType = source.split("-")[0];
        const tgtType = target.split("-")[0];

        if (srcType === "creative" && (tgtType === "provider" || tgtType === "router")) {
          const creativeId = source.replace(/^creative-/, "");
          const providerId = tgtType === "router"
            ? store.routerNodes.find((r) => r.id === target)?.feedProviderId ?? ""
            : target.replace(/^provider-/, "");
          if (providerId) store.toggleCreativeToProvider(creativeId, providerId);
        } else if ((srcType === "provider" || srcType === "router") && tgtType === "article") {
          const providerId = srcType === "router"
            ? store.routerNodes.find((r) => r.id === source)?.feedProviderId ?? ""
            : source.replace(/^provider-/, "");
          const articleId = target.replace(/^article-/, "");
          if (providerId) store.toggleProviderToArticle(providerId, articleId);
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
  const siloAdAccountId = store.selectedAdAccountIds[0] ?? adAccountId ?? "";

  return (
    <div className="flex flex-col h-full">
      <CanvasControls
        onAddCreative={() => setSiloOpen(true)}
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
          fitView
          fitViewOptions={{ padding: 0.2 }}
          deleteKeyCode={["Backspace", "Delete"]}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e7eb" />
          <Controls showInteractive={false} />
          <MiniMap nodeStrokeWidth={3} zoomable pannable />
        </ReactFlow>
      </div>

      {store.creativeIds.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: 52 }}>
          <button
            type="button"
            onClick={() => setSiloOpen(true)}
            className="pointer-events-auto border-2 border-dashed border-gray-200 rounded-xl px-8 py-6 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors bg-white/80 backdrop-blur-sm"
          >
            + Add a Creative to start building
          </button>
        </div>
      )}

      <SiloBrowser
        isOpen={siloOpen}
        onClose={() => setSiloOpen(false)}
        onSelect={(asset) => {
          store.addCreative(asset.id);
          setSiloOpen(false);
        }}
        adAccountId={siloAdAccountId}
      />
    </div>
  );
}
