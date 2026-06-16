"use client";

import { create } from "zustand";
import type { CanvasEdges, CampaignBuildItem, CreativeGroup, CreativeRow } from "@/types/wizard";

// ─── Cascade helpers ──────────────────────────────────────────────────────────

// After removing a providerToArticle edge, drop articleToPreset edges for any
// article that now has zero provider connections.
function orphanArticle(
  articleId: string,
  remainingProviderToArticle: CanvasEdges["providerToArticle"],
  articleToPreset: CanvasEdges["articleToPreset"]
): CanvasEdges["articleToPreset"] {
  const stillConnected = remainingProviderToArticle.some((e) => e.articleId === articleId);
  return stillConnected ? articleToPreset : articleToPreset.filter((e) => e.articleId !== articleId);
}

// Remove all providerToArticle edges for a provider, then cascade to articleToPreset
// and articleToAdAccount for any article that now has zero provider connections.
function cascadeProviderRemoval(feedProviderId: string, edges: CanvasEdges): CanvasEdges {
  const removedEdges = edges.providerToArticle.filter((e) => e.feedProviderId === feedProviderId);
  const newP2A = edges.providerToArticle.filter((e) => e.feedProviderId !== feedProviderId);
  let newA2P = edges.articleToPreset;
  let newA2Acc = edges.articleToAdAccount;
  for (const { articleId } of removedEdges) {
    const stillConnected = newP2A.some((e) => e.articleId === articleId);
    if (!stillConnected) {
      newA2P = newA2P.filter((e) => e.articleId !== articleId);
      newA2Acc = newA2Acc.filter((e) => e.articleId !== articleId);
    }
  }
  return { ...edges, providerToArticle: newP2A, articleToPreset: newA2P, articleToAdAccount: newA2Acc };
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

  toggleProviderToArticle: (feedProviderId: string, articleId: string, defaultHeadline?: string, defaultHeadlineRac?: string) => void;
  setArticleContent: (feedProviderId: string, articleId: string, headline: string, callToAction: string, headlineRac?: string) => void;
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

  toggleProviderToArticle: (feedProviderId, articleId, defaultHeadline?, defaultHeadlineRac?) =>
    set((s) => {
      const exists = s.edges.providerToArticle.some(
        (e) => e.feedProviderId === feedProviderId && e.articleId === articleId
      );
      if (!exists) {
        return {
          edges: {
            ...s.edges,
            providerToArticle: [
              ...s.edges.providerToArticle,
              { feedProviderId, articleId, headline: defaultHeadline ?? "", headlineRac: defaultHeadlineRac ?? "", callToAction: "MORE" },
            ],
          },
        };
      }
      const newP2A = s.edges.providerToArticle.filter(
        (e) => !(e.feedProviderId === feedProviderId && e.articleId === articleId)
      );
      const newA2P = orphanArticle(articleId, newP2A, s.edges.articleToPreset);
      return { edges: { ...s.edges, providerToArticle: newP2A, articleToPreset: newA2P } };
    }),

  setArticleContent: (feedProviderId, articleId, headline, callToAction, headlineRac) =>
    set((s) => ({
      edges: {
        ...s.edges,
        providerToArticle: s.edges.providerToArticle.map((e) =>
          e.feedProviderId === feedProviderId && e.articleId === articleId
            ? { ...e, headline, callToAction, ...(headlineRac !== undefined ? { headlineRac } : {}) }
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

        for (const { articleId, headline, headlineRac, callToAction } of articleEdges) {
          const presetEdges = edges.articleToPreset.filter((e) => e.articleId === articleId);
          const eligibleAccounts = edges.articleToAdAccount
            .filter((e) => e.articleId === articleId)
            .map((e) => e.adAccountId);

          if (eligibleAccounts.length === 0) continue;

          for (const { presetId, duplications } of presetEdges) {
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
                  callToAction,
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
