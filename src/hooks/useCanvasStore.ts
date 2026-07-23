"use client";

import { create } from "zustand";
import type { CanvasEdges, CampaignBuildItem, CreativeGroup, CreativeRow } from "@/types/wizard";
import { loadPresets } from "@/lib/presets";
import { loadAdAccountConfigs } from "@/lib/adAccounts";

// ─── Cascade helpers ──────────────────────────────────────────────────────────

// After removing a providerToArticle edge for one platform, drop only that platform's
// articleToAdAccount/articleToPreset edges for the article — an account's platform comes
// from its AdAccountConfig (defaulting "snap" for legacy/missing records, same convention
// used elsewhere), a preset's platform from its own trafficSource. The other platform's
// wiring for the same article is left untouched.
function orphanArticleForPlatform(
  articleId: string,
  platform: "snap" | "meta",
  articleToAdAccount: CanvasEdges["articleToAdAccount"],
  articleToPreset: CanvasEdges["articleToPreset"]
): { articleToAdAccount: CanvasEdges["articleToAdAccount"]; articleToPreset: CanvasEdges["articleToPreset"] } {
  const adAccountConfigs = loadAdAccountConfigs();
  const presets = loadPresets();
  const accountPlatform = (accountId: string) => adAccountConfigs.find((c) => c.id === accountId)?.platform ?? "snap";
  const presetPlatform = (presetId: string) =>
    presets.find((p) => p.id === presetId)?.trafficSource === "facebook" ? "meta" : "snap";

  const newA2Acc = articleToAdAccount.filter((e) => !(e.articleId === articleId && accountPlatform(e.adAccountId) === platform));
  const newA2P = articleToPreset.filter((e) => !(e.articleId === articleId && presetPlatform(e.presetId) === platform));
  return { articleToAdAccount: newA2Acc, articleToPreset: newA2P };
}

// Remove all providerToArticle edges for a provider (every platform), cascading each
// through orphanArticleForPlatform.
function cascadeProviderRemoval(feedProviderId: string, edges: CanvasEdges): CanvasEdges {
  const removedEdges = edges.providerToArticle.filter((e) => e.feedProviderId === feedProviderId);
  const newP2A = edges.providerToArticle.filter((e) => e.feedProviderId !== feedProviderId);
  const newP2TS = edges.providerToTrafficSource.filter((e) => e.feedProviderId !== feedProviderId);
  let newA2P = edges.articleToPreset;
  let newA2Acc = edges.articleToAdAccount;
  for (const { articleId, platform } of removedEdges) {
    const cascaded = orphanArticleForPlatform(articleId, platform, newA2Acc, newA2P);
    newA2Acc = cascaded.articleToAdAccount;
    newA2P = cascaded.articleToPreset;
  }
  return {
    ...edges,
    providerToArticle: newP2A,
    providerToTrafficSource: newP2TS,
    articleToPreset: newA2P,
    articleToAdAccount: newA2Acc,
  };
}

