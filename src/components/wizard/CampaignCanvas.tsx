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
import { useMetaAdAccounts } from "@/hooks/useMetaAdAccounts";
import type { FeedProvider } from "@/types/feed-provider";
import type { Article } from "@/types/article";
import type { CampaignPreset } from "@/types/preset";
import type { AdAccountConfig } from "@/types/ad-account";

interface CanvasAdAccount {
  id: string;
  name: string;
  platform: "snap" | "meta";
}
import { computeAutoLayout, CanvasControls, ARTICLE_EXPANDED_H, NODE_WIDTH, NODE_HEIGHT, GROUP_CARD_H } from "./CanvasControls";
import { LaneOverlay, type LaneBound } from "./LaneOverlay";
import { CreativeGroupNode, CARD_W, CARD_GAP, DOCK_LEAD, DOCK_W, DOCK_TO_HANDLE } from "./nodes/CreativeGroupNode";
import { ProviderNode } from "./nodes/ProviderNode";
import { TrafficSourceNode } from "./nodes/TrafficSourceNode";
import { RouterNode } from "./nodes/RouterNode";
import { ArticleNode } from "./nodes/ArticleNode";
import { AdAccountNode } from "./nodes/AdAccountNode";
import { PresetNode } from "./nodes/PresetNode";
import { ProviderEdge } from "./edges/ProviderEdge";

const PROVIDER_COLORS = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ec4899", "#f59e0b"] as const;

const NODE_TYPES = {
  group: CreativeGroupNode,
  provider: ProviderNode,
  ts: TrafficSourceNode,
  router: RouterNode,
  article: ArticleNode,
  adaccount: AdAccountNode,
  preset: PresetNode,
};

const EDGE_TYPES = {
  provider: ProviderEdge,
};

const COLUMN_X = { group: 0, provider: 300, ts: 460, router: 640, article: 860, adaccount: 1160, preset: 1440 };

function parseTsNodeId(nodeId: string): { feedProviderId: string; platform: "snap" | "meta" } | null {
  const m = nodeId.match(/^ts-(.+)-(snap|meta)$/);
  return m ? { feedProviderId: m[1], platform: m[2] as "snap" | "meta" } : null;
}
function parseArticleNodeId(nodeId: string): { articleId: string; platform: "snap" | "meta" } | null {
  const m = nodeId.match(/^article-(.+)-(snap|meta)$/);
  return m ? { articleId: m[1], platform: m[2] as "snap" | "meta" } : null;
}
const ROW_GAP = 130;
const ROW_CARD_STEP = 172; // CARD_W (160) + CARD_GAP (12) — used to shift row left when prepending a card

// Shifts each group, in a fixed stacking order, down as a rigid block until it
// clears the previous group's bottom + gutter. Mutates `positions` in place. Used
// both per-provider and, nested inside each provider, per-traffic-source — the
// hard "nodes cannot cross" grid guarantee.
function enforceBands(
  order: string[],
  groups: Record<string, string[]>,
  positions: Record<string, { x: number; y: number }>,
  heightForId: (id: string) => number,
  gutter: number
) {
  let prevBottom: number | null = null;
  for (const key of order) {
    const ids = groups[key];
    if (!ids?.length) continue;
    const top = Math.min(...ids.map((id) => positions[id].y));
    const bottom = Math.max(...ids.map((id) => positions[id].y + heightForId(id)));
    if (prevBottom !== null && top < prevBottom + gutter) {
      const delta: number = prevBottom + gutter - top;
      ids.forEach((id) => { positions[id].y += delta; });
      prevBottom = bottom + delta;
    } else {
      prevBottom = bottom;
    }
  }
}

interface CampaignCanvasProps {
  adAccountId?: string;
  onReview: () => void;
}