// After deselecting a traffic source for a provider, drop providerToArticle edges for that
// exact platform, then cascade each through orphanArticleForPlatform. Independent picks mean
// this only ever touches the platform being turned off — the other platform's edges (and
// their downstream wiring) are untouched.
function pruneTrafficSource(
  feedProviderId: string,
  removedTrafficSource: "snap" | "meta",
  edges: CanvasEdges
): CanvasEdges {
  const removedEdges = edges.providerToArticle.filter(
    (e) => e.feedProviderId === feedProviderId && e.platform === removedTrafficSource
  );
  const newP2A = edges.providerToArticle.filter(
    (e) => !(e.feedProviderId === feedProviderId && e.platform === removedTrafficSource)
  );

  let newA2Acc = edges.articleToAdAccount;
  let newA2P = edges.articleToPreset;
  for (const { articleId } of removedEdges) {
    const cascaded = orphanArticleForPlatform(articleId, removedTrafficSource, newA2Acc, newA2P);
    newA2Acc = cascaded.articleToAdAccount;
    newA2P = cascaded.articleToPreset;
  }

  return { ...edges, providerToArticle: newP2A, articleToAdAccount: newA2Acc, articleToPreset: newA2P };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export interface RouterNode {
  id: string;
  feedProviderId: string;
}

const MAX_GROUPS_PER_ROW = 8;
const MAX_CREATIVES_PER_GROUP = 5;

interface CanvasStore {
  creativeRows: CreativeRow[];
  creativeGroups: CreativeGroup[];
  edges: CanvasEdges;
  nodePositions: Record<string, { x: number; y: number }>;
  routerNodes: RouterNode[];

  // Row-level actions
  addRow: () => CreativeRow;
  removeRow: (rowId: string) => void;
  duplicateRow: (rowId: string) => CreativeRow | null;
  addGroupToRow: (rowId: string, assetId: string) => void;
  removeGroupFromRow: (rowId: string, groupId: string) => void;

  // Group-internal actions (used for multi-creative slots within a group)
  addCreativeToGroup: (groupId: string, assetId: string) => void;
  removeCreativeFromGroup: (groupId: string, assetId: string) => void;

  // Row → Provider edges
  connectRowToProvider: (rowId: string, feedProviderId: string) => void;
  disconnectRowFromProvider: (rowId: string, feedProviderId: string) => void;

  toggleProviderTrafficSource: (feedProviderId: string, trafficSource: "snap" | "meta") => void;

  toggleProviderToArticle: (
    feedProviderId: string,
    articleId: string,
    platform: "snap" | "meta",
    defaultHeadline?: string,
    defaultHeadlineRac?: string,
    defaultMetaHeadline?: string,
    defaultMetaPrimaryText?: string
  ) => void;
  setArticleContent: (
    feedProviderId: string,
    articleId: string,
    platform: "snap" | "meta",
    headline: string,
    headlineRac?: string,
    metaHeadline?: string,
    metaPrimaryText?: string
  ) => void;
  toggleArticleToPreset: (articleId: string, presetId: string) => void;
  setDuplications: (articleId: string, presetId: string, count: number) => void;

  toggleArticleToAdAccount: (articleId: string, adAccountId: string) => void;

  setNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  setNodePositions: (positions: Record<string, { x: number; y: number }>) => void;
  addRouter: (feedProviderId: string) => RouterNode;
  removeRouter: (routerId: string) => void;
  reset: () => void;

  expandedArticleIds: Set<string>;
  toggleArticleExpanded: (nodeId: string) => void;

  buildCampaignMatrix: () => CampaignBuildItem[];
}

const initialEdges: CanvasEdges = {
  rowToProvider: [],
  providerToTrafficSource: [],
  providerToArticle: [],
  articleToPreset: [],
  articleToAdAccount: [],
};

// Tiny counter to disambiguate IDs created in the same millisecond
let idCounter = 0;
function freshId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  creativeRows: [],
  creativeGroups: [],
  edges: { ...initialEdges },
  nodePositions: {},
  routerNodes: [],
  expandedArticleIds: new Set<string>(),

  addRow: () => {
    const newRow: CreativeRow = { id: freshId("row"), groupIds: [] };
    set((s) => ({ creativeRows: [...s.creativeRows, newRow] }));
    return newRow;
  },

  removeRow: (rowId) =>
    set((s) => {
      const row = s.creativeRows.find((r) => r.id === rowId);
      const removedGroupIds = new Set(row?.groupIds ?? []);
      const removedProviders = s.edges.rowToProvider
        .filter((e) => e.rowId === rowId)
        .map((e) => e.feedProviderId);
      const newR2P = s.edges.rowToProvider.filter((e) => e.rowId !== rowId);
      let edges: CanvasEdges = { ...s.edges, rowToProvider: newR2P };
      for (const feedProviderId of removedProviders) {
        const stillHasRow = newR2P.some((e) => e.feedProviderId === feedProviderId);
        if (!stillHasRow) edges = cascadeProviderRemoval(feedProviderId, edges);
      }
      return {
        creativeRows: s.creativeRows.filter((r) => r.id !== rowId),
        creativeGroups: s.creativeGroups.filter((g) => !removedGroupIds.has(g.id)),
        edges,
      };
    }),

  duplicateRow: (rowId) => {
    const state = get();
    const row = state.creativeRows.find((r) => r.id === rowId);
    if (!row) return null;
    const newGroups: CreativeGroup[] = [];
    const newGroupIds: string[] = [];
    for (const groupId of row.groupIds) {
      const orig = state.creativeGroups.find((g) => g.id === groupId);
      if (!orig) continue;
      const copy: CreativeGroup = { id: freshId("group"), creativeIds: [...orig.creativeIds] };
      newGroups.push(copy);
      newGroupIds.push(copy.id);
    }
    const newRow: CreativeRow = { id: freshId("row"), groupIds: newGroupIds };
    set((s) => ({
      creativeRows: [...s.creativeRows, newRow],
      creativeGroups: [...s.creativeGroups, ...newGroups],
    }));
    return newRow;
  },

  addGroupToRow: (rowId, assetId) =>
    set((s) => {
      const row = s.creativeRows.find((r) => r.id === rowId);
      if (!row) return {};
      if (row.groupIds.length >= MAX_GROUPS_PER_ROW) return {};
      const newGroup: CreativeGroup = { id: freshId("group"), creativeIds: [assetId] };
      return {
        creativeGroups: [...s.creativeGroups, newGroup],
        // Prepend so the newest group appears leftmost; index 0 = rightmost stays oldest.
        creativeRows: s.creativeRows.map((r) =>
          r.id === rowId ? { ...r, groupIds: [newGroup.id, ...r.groupIds] } : r
        ),
      };
    }),

  removeGroupFromRow: (rowId, groupId) => {
    const state = get();
    const row = state.creativeRows.find((r) => r.id === rowId);
    if (!row) return;
    const remainingGroupIds = row.groupIds.filter((id) => id !== groupId);
    if (remainingGroupIds.length === 0) {
      get().removeRow(rowId);
      return;
    }
    set((s) => {
      const currentRow = s.creativeRows.find((r) => r.id === rowId);
      if (!currentRow) return {};
      const remaining = currentRow.groupIds.filter((id) => id !== groupId);
      return {
        creativeRows: s.creativeRows.map((r) =>
          r.id === rowId ? { ...r, groupIds: remaining } : r
        ),
        creativeGroups: s.creativeGroups.filter((g) => g.id !== groupId),
      };
    });
  },

  addCreativeToGroup: (groupId, assetId) =>
    set((s) => ({
      creativeGroups: s.creativeGroups.map((g) => {
        if (g.id !== groupId) return g;
        if (g.creativeIds.includes(assetId) || g.creativeIds.length >= MAX_CREATIVES_PER_GROUP) return g;
        return { ...g, creativeIds: [...g.creativeIds, assetId] };
      }),
    })),

  removeCreativeFromGroup: (groupId, assetId) => {
    const state = get();
    const group = state.creativeGroups.find((g) => g.id === groupId);
    if (!group) return;
    const remaining = group.creativeIds.filter((id) => id !== assetId);
    if (remaining.length === 0) {
      // Find which row owns this group and remove the group from the row.
      const owningRow = state.creativeRows.find((r) => r.groupIds.includes(groupId));
      if (owningRow) {
        get().removeGroupFromRow(owningRow.id, groupId);
      } else {
        set((s) => ({ creativeGroups: s.creativeGroups.filter((g) => g.id !== groupId) }));
      }
    } else {
      set((s) => ({
        creativeGroups: s.creativeGroups.map((g) =>
          g.id === groupId ? { ...g, creativeIds: remaining } : g
        ),
      }));
    }
  },

  connectRowToProvider: (rowId, feedProviderId) =>
    set((s) => {
      const exists = s.edges.rowToProvider.some(
        (e) => e.rowId === rowId && e.feedProviderId === feedProviderId
      );
      if (exists) return {};
      return {
        edges: {
          ...s.edges,
          rowToProvider: [...s.edges.rowToProvider, { rowId, feedProviderId }],
        },
      };
    }),

  disconnectRowFromProvider: (rowId, feedProviderId) =>
    set((s) => {
      const newR2P = s.edges.rowToProvider.filter(
        (e) => !(e.rowId === rowId && e.feedProviderId === feedProviderId)
      );
      const providerStillConnected = newR2P.some((e) => e.feedProviderId === feedProviderId);
      let edges: CanvasEdges = { ...s.edges, rowToProvider: newR2P };
      if (!providerStillConnected) edges = cascadeProviderRemoval(feedProviderId, edges);
      return { edges };
    }),

  toggleProviderTrafficSource: (feedProviderId, trafficSource) =>
    set((s) => {
      const exists = s.edges.providerToTrafficSource.some(
        (e) => e.feedProviderId === feedProviderId && e.trafficSource === trafficSource
      );
      if (!exists) {
        return {
          edges: {
            ...s.edges,
            providerToTrafficSource: [...s.edges.providerToTrafficSource, { feedProviderId, trafficSource }],
          },
        };
      }
      const newP2TS = s.edges.providerToTrafficSource.filter(
        (e) => !(e.feedProviderId === feedProviderId && e.trafficSource === trafficSource)
      );
      const pruned = pruneTrafficSource(feedProviderId, trafficSource, {
        ...s.edges,
        providerToTrafficSource: newP2TS,
      });
      return { edges: pruned };
    }),

  toggleProviderToArticle: (feedProviderId, articleId, platform, defaultHeadline?, defaultHeadlineRac?, defaultMetaHeadline?, defaultMetaPrimaryText?) =>
    set((s) => {
      const exists = s.edges.providerToArticle.some(
        (e) => e.feedProviderId === feedProviderId && e.articleId === articleId && e.platform === platform
      );
      if (!exists) {
        return {
          edges: {
            ...s.edges,
            providerToArticle: [
              ...s.edges.providerToArticle,
              {
                feedProviderId,
                articleId,
                platform,
                headline: defaultHeadline ?? "",
                headlineRac: defaultHeadlineRac ?? "",
                metaHeadline: defaultMetaHeadline ?? "",
                metaPrimaryText: defaultMetaPrimaryText ?? "",
              },
            ],
          },
        };
      }
      const newP2A = s.edges.providerToArticle.filter(
        (e) => !(e.feedProviderId === feedProviderId && e.articleId === articleId && e.platform === platform)
      );
      const cascaded = orphanArticleForPlatform(articleId, platform, s.edges.articleToAdAccount, s.edges.articleToPreset);
      return {
        edges: {
          ...s.edges,
          providerToArticle: newP2A,
          articleToAdAccount: cascaded.articleToAdAccount,
          articleToPreset: cascaded.articleToPreset,
        },
      };
    }),

  setArticleContent: (feedProviderId, articleId, platform, headline, headlineRac, metaHeadline, metaPrimaryText) =>
    set((s) => ({
      edges: {
        ...s.edges,
        providerToArticle: s.edges.providerToArticle.map((e) =>
          e.feedProviderId === feedProviderId && e.articleId === articleId && e.platform === platform
            ? {
                ...e,
                headline,
                ...(headlineRac !== undefined ? { headlineRac } : {}),
                ...(metaHeadline !== undefined ? { metaHeadline } : {}),
                ...(metaPrimaryText !== undefined ? { metaPrimaryText } : {}),
              }
            : e
        ),
      },
    })),

  toggleArticleToPreset: (articleId, presetId) =>
    set((s) => {
      const exists = s.edges.articleToPreset.some(
        (e) => e.articleId === articleId && e.presetId === presetId
      );
      return {
        edges: {
          ...s.edges,
          articleToPreset: exists
            ? s.edges.articleToPreset.filter(
                (e) => !(e.articleId === articleId && e.presetId === presetId)
              )
            : [...s.edges.articleToPreset, { articleId, presetId, duplications: 1 }],
        },
      };
    }),

  setDuplications: (articleId, presetId, count) =>
    set((s) => ({
      edges: {
        ...s.edges,
        articleToPreset: s.edges.articleToPreset.map((e) =>
          e.articleId === articleId && e.presetId === presetId
            ? { ...e, duplications: Math.max(1, Math.min(10, count)) }
            : e
        ),
      },
    })),

  toggleArticleToAdAccount: (articleId, adAccountId) =>
    set((s) => {
      const exists = s.edges.articleToAdAccount.some(
        (e) => e.articleId === articleId && e.adAccountId === adAccountId
      );
      return {
        edges: {
          ...s.edges,
          articleToAdAccount: exists
            ? s.edges.articleToAdAccount.filter(
                (e) => !(e.articleId === articleId && e.adAccountId === adAccountId)
              )
            : [...s.edges.articleToAdAccount, { articleId, adAccountId }],
        },
      };
    }),

  setNodePosition: (nodeId, position) =>
    set((s) => ({ nodePositions: { ...s.nodePositions, [nodeId]: position } })),

  setNodePositions: (positions) =>
    set((s) => ({ nodePositions: { ...s.nodePositions, ...positions } })),

  addRouter: (feedProviderId) => {
    const newRouter: RouterNode = { id: freshId("router"), feedProviderId };
    set((s) => ({ routerNodes: [...s.routerNodes, newRouter] }));
    return newRouter;
  },

  removeRouter: (routerId) =>
    set((s) => ({ routerNodes: s.routerNodes.filter((r) => r.id !== routerId) })),

  reset: () =>
    set({
      creativeRows: [],
      creativeGroups: [],
      edges: { ...initialEdges },
      nodePositions: {},
      routerNodes: [],
      expandedArticleIds: new Set<string>(),
    }),

  toggleArticleExpanded: (nodeId) =>
    set((s) => {
      const next = new Set(s.expandedArticleIds);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return { expandedArticleIds: next };
    }),

  buildCampaignMatrix: (): CampaignBuildItem[] => {
    const { creativeRows, creativeGroups, edges } = get();
    const presetMap = new Map(loadPresets().map((p) => [p.id, p]));
    const items: CampaignBuildItem[] = [];

    for (const { rowId, feedProviderId } of edges.rowToProvider) {
      const row = creativeRows.find((r) => r.id === rowId);
      if (!row) continue;

      for (const groupId of row.groupIds) {
        const group = creativeGroups.find((g) => g.id === groupId);
        if (!group || group.creativeIds.length === 0) continue;

        const articleEdges = edges.providerToArticle.filter(
          (e) => e.feedProviderId === feedProviderId
        );

        for (const { articleId, platform, headline, headlineRac, metaHeadline, metaPrimaryText } of articleEdges) {
          const presetEdges = edges.articleToPreset.filter((e) => e.articleId === articleId);
          const eligibleAccounts = edges.articleToAdAccount
            .filter((e) => e.articleId === articleId)
            .map((e) => e.adAccountId);

          if (eligibleAccounts.length === 0) continue;

          for (const { presetId, duplications } of presetEdges) {
            const preset = presetMap.get(presetId);
            const presetPlatform = preset?.trafficSource === "facebook" ? "meta" : "snap";
            // Only build items for the platform this article edge was actually picked for —
            // a Snap pick's headline content must never pair with a Meta preset, and vice versa.
            if (presetPlatform !== platform) continue;
            for (const adAccountId of eligibleAccounts) {
              for (let i = 0; i < duplications; i++) {
                items.push({
                  adAccountId,
                  creativeIds: group.creativeIds,
                  feedProviderId,
                  articleId,
                  presetId,
                  duplicationIndex: i,
                  headline,
                  headlineRac: headlineRac ?? "",
                  metaHeadline: metaHeadline ?? "",
                  metaPrimaryText: metaPrimaryText ?? "",
                  trafficSource: preset?.trafficSource ?? "snap",
                });
              }
            }
          }
        }
      }
    }
    return items;
  },
}));