export function CampaignCanvas({ onReview }: CampaignCanvasProps) {
  const store = useCanvasStore();
  const [siloOpen, setSiloOpen] = useState(false);
  const [targetRowId, setTargetRowId] = useState<string | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);
  const [articlePicker, setArticlePicker] = useState<{ providerId: string; platform: "snap" | "meta" } | null>(null);
  const [providerPickerRowId, setProviderPickerRowId] = useState<string | null>(null);
  const [providers, setProviders] = useState<FeedProvider[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [presets, setPresets] = useState<CampaignPreset[]>([]);
  const [adAccountConfigs, setAdAccountConfigs] = useState<AdAccountConfig[]>([]);
  const { accounts: snapAccounts } = useAdAccounts();
  const { accounts: metaAccounts } = useMetaAdAccounts();

  const allAccounts: CanvasAdAccount[] = useMemo(() => {
    const snap: CanvasAdAccount[] = snapAccounts.map((a) => ({ id: a.id, name: a.name, platform: "snap" }));
    const meta: CanvasAdAccount[] = metaAccounts.map((a) => ({ id: a.id, name: a.name, platform: "meta" }));
    return [...snap, ...meta];
  }, [snapAccounts, metaAccounts]);

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

  // Presets are enabled once any account is wired to any article
  const canSelectPresets = useMemo(
    () => store.edges.articleToAdAccount.length > 0,
    [store.edges.articleToAdAccount]
  );

  const providerHasTrafficSource = useCallback(
    (providerId: string, ts: "snap" | "meta") =>
      store.edges.providerToTrafficSource.some((e) => e.feedProviderId === providerId && e.trafficSource === ts),
    [store.edges.providerToTrafficSource]
  );

  const visiblePresets = useMemo(() => {
    if (!canSelectPresets) return [];
    const providerOrder = new Map(sortedByCreation.map((p, i) => [p.id, i]));
    return presets
      .filter((p) => {
        const platform = p.trafficSource === "facebook" ? "meta" : "snap";
        // Legacy/unassigned presets (feedProviderId "") used to bypass the platform
        // check entirely — still gate them by platform instead of showing unconditionally.
        if (!p.feedProviderId) {
          return sortedByCreation.some(
            (prov) => activeProviderIdsFromArticles.has(prov.id) && providerHasTrafficSource(prov.id, platform)
          );
        }
        if (!activeProviderIdsFromArticles.has(p.feedProviderId)) return false;
        return providerHasTrafficSource(p.feedProviderId, platform);
      })
      .sort((a, b) => (providerOrder.get(a.feedProviderId ?? "") ?? 999) - (providerOrder.get(b.feedProviderId ?? "") ?? 999));
  }, [presets, activeProviderIdsFromArticles, sortedByCreation, canSelectPresets, providerHasTrafficSource]);
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
    const activeProviders = sortedByCreation.filter((p) => activeProviderIdsFromArticles.has(p.id));
    const metaActiveProviders = activeProviders.filter((p) => providerHasTrafficSource(p.id, "meta"));
    const snapActiveProviderIds = new Set(
      activeProviders.filter((p) => providerHasTrafficSource(p.id, "snap")).map((p) => p.id)
    );
    const metaAllowedIds = new Set(metaActiveProviders.flatMap((p) => p.metaConfig?.allowedAdAccountIds ?? []));
    return allAccounts
      .filter((a) => {
        const cfg = adAccountConfigs.find((c) => c.id === a.id);
        if (cfg?.hidden) return false;
        if (a.platform === "meta") {
          return metaAllowedIds.has(a.id);
        }
        if (cfg && cfg.feedProviderIds.length > 0) {
          return cfg.feedProviderIds.some((pid) => snapActiveProviderIds.has(pid));
        }
        return snapActiveProviderIds.size > 0;
      })
      .sort((a, b) => minProviderIndex(a.id) - minProviderIndex(b.id));
  }, [allAccounts, adAccountConfigs, activeProviderIdsFromArticles, sortedByCreation, providerHasTrafficSource]);

  // ─── Shared node classifiers ──────────────────────────────────────────────────
  // Used by both handleAutoLayout's hard-band enforcement and the LaneOverlay
  // bounding-box memo below, so the two can never disagree about which nodes
  // belong to which provider/platform. Plain functions (not memoized) — cheap,
  // and reading component state directly here matches the rest of this file's
  // existing pattern (e.g. sortedByCreation/adAccountConfigs read directly inside
  // handleAutoLayout without being listed in its deps array).
  const providerIdForNode = (n: Node): string | null => {
    if (n.type === "provider") return (n.data.providerId as string) ?? null;
    if (n.type === "ts") return (n.data.feedProviderId as string) ?? null;
    if (n.type === "router") {
      const r = store.routerNodes.find((rt) => rt.id === n.id);
      return r?.feedProviderId ?? null;
    }
    // Rows are shared trunk content — a single row can fan into multiple providers
    // (connectRowToProvider supports 1+ providers per row), so it isn't owned by
    // any one lane.
    if (n.type === "group") return null;
    if (n.type === "article") {
      const articleId = (n.data.article as Article | undefined)?.id;
      const platform = n.data.platform as "snap" | "meta" | undefined;
      const edge = store.edges.providerToArticle.find((e) => e.articleId === articleId && e.platform === platform);
      return edge?.feedProviderId ?? null;
    }
    if (n.type === "adaccount") {
      const accountId = n.data.accountId as string;
      const cfg = adAccountConfigs.find((c) => c.id === accountId);
      return cfg?.feedProviderIds?.[0] ?? null;
    }
    if (n.type === "preset") {
      const presetId = (n.data.preset as CampaignPreset | undefined)?.id;
      return presets.find((p) => p.id === presetId)?.feedProviderId || null;
    }
    return null;
  };

  // Display-only fallback for laneBounds: a preset/adaccount with no real provider
  // id (feedProviderId "" / feedProviderIds []) is still visible whenever *any*
  // active provider matches its platform (see visiblePresets/visibleAccounts), but
  // providerIdForNode returns null for it, so it would otherwise belong to no lane's
  // bounding box. Pick the first matching active provider deterministically so the
  // node renders inside a real lane instead of floating in the untinted gap between
  // lanes. Never used for actual assignment/editing semantics, only for the overlay.
  const fallbackLaneProviderId = (n: Node): string | null => {
    if (n.type === "preset") {
      const preset = n.data.preset as CampaignPreset | undefined;
      if (!preset || preset.feedProviderId) return null;
      const platform = preset.trafficSource === "facebook" ? "meta" : "snap";
      return (
        sortedByCreation.find(
          (prov) => activeProviderIdsFromArticles.has(prov.id) && providerHasTrafficSource(prov.id, platform)
        )?.id ?? null
      );
    }
    if (n.type === "adaccount") {
      if (n.data.platform === "meta") return null; // metaAllowedIds isn't tied to one provider — no reliable attribution
      const cfg = adAccountConfigs.find((c) => c.id === (n.data.accountId as string));
      if (cfg && cfg.feedProviderIds.length > 0) return null;
      return (
        sortedByCreation.find(
          (prov) => activeProviderIdsFromArticles.has(prov.id) && providerHasTrafficSource(prov.id, "snap")
        )?.id ?? null
      );
    }
    return null;
  };

  const nodeHeightFor = (n: Node, expandedIds: Set<string>): number => {
    if (n.type === "group") return GROUP_CARD_H;
    if (n.type === "router") return 36;
    if (n.type === "article" && expandedIds.has(n.id)) return ARTICLE_EXPANDED_H;
    return NODE_HEIGHT;
  };

  // A node's platform only matters within an already-resolved provider (used to
  // further split a provider's band into Snap/Meta sub-bands). A node that isn't
  // exclusively owned by one platform — the Provider/Router/Row nodes — returns
  // null and is left out of that split, same treatment as rows in providerIdForNode.
  const platformForNode = (n: Node): "snap" | "meta" | null => {
    if (n.type === "ts") return (n.data.platform as "snap" | "meta") ?? null;
    if (n.type === "adaccount") return (n.data.platform as "snap" | "meta") ?? null;
    if (n.type === "preset") {
      const preset = presets.find((p) => p.id === (n.data.preset as CampaignPreset | undefined)?.id);
      return preset ? (preset.trafficSource === "facebook" ? "meta" : "snap") : null;
    }
    if (n.type === "article") {
      // Each article node is a single providerToArticle edge picked for exactly one
      // platform now — data.platform is always set, no more trafficSources inference.
      return (n.data.platform as "snap" | "meta") ?? null;
    }
    return null;
  };

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

      } else if (type === "ts") {
        const parsed = parseTsNodeId(nodeId);
        if (parsed) s.toggleProviderTrafficSource(parsed.feedProviderId, parsed.platform);

      } else if (type === "article") {
        const parsed = parseArticleNodeId(nodeId);
        if (!parsed) return;
        const edge = s.edges.providerToArticle.find(
          (e) => e.articleId === parsed.articleId && e.platform === parsed.platform
        );
        if (edge) s.toggleProviderToArticle(edge.feedProviderId, parsed.articleId, parsed.platform);

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
            selectedTrafficSources: store.edges.providerToTrafficSource
              .filter((e) => e.feedProviderId === provider.id)
              .map((e) => e.trafficSource),
            onDisconnectTarget: makeDisconnectTarget,
            onToggleTrafficSource: store.toggleProviderTrafficSource,
          },
        });
      });
    }

    // Traffic Source nodes — one per (connected provider, active platform); up to
    // two independent sibling nodes per provider, each gating its own article picker.
    if (store.creativeRows.length > 0) {
      let tsIndex = 0;
      sortedByCreation.forEach((provider) => {
        if (!connectedProviderIds.has(provider.id)) return;
        (["snap", "meta"] as const).forEach((platform) => {
          const active = store.edges.providerToTrafficSource.some(
            (e) => e.feedProviderId === provider.id && e.trafficSource === platform
          );
          if (!active) return;
          const nodeId = `ts-${provider.id}-${platform}`;
          nodes.push({
            id: nodeId,
            type: "ts",
            position: pos("ts", tsIndex, nodeId),
            data: {
              feedProviderId: provider.id,
              platform,
              color: providerColorMap[provider.id] ?? "#94a3b8",
              onAddArticle: (providerId: string, tsPlatform: "snap" | "meta") =>
                setArticlePicker({ providerId, platform: tsPlatform }),
              onDisconnectTarget: makeDisconnectTarget,
            },
          });
          tsIndex += 1;
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

    // Articles — one node per providerToArticle edge. Each edge is an independent pick
    // for exactly one platform, so the same article can render as two parallel nodes
    // (one under Snap, one under Meta) rather than a single shared/merged node.
    const articleProviderOrder = new Map(sortedByCreation.map((p, i) => [p.id, i]));
    [...store.edges.providerToArticle]
      .sort((a, b) => (articleProviderOrder.get(a.feedProviderId) ?? 999) - (articleProviderOrder.get(b.feedProviderId) ?? 999))
      .forEach((edge, i) => {
        const article = articles.find((a) => a.id === edge.articleId);
        if (!article) return;
        const nodeId = `article-${edge.articleId}-${edge.platform}`;
        const color = providerColorMap[edge.feedProviderId] ?? "#94a3b8";
        nodes.push({
          id: nodeId,
          type: "article",
          position: pos("article", i, nodeId),
          data: {
            article,
            platform: edge.platform,
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
          platform: account.platform,
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
    store.creativeRows, store.routerNodes, store.edges.providerToTrafficSource, store.edges.providerToArticle, store.toggleProviderTrafficSource,
    sortedByCreation, providerColorMap, connectedProviderIds, visibleAccounts, visiblePresets,
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

    // Provider → TrafficSource (fixed, one per active platform node)
    for (const e of store.edges.providerToTrafficSource) {
      edges.push({
        id: `pts-${e.feedProviderId}-${e.trafficSource}`,
        source: `provider-${e.feedProviderId}`,
        sourceHandle: "out",
        target: `ts-${e.feedProviderId}-${e.trafficSource}`,
        targetHandle: "in",
        type: "provider",
        deletable: false,
        data: { color: providerColorMap[e.feedProviderId] ?? "#94a3b8" },
      });
    }

    // Router → Provider (row-side fan-in declutter only; router no longer feeds articles —
    // with up to two independent platform nodes per provider there's no single ts-node for
    // a shared router to attach to on the article side)
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

    // TrafficSource → Article — one edge per providerToArticle edge, into that edge's own
    // platform-specific article node (each platform's pick is independent, so this never
    // fans two platforms into one shared node anymore).
    for (const e of store.edges.providerToArticle) {
      const isActive = store.edges.providerToTrafficSource.some(
        (p) => p.feedProviderId === e.feedProviderId && p.trafficSource === e.platform
      );
      if (!isActive) continue;
      edges.push({
        id: `pa-${e.feedProviderId}-${e.platform}-${e.articleId}`,
        source: `ts-${e.feedProviderId}-${e.platform}`,
        sourceHandle: "out",
        target: `article-${e.articleId}-${e.platform}`,
        targetHandle: "in",
        type: "provider",
        data: { color: providerColorMap[e.feedProviderId] ?? "#94a3b8" },
      });
    }

    // Article → AdAccount (explicit edges) — source from the article node matching the
    // target account's own platform, so a Snap account only ever wires from the Snap pick.
    for (const e of store.edges.articleToAdAccount) {
      const account = allAccounts.find((a) => a.id === e.adAccountId);
      const provEdge = store.edges.providerToArticle.find(
        (p) => p.articleId === e.articleId && p.platform === account?.platform
      );
      const color = provEdge ? (providerColorMap[provEdge.feedProviderId] ?? "#94a3b8") : "#94a3b8";
      const sourceId = provEdge ? `article-${e.articleId}-${provEdge.platform}` : `article-${e.articleId}`;
      edges.push({
        id: `aa-${e.articleId}-${e.adAccountId}`,
        source: sourceId,
        sourceHandle: "out",
        target: `account-${e.adAccountId}`,
        targetHandle: "in",
        type: "provider",
        data: { color },
      });
    }

    // AdAccount → Preset (derived from articleToAdAccount + articleToPreset). Both edge lists
    // key only by articleId (an article can be picked independently for both platforms under
    // the same articleId), so every join here must also match on the preset's own platform —
    // otherwise a Meta account sharing that articleId gets wired to a Snap preset, and vice versa.
    for (const pe of store.edges.articleToPreset) {
      const preset = presets.find((p) => p.id === pe.presetId);
      const presetPlatform = preset?.trafficSource === "facebook" ? "meta" : "snap";
      const provEdge = store.edges.providerToArticle.find(
        (e) => e.articleId === pe.articleId && e.platform === presetPlatform
      );
      const color = provEdge ? (providerColorMap[provEdge.feedProviderId] ?? "#94a3b8") : "#94a3b8";
      const connectedAccounts = store.edges.articleToAdAccount
        .filter((ae) => ae.articleId === pe.articleId)
        .map((ae) => ae.adAccountId)
        .filter((accountId) => allAccounts.find((a) => a.id === accountId)?.platform === presetPlatform);
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
    providerColorMap, articles, allAccounts, presets,
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
      const s = useCanvasStore.getState();

      if (srcType === "row" && (tgtType === "provider" || tgtType === "router")) {
        const rowId = source.replace(/^row-/, "");
        const providerId = tgtType === "router"
          ? s.routerNodes.find((r) => r.id === target)?.feedProviderId ?? ""
          : target.replace(/^provider-/, "");
        if (providerId) s.connectRowToProvider(rowId, providerId);

      } else if (srcType === "ts" && tgtType === "article") {
        const parsed = parseTsNodeId(source);
        if (!parsed) return;
        const { feedProviderId: providerId, platform } = parsed;
        const parsedTarget = parseArticleNodeId(target);
        const articleId = parsedTarget?.articleId ?? target.replace(/^article-/, "");

        // Auto-insert router when provider already has an article edge and no router yet
        const existingArticleEdges = s.edges.providerToArticle.filter(
          (e) => e.feedProviderId === providerId
        );
        const hasRouter = s.routerNodes.some((r) => r.feedProviderId === providerId);
        if (existingArticleEdges.length >= 1 && !hasRouter) {
          const router = s.addRouter(providerId);
          const provPos = nodePositionsRef.current[`provider-${providerId}`] ?? { x: COLUMN_X.provider, y: 0 };
          s.setNodePosition(router.id, { x: COLUMN_X.router, y: provPos.y });
        }

        const articleForDefault = articles.find((a) => a.id === articleId);
        const dh = articleForDefault?.allowedHeadlines[0];
        s.toggleProviderToArticle(providerId, articleId, platform, dh?.text, dh?.rac, dh?.metaHeadline, dh?.metaPrimaryText);

      } else if (srcType === "article" && tgtType === "account") {
        const parsedSource = parseArticleNodeId(source);
        const articleId = parsedSource?.articleId ?? source.replace(/^article-/, "");
        const accountId = target.replace(/^account-/, "");
        const article = articles.find((a) => a.id === articleId);
        const cfg = adAccountConfigs.find((c) => c.id === accountId);
        if (article && cfg && cfg.feedProviderIds.length > 0 && !cfg.feedProviderIds.includes(article.feedProviderId)) return;
        // Platform gate: the article must actually have been picked for the account's own
        // platform (a real providerToArticle edge), not merely "the article supports it."
        const account = allAccounts.find((a) => a.id === accountId);
        if (account) {
          const hasEdgeForPlatform = s.edges.providerToArticle.some(
            (e) => e.articleId === articleId && e.platform === account.platform
          );
          if (!hasEdgeForPlatform) return;
        }
        s.toggleArticleToAdAccount(articleId, accountId);

      } else if (srcType === "account" && tgtType === "preset") {
        const accountId = source.replace(/^account-/, "");
        const presetId = target.replace(/^preset-/, "");
        const preset = presets.find((p) => p.id === presetId);
        if (preset && canSelectPresets) {
          // Cross-platform block
          const account = allAccounts.find((a) => a.id === accountId);
          const presetPlatform = preset.trafficSource === "facebook" ? "meta" : "snap";
          if (account && account.platform !== presetPlatform) return;

          const accountArticleIds = s.edges.articleToAdAccount
            .filter((ae) => ae.adAccountId === accountId)
            .map((ae) => ae.articleId);
          const matching = accountArticleIds.filter((aId) => {
            const article = articles.find((a) => a.id === aId);
            return article && (!preset.feedProviderId || article.feedProviderId === preset.feedProviderId);
          });
          matching.forEach((aId) => s.toggleArticleToPreset(aId, presetId));
        }
      }
    },
    [presets, articles, adAccountConfigs, canSelectPresets, allAccounts]
  );

  // Handle edge deletion (keyboard Delete/Backspace)
  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      const s = useCanvasStore.getState();
      for (const edge of deletedEdges) {
        const { source, target } = edge;
        const srcType = source.split("-")[0];
        const tgtType = target.split("-")[0];

        if (srcType === "row" && (tgtType === "provider" || tgtType === "router")) {
          const rowId = source.replace(/^row-/, "");
          const providerId = tgtType === "router"
            ? s.routerNodes.find((r) => r.id === target)?.feedProviderId ?? ""
            : target.replace(/^provider-/, "");
          if (providerId) s.disconnectRowFromProvider(rowId, providerId);
        } else if (srcType === "ts" && tgtType === "article") {
          const parsed = parseTsNodeId(source);
          const parsedTarget = parseArticleNodeId(target);
          const articleId = parsedTarget?.articleId ?? target.replace(/^article-/, "");
          if (parsed) s.toggleProviderToArticle(parsed.feedProviderId, articleId, parsed.platform);
        } else if (srcType === "article" && tgtType === "account") {
          const parsedSource = parseArticleNodeId(source);
          const articleId = parsedSource?.articleId ?? source.replace(/^article-/, "");
          const accountId = target.replace(/^account-/, "");
          s.toggleArticleToAdAccount(articleId, accountId);
        } else if (srcType === "account" && tgtType === "preset") {
          // Remove all articleToPreset edges for articles connected to this account-preset pair.
          const accountId = source.replace(/^account-/, "");
          const presetId = target.replace(/^preset-/, "");
          s.edges.articleToAdAccount
            .filter((ae) => ae.adAccountId === accountId)
            .forEach((ae) => {
              if (s.edges.articleToPreset.some((pe) => pe.articleId === ae.articleId && pe.presetId === presetId)) {
                s.toggleArticleToPreset(ae.articleId, presetId);
              }
            });
        }
      }
    },
    []
  );

  // Prevent cross-provider connections at the React Flow drag level.
  const isValidConnection = useCallback(
    (connection: Connection | Edge): boolean => {
      const { source, target } = connection;
      if (!source || !target) return false;
      const srcType = source.split("-")[0];
      const tgtType = target.split("-")[0];

      if (srcType === "article" && tgtType === "account") {
        const gs = useCanvasStore.getState();
        const parsedSource = parseArticleNodeId(source);
        const articleId = parsedSource?.articleId ?? source.replace(/^article-/, "");
        const accountId = target.replace(/^account-/, "");
        const article = articles.find((a) => a.id === articleId);
        if (!article) return false;

        // Platform gate: the article must actually have been picked for the account's own
        // platform (a real providerToArticle edge), not merely "the article supports it."
        const account = allAccounts.find((a) => a.id === accountId);
        if (account) {
          const hasEdgeForPlatform = gs.edges.providerToArticle.some(
            (e) => e.articleId === articleId && e.platform === account.platform
          );
          if (!hasEdgeForPlatform) return false;
        }

        // Static config check
        const cfg = adAccountConfigs.find((c) => c.id === accountId);
        if (cfg && cfg.feedProviderIds.length > 0) {
          return cfg.feedProviderIds.includes(article.feedProviderId);
        }
        // Dynamic fallback: if this account already has articles from a different provider, block
        const existingArticleIds = gs.edges.articleToAdAccount
          .filter((ae) => ae.adAccountId === accountId)
          .map((ae) => ae.articleId);
        if (existingArticleIds.length > 0) {
          const connectedProviders = new Set(
            existingArticleIds.map((id) => articles.find((a) => a.id === id)?.feedProviderId).filter(Boolean)
          );
          return connectedProviders.has(article.feedProviderId);
        }
      }

      if (srcType === "account" && tgtType === "preset") {
        const accountId = source.replace(/^account-/, "");
        const preset = presets.find((p) => p.id === target.replace(/^preset-/, ""));
        if (!preset) return false;

        // Cross-platform block: Meta account ↔ Snap preset (and vice versa)
        const account = allAccounts.find((a) => a.id === accountId);
        if (account) {
          const presetPlatform = preset.trafficSource === "facebook" ? "meta" : "snap";
          if (account.platform !== presetPlatform) return false;
        }

        if (!preset.feedProviderId) return true;
        // Static config check
        const cfg = adAccountConfigs.find((c) => c.id === accountId);
        if (cfg && cfg.feedProviderIds.length > 0) {
          return cfg.feedProviderIds.includes(preset.feedProviderId);
        }
        // Dynamic fallback: check the account's already-connected articles' provider
        const gs = useCanvasStore.getState();
        const existingArticleIds = gs.edges.articleToAdAccount
          .filter((ae) => ae.adAccountId === accountId)
          .map((ae) => ae.articleId);
        if (existingArticleIds.length > 0) {
          const connectedProviders = new Set(
            existingArticleIds.map((id) => articles.find((a) => a.id === id)?.feedProviderId).filter(Boolean)
          );
          return connectedProviders.has(preset.feedProviderId);
        }
      }

      return true;
    },
    [articles, adAccountConfigs, presets, allAccounts]
  );

  // Drop connection on node body (not just on the tiny handle)
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: { isValid: boolean | null; fromNode: { id: string } | null; fromHandle: { type: string; id?: string | null } | null }) => {
      // A handle-to-handle connection was already made — nothing to do
      if (connectionState?.isValid) return;
      // Only intercept drags that started from a source handle
      if (connectionState?.fromHandle?.type !== "source") return;
      const fromNodeId: string | undefined = connectionState?.fromNode?.id;
      if (!fromNodeId) return;

      const clientX =
        "changedTouches" in event
          ? (event as TouchEvent).changedTouches[0]?.clientX
          : (event as MouseEvent).clientX;
      const clientY =
        "changedTouches" in event
          ? (event as TouchEvent).changedTouches[0]?.clientY
          : (event as MouseEvent).clientY;
      if (clientX == null || clientY == null) return;

      // Walk through stacked DOM elements at the drop point looking for a React Flow node
      const els = document.elementsFromPoint(clientX, clientY);
      const nodeEl = els.find((el) =>
        el.classList.contains("react-flow__node")
      ) as HTMLElement | undefined;
      if (!nodeEl) return;

      const targetNodeId = nodeEl.dataset.id;
      if (!targetNodeId || targetNodeId === fromNodeId) return;

      const connection: Connection = {
        source: fromNodeId,
        sourceHandle: connectionState?.fromHandle?.id ?? "out",
        target: targetNodeId,
        targetHandle: "in",
      };

      if (isValidConnection(connection)) {
        onConnect(connection);
      }
    },
    [onConnect, isValidConnection]
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

    // Compute dynamic column X positions based on the widest row node currently in the canvas.
    // This ensures provider nodes (and all downstream columns) always appear to the right of
    // the side dock, regardless of how many card slots the widest row has.
    const { creativeRows, expandedArticleIds } = useCanvasStore.getState();
    // P = rightmost row handle position + gap. Must use actual stored x (which shifts left
    // on every card prepend) rather than raw nodeWidth, otherwise P grows ~576px for a 4-slot row.
    const maxRowHandleX = creativeRows.reduce((mx, r) => {
      const slots = Math.max(1, r.groupIds.length);
      const nw = slots * CARD_W + Math.max(0, slots - 1) * CARD_GAP + DOCK_LEAD + DOCK_W + DOCK_TO_HANDLE;
      const sx = nodePositionsRef.current[`row-${r.id}`]?.x ?? 0;
      return Math.max(mx, sx + nw);
    }, 0);
    const P = maxRowHandleX + 120;
    const dynColX = { group: 0, provider: P, ts: P + 340, router: P + 540, article: P + 780, adaccount: P + 1100, preset: P + 1400 };

    // Build stable tiebreaker priorities so nodes from provider[0] always sort above provider[1].
    // Without this, routers and sibling providers land in the same dagre rank with identical
    // avgUpstreamY, making the sort non-deterministic and flipping the whole right-side cascade.
    const s = useCanvasStore.getState();
    const providerIndexById = new Map(sortedByCreation.map((p, i) => [p.id, i]));
    const nodePriority: Record<string, number> = {};
    sortedByCreation.forEach((provider, i) => {
      nodePriority[`provider-${provider.id}`] = i;
      nodePriority[`ts-${provider.id}-snap`] = i;
      nodePriority[`ts-${provider.id}-meta`] = i;
      const router = s.routerNodes.find((r) => r.feedProviderId === provider.id);
      if (router) nodePriority[router.id] = i;
      s.edges.providerToArticle
        .filter((e) => e.feedProviderId === provider.id)
        .forEach((e) => {
          const key = `article-${e.articleId}-${e.platform}`;
          nodePriority[key] = Math.min(nodePriority[key] ?? 999, i);
        });
      s.edges.articleToAdAccount
        .filter((ae) => s.edges.providerToArticle.some((pe) => pe.articleId === ae.articleId && pe.feedProviderId === provider.id))
        .forEach((ae) => { nodePriority[`account-${ae.adAccountId}`] = Math.min(nodePriority[`account-${ae.adAccountId}`] ?? 999, i); });
      s.edges.articleToPreset
        .filter((ape) => s.edges.providerToArticle.some((pe) => pe.articleId === ape.articleId && pe.feedProviderId === provider.id))
        .forEach((ape) => { nodePriority[`preset-${ape.presetId}`] = Math.min(nodePriority[`preset-${ape.presetId}`] ?? 999, i); });
    });
    // Fallback: every account/preset gets a provider-ordered priority even before it's
    // connected (config-derived, not edge-derived), so disconnected reference cards for
    // one provider never sort/drift into another provider's vertical range.
    for (const cfg of adAccountConfigs) {
      if (nodePriority[`account-${cfg.id}`] !== undefined || cfg.feedProviderIds.length === 0) continue;
      const idx = Math.min(...cfg.feedProviderIds.map((pid) => providerIndexById.get(pid) ?? 999));
      if (idx !== 999) nodePriority[`account-${cfg.id}`] = idx;
    }
    for (const preset of presets) {
      if (nodePriority[`preset-${preset.id}`] !== undefined || !preset.feedProviderId) continue;
      const idx = providerIndexById.get(preset.feedProviderId);
      if (idx !== undefined) nodePriority[`preset-${preset.id}`] = idx;
    }

    const positions = computeAutoLayout(connectedNodes, currentEdges, nodePriority, expandedArticleIds);

    // Override dagre x: use dynColX for all non-row nodes; for row nodes restore
    // the stored x so card-prepend shifts are never clobbered by dagre.
    for (const n of connectedNodes) {
      if (!positions[n.id] || !n.type) continue;
      if (n.type === "group") {
        const storedX = nodePositionsRef.current[n.id]?.x;
        if (storedX !== undefined) positions[n.id].x = storedX;
      } else {
        const colX = dynColX[n.type as keyof typeof dynColX];
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
          positions[n.id] = { x: dynColX.provider, y: anchorY + (i - anchorIdx) * ROW_GAP };
        }
      });
    }

    const heightForId = (id: string) => {
      const n = currentNodes.find((nd) => nd.id === id);
      return n ? nodeHeightFor(n, expandedArticleIds) : NODE_HEIGHT;
    };
    // An orphan is a visible-but-not-yet-wired account/preset (no edge at all, so it's
    // absent from connectedIds). Only these two types can be orphaned — every other
    // type is either always-edge-backed (ts/article/router) or has no single owner
    // (group) and is unaffected.
    const isOrphan = (id: string): boolean => {
      const n = currentNodes.find((nd) => nd.id === id);
      return (n?.type === "adaccount" || n?.type === "preset") && !connectedIds.has(id);
    };
    const platformRank = (id: string): number => {
      const n = currentNodes.find((nd) => nd.id === id);
      const p = n ? platformForNode(n) : null;
      return p === "snap" ? 0 : p === "meta" ? 1 : 0.5;
    };
    // Height-aware minimum gap between two vertically-adjacent nodes in the same
    // column. An orphan following a connected sibling gets an extra section gap so
    // it visually reads as a distinct "Unassigned" strip rather than blending into
    // the connected list (LaneOverlay draws the divider/label at that same seam).
    const nodeMinGap = (prevId: string, curId: string): number => {
      const n = currentNodes.find((nd) => nd.id === prevId);
      const base =
        n?.type === "article" && expandedArticleIds.has(prevId)
          ? ARTICLE_EXPANDED_H + 20
          : n?.type === "group"
            ? 285 + 20 // GROUP_CARD_H + gap
            : ROW_GAP;
      return isOrphan(curId) && !isOrphan(prevId) ? base + 30 : base;
    };
    // Sort a node-type column by (provider creation order, platform, connected-before-
    // orphan, y) and push each node down to clear the previous one + the min gap.
    // Guarantees: an earlier-created provider's nodes always sit above a later one's;
    // within a provider, Snap always sits above Meta; within a provider+platform,
    // connected nodes always sort above not-yet-wired ones.
    const resolveColumnCollisions = (nodeIds: string[]) => {
      if (nodeIds.length <= 1) return;
      nodeIds.sort((a, b) => {
        const pa = nodePriority[a] ?? 999;
        const pb = nodePriority[b] ?? 999;
        if (pa !== pb) return pa - pb;
        const ra = platformRank(a);
        const rb = platformRank(b);
        if (ra !== rb) return ra - rb;
        const oa = isOrphan(a) ? 1 : 0;
        const ob = isOrphan(b) ? 1 : 0;
        if (oa !== ob) return oa - ob;
        return positions[a].y - positions[b].y;
      });
      for (let i = 1; i < nodeIds.length; i++) {
        const minY = positions[nodeIds[i - 1]].y + nodeMinGap(nodeIds[i - 1], nodeIds[i]);
        if (positions[nodeIds[i]].y < minY) positions[nodeIds[i]].y = minY;
      }
    };

    const byTypeIds: Record<string, string[]> = {};
    for (const n of currentNodes) {
      if (!positions[n.id] || !n.type) continue;
      if (!byTypeIds[n.type]) byTypeIds[n.type] = [];
      byTypeIds[n.type].push(n.id);
    }
    // Base/leaf pass: every column gets a collision-free y, sorted per the guarantees
    // above. Presets have no children to center on, so this is their final position.
    for (const nodeIds of Object.values(byTypeIds)) resolveColumnCollisions(nodeIds);

    // Center-anchored refinement (Option A2): walk columns from the leaves back
    // toward the provider column, using the actual rendered edges (`currentEdges`) to
    // find each node's children. A node with ≥1 positioned child re-centers on the
    // midpoint of those children's y instead of keeping its sort-derived y — a lone
    // child stays aligned with its parent, and a branch's position is now entirely
    // derived from its own children, so connecting/disconnecting only ever moves that
    // branch. A node with no children (nothing to center on yet, e.g. a freshly-toggled
    // traffic source with no articles picked) keeps its existing position rather than
    // collapsing to 0 — dagre/the base pass above already gave it a sane y, EXCEPT for
    // `article`: a childless article (nothing wired to it yet) instead aligns with its
    // own `ts` parent's y — otherwise it keeps dagre's raw pre-refinement guess, which
    // has no relationship to which platform's row it actually belongs to (this was the
    // bug: a lone Meta article rendering at the Snap row's height). Each column is
    // re-resolved for collisions after centering, since it can reintroduce overlap.
    const childrenMap: Record<string, string[]> = {};
    for (const e of currentEdges) (childrenMap[e.source] ??= []).push(e.target);
    for (const colType of ["adaccount", "article", "ts", "provider"] as const) {
      const ids = byTypeIds[colType];
      if (!ids?.length) continue;
      for (const id of ids) {
        const kids = (childrenMap[id] ?? []).filter((k) => positions[k]);
        if (kids.length) {
          const centers = kids.map((k) => positions[k].y + heightForId(k) / 2);
          const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
          positions[id].y = avg - heightForId(id) / 2;
        } else if (colType === "article") {
          const parentId = currentEdges.find((e) => e.target === id)?.source;
          if (parentId && positions[parentId]) {
            positions[id].y = positions[parentId].y + heightForId(parentId) / 2 - heightForId(id) / 2;
          }
        }
      }
      resolveColumnCollisions(ids);
    }

    // Accounts/presets with no position yet are orphans (no edges at all — see isOrphan
    // above). Seeded here, AFTER the center-anchored refinement above has finalized
    // ts/article positions — seeding any earlier would anchor to dagre's raw, pre-
    // refinement guess, which can land far from where ts/article actually end up
    // rendering (this was the bug: orphans floating near the top of the canvas instead
    // of alongside their own provider's flow). Anchor each orphan to the average y of
    // its own provider+platform's connected article node(s) — "in front of" that
    // platform's article(s) — falling back to that platform's ts row, then to the
    // global article midpoint if neither exists yet. Grouped by (type, provider,
    // platform) so a lone Snap orphan lands near the Snap article(s) and a lone Meta
    // orphan near the Meta article(s), never both hovering around one shared midpoint
    // that happens to sit closer to one platform than the other.
    const articleYs = currentNodes
      .filter((n) => n.type === "article" && positions[n.id])
      .map((n) => positions[n.id]!.y);
    const articleMidY = articleYs.length
      ? (Math.min(...articleYs) + Math.max(...articleYs)) / 2
      : 0;
    const anchorYFor = (n: Node): number => {
      const pid = providerIdForNode(n) ?? fallbackLaneProviderId(n);
      const platform = platformForNode(n);
      if (pid && platform) {
        const articleCenters = (byTypeIds.article ?? [])
          .filter((aid) => {
            const an = currentNodes.find((nd) => nd.id === aid);
            return an && (an.data.platform as "snap" | "meta" | undefined) === platform && providerIdForNode(an) === pid;
          })
          .map((aid) => positions[aid].y + heightForId(aid) / 2);
        if (articleCenters.length) {
          return articleCenters.reduce((a, b) => a + b, 0) / articleCenters.length;
        }
        const tsY = positions[`ts-${pid}-${platform}`]?.y;
        if (tsY !== undefined) return tsY + NODE_HEIGHT / 2;
      }
      return articleMidY;
    };
    const orphanGroupKey = (n: Node): string =>
      `${n.type}|${providerIdForNode(n) ?? fallbackLaneProviderId(n) ?? ""}|${platformForNode(n) ?? ""}`;
    const typeCounters: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    for (const n of currentNodes) {
      if (positions[n.id] || n.type === "provider" || !n.type) continue;
      const key = orphanGroupKey(n);
      typeCounts[key] = (typeCounts[key] ?? 0) + 1;
    }
    const seededOrphanIds: Record<string, string[]> = {};
    for (const n of currentNodes) {
      if (positions[n.id] || n.type === "provider" || !n.type) continue;
      const colX = dynColX[n.type as keyof typeof dynColX];
      if (colX === undefined) continue;
      const key = orphanGroupKey(n);
      const idx = typeCounters[key] ?? 0;
      typeCounters[key] = idx + 1;
      const count = typeCounts[key];
      const anchorY = anchorYFor(n) - NODE_HEIGHT / 2;
      positions[n.id] = { x: colX, y: anchorY + (idx - (count - 1) / 2) * ROW_GAP };
      (seededOrphanIds[n.type] ??= []).push(n.id);
    }
    // Merge freshly-seeded orphans back into their column and re-resolve collisions, so
    // they never overlap the now-final connected content in the same column.
    for (const type of ["adaccount", "preset"] as const) {
      if (!seededOrphanIds[type]?.length) continue;
      resolveColumnCollisions([...(byTypeIds[type] ?? []), ...seededOrphanIds[type]]);
    }

    // Per-provider Snap/Meta band separation: the sort tiebreaker above only guarantees
    // Snap-tagged ids sort before Meta-tagged ones *within the same column* — it doesn't
    // guarantee the two platforms' combined vertical ranges stay non-overlapping across
    // the article/adaccount/preset columns *together*. An orphan account seeded in the
    // adaccount column (from the pass above) and a childless article positioned in a
    // different column (from the centering refinement above) have no cross-column check
    // between them, so a Snap node could still land at the same height as a Meta one.
    // Reinstates the old per-column "Pass B" band shift, generalized to span all three
    // columns via the same generic `enforceBands` helper used for provider separation.
    const byProviderPlatformIds: Record<string, { snap: string[]; meta: string[] }> = {};
    for (const n of currentNodes) {
      if (!positions[n.id]) continue;
      if (n.type !== "article" && n.type !== "adaccount" && n.type !== "preset") continue;
      const platform = platformForNode(n);
      if (platform !== "snap" && platform !== "meta") continue;
      const pid = providerIdForNode(n) ?? fallbackLaneProviderId(n);
      if (!pid) continue;
      (byProviderPlatformIds[pid] ??= { snap: [], meta: [] })[platform].push(n.id);
    }
    for (const ids of Object.values(byProviderPlatformIds)) {
      enforceBands(["snap", "meta"], ids, positions, heightForId, 60);
    }

    const byProviderNodeIds: Record<string, string[]> = {};
    for (const n of currentNodes) {
      if (!positions[n.id]) continue;
      const pid = providerIdForNode(n);
      if (pid) (byProviderNodeIds[pid] ??= []).push(n.id);
    }

    // Hard, non-overlapping vertical band per provider (creation order), run last on
    // the now-finalized (post-centering) positions. Per-node collisions are already
    // guaranteed by resolveColumnCollisions above — this pass exists so LaneOverlay's
    // band *rectangles* (which span every column for a provider) never visually
    // overlap, even if one provider's tallest column extends past another's shortest.
    enforceBands(sortedByCreation.map((p) => p.id), byProviderNodeIds, positions, heightForId, 100);

    useCanvasStore.getState().setNodePositions(positions);
    nodePositionsRef.current = { ...nodePositionsRef.current, ...positions };
    setNodes((prev) => prev.map((n) => positions[n.id] ? { ...n, position: positions[n.id] } : n));
  }, [buildNodes, buildEdges, setNodes]);

  useEffect(() => { handleAutoLayout(); }, [handleAutoLayout]);

  // Re-run layout whenever an article is expanded or collapsed so dagre
  // can allocate the correct vertical space for the new node height.
  const expandedArticleIds = useCanvasStore((s) => s.expandedArticleIds);
  useEffect(() => { handleAutoLayout(); }, [expandedArticleIds, handleAutoLayout]);

  // Per-provider lane bounding boxes, derived from the already-laid-out `nodes` state —
  // purely decorative (LaneOverlay renders outside the nodes array, never touching fitView).
  const laneBounds = useMemo((): LaneBound[] => {
    // Global x-range across every node currently on the canvas — every lane's band
    // (and, by extension, the divider between them) spans this same full width,
    // regardless of how far right THIS specific provider's own content currently
    // reaches. Without this, a provider missing content in a later column (e.g. no
    // accounts/presets picked yet) got a band that stopped short of the full flow,
    // so the divider between two providers looked like it only ran partway across.
    // Row/creative (`group`) nodes are excluded, same as providerIdForNode's
    // `group → null` — they're shared trunk content owned by no single lane, and
    // (being the leftmost column at x:0) would otherwise drag every lane's band out
    // to visually stretch behind the creative cards.
    let globalMinX = Infinity;
    let globalMaxX = -Infinity;
    for (const n of nodes) {
      if (n.type === "group") continue;
      const left = n.position.x;
      const right = left + NODE_WIDTH;
      globalMinX = Math.min(globalMinX, left);
      globalMaxX = Math.max(globalMaxX, right);
    }

    const byProvider: Record<string, { minY: number; maxY: number }> = {};
    // Per-lane, per-column, per-platform (adaccount/preset × snap/meta) tracking of the
    // seam between connected nodes and not-yet-wired ("orphan") ones — feeds the
    // "Unassigned" divider drawn by LaneOverlay. Keyed by platform (not just lane+column)
    // so a Snap unassigned strip and a Meta unassigned strip are two separate dividers,
    // each sitting under that platform's own connected content rather than one divider
    // shared across both. Connectedness mirrors AdAccountNode's/PresetNode's own local
    // check (edge-based), not handleAutoLayout's connectedIds (not available here).
    const byLaneColOrphan: Record<string, Record<string, Record<string, { connectedMaxY: number; orphanMinY: number }>>> = {};
    for (const n of nodes) {
      const pid = providerIdForNode(n) ?? fallbackLaneProviderId(n);
      if (!pid) continue;
      const top = n.position.y;
      const bottom = top + nodeHeightFor(n, expandedArticleIds);
      if (!byProvider[pid]) byProvider[pid] = { minY: top, maxY: bottom };
      else {
        const b = byProvider[pid];
        b.minY = Math.min(b.minY, top);
        b.maxY = Math.max(b.maxY, bottom);
      }
      if (n.type !== "adaccount" && n.type !== "preset") continue;
      const platform = platformForNode(n);
      if (!platform) continue;
      const isConnected =
        n.type === "adaccount"
          ? store.edges.articleToAdAccount.some((e) => e.adAccountId === (n.data.accountId as string))
          : store.edges.articleToPreset.some((e) => e.presetId === (n.data.preset as CampaignPreset | undefined)?.id);
      const laneEntry = (byLaneColOrphan[pid] ??= {});
      const colEntry = (laneEntry[n.type] ??= {});
      const platEntry = (colEntry[platform] ??= { connectedMaxY: -Infinity, orphanMinY: Infinity });
      if (isConnected) platEntry.connectedMaxY = Math.max(platEntry.connectedMaxY, bottom);
      else platEntry.orphanMinY = Math.min(platEntry.orphanMinY, top);
    }

    return sortedByCreation
      .filter((p) => byProvider[p.id])
      .map((p) => {
        const providerNode = nodes.find((n) => n.type === "provider" && n.data.providerId === p.id);
        const tsCenters = (["snap", "meta"] as const)
          .map((platform) => nodes.find((n) => n.id === `ts-${p.id}-${platform}`))
          .filter((n): n is Node => !!n)
          .map((n) => ({ x: n.position.x + NODE_WIDTH / 2, y: n.position.y + NODE_HEIGHT / 2 }));
        const orphanDividers = (["adaccount", "preset"] as const)
          .flatMap((col) =>
            (["snap", "meta"] as const).map((platform) => {
              const entry = byLaneColOrphan[p.id]?.[col]?.[platform];
              if (!entry || entry.connectedMaxY === -Infinity || entry.orphanMinY === Infinity) return null;
              const colNode = nodes.find((n) => n.type === col);
              if (!colNode) return null;
              return {
                col,
                platform,
                y: (entry.connectedMaxY + entry.orphanMinY) / 2,
                xLeft: colNode.position.x,
                xRight: colNode.position.x + NODE_WIDTH,
              };
            })
          )
          .filter(
            (d): d is { col: "adaccount" | "preset"; platform: "snap" | "meta"; y: number; xLeft: number; xRight: number } =>
              d !== null
          );
        return {
          providerId: p.id,
          name: p.name,
          color: providerColorMap[p.id] ?? "#94a3b8",
          minX: globalMinX,
          maxX: globalMaxX,
          ...byProvider[p.id],
          providerRightX: providerNode ? providerNode.position.x + NODE_WIDTH : undefined,
          tsCenters: tsCenters.length === 2 ? tsCenters : undefined,
          orphanDividers: orphanDividers.length ? orphanDividers : undefined,
        };
      });
  }, [nodes, expandedArticleIds, store.routerNodes, store.edges.providerToArticle, store.edges.articleToAdAccount, store.edges.articleToPreset, adAccountConfigs, presets, sortedByCreation, providerColorMap]);

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
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          onEdgesDelete={onEdgesDelete}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          colorMode="dark"
          style={{ background: "#1f2937" }}
          nodesDraggable={false}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1.0 }}
          deleteKeyCode={["Backspace", "Delete"]}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#374151" />
          <LaneOverlay lanes={laneBounds} />
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
      {articlePicker &&
        (() => {
          const { providerId, platform } = articlePicker;
          const providerArticles = articles.filter(
            (a) =>
              a.feedProviderId === providerId &&
              a.status !== "paused" &&
              a.trafficSources.some((t) => (t === "Meta" ? "meta" : "snap") === platform)
          );
          const selectedIds = new Set(
            store.edges.providerToArticle
              .filter((e) => e.feedProviderId === providerId && e.platform === platform)
              .map((e) => e.articleId)
          );
          const providerName = providers.find((p) => p.id === providerId)?.name ?? "";
          const platformLabel = platform === "meta" ? "Meta" : "Snap";
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
              onClick={() => setArticlePicker(null)}
            >
              <div
                className="bg-gray-900 border border-gray-700 rounded-2xl p-4 w-80 max-h-[70vh] flex flex-col shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-200">
                    Articles — {providerName} ({platformLabel})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setArticlePicker(null)}
                    className="text-gray-500 hover:text-gray-300 text-lg leading-none"
                  >
                    ✕
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 space-y-1">
                  {providerArticles.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-4">
                      No {platformLabel} articles for this provider
                    </p>
                  ) : (
                    providerArticles.map((article) => {
                      const isSelected = selectedIds.has(article.id);
                      const dh = article.allowedHeadlines[0];
                      return (
                        <button
                          key={article.id}
                          type="button"
                          onClick={() =>
                            store.toggleProviderToArticle(
                              providerId,
                              article.id,
                              platform,
                              dh?.text,
                              dh?.rac,
                              dh?.metaHeadline,
                              dh?.metaPrimaryText
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
                  onClick={() => setArticlePicker(null)}
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
