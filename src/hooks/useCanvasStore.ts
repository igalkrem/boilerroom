"use client";

import { create } from "zustand";
import type { CanvasEdges, CampaignBuildItem, CreativeGroup } from "@/types/wizard";

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

// Remove all providerToArticle edges for a provider, then cascade to articleToPreset.
function cascadeProviderRemoval(feedProviderId: string, edges: CanvasEdges): CanvasEdges {
  const removedEdges = edges.providerToArticle.filter((e) => e.feedProviderId === feedProviderId);
  const newP2A = edges.providerToArticle.filter((e) => e.feedProviderId !== feedProviderId);
  let newA2P = edges.articleToPreset;
  for (const { articleId } of removedEdges) {
    newA2P = orphanArticle(articleId, newP2A, newA2P);
  }
  return { ...edges, providerToArticle: newP2A, articleToPreset: newA2P };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export interface RouterNode {
  id: string;
  feedProviderId: string;
}

interface CanvasStore {
  creativeGroups: CreativeGroup[];
  edges: CanvasEdges;
  nodePositions: Record<string, { x: number; y: number }>;
  routerNodes: RouterNode[];

  addGroup: () => CreativeGroup;
  removeGroup: (groupId: string) => void;
  addCreativeToGroup: (groupId: string, assetId: string) => void;
  removeCreativeFromGroup: (groupId: string, assetId: string) => void;
  toggleGroupToProvider: (groupId: string, feedProviderId: string) => void;

  toggleProviderToArticle: (feedProviderId: string, articleId: string) => void;
  setArticleContent: (feedProviderId: string, articleId: string, headline: string, callToAction: string, headlineRac?: string) => void;
  toggleArticleToPreset: (articleId: string, presetId: string) => void;
  setDuplications: (articleId: string, presetId: string, count: number) => void;

  toggleArticleToAdAccount: (articleId: string, adAccountId: string) => void;

  setNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  setNodePositions: (positions: Record<string, { x: number; y: number }>) => void;
  addRouter: (feedProviderId: string) => RouterNode;
  removeRouter: (routerId: string) => void;
  reset: () => void;

  buildCampaignMatrix: () => CampaignBuildItem[];
}

const initialEdges: CanvasEdges = {
  groupToProvider: [],
  providerToArticle: [],
  articleToPreset: [],
  articleToAdAccount: [],
};

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  creativeGroups: [],
  edges: { ...initialEdges },
  nodePositions: {},
  routerNodes: [],

  addGroup: () => {
    const newGroup: CreativeGroup = { id: `group-${Date.now()}`, creativeIds: [] };
    set((s) => ({ creativeGroups: [...s.creativeGroups, newGroup] }));
    return newGroup;
  },

  removeGroup: (groupId) =>
    set((s) => {
      const removedProviders = s.edges.groupToProvider
        .filter((e) => e.groupId === groupId)
        .map((e) => e.feedProviderId);
      const newG2P = s.edges.groupToProvider.filter((e) => e.groupId !== groupId);
      let edges: CanvasEdges = { ...s.edges, groupToProvider: newG2P };
      for (const feedProviderId of removedProviders) {
        const stillHasGroup = newG2P.some((e) => e.feedProviderId === feedProviderId);
        if (!stillHasGroup) edges = cascadeProviderRemoval(feedProviderId, edges);
      }
      return { creativeGroups: s.creativeGroups.filter((g) => g.id !== groupId), edges };
    }),

  addCreativeToGroup: (groupId, assetId) =>
    set((s) => ({
      creativeGroups: s.creativeGroups.map((g) => {
        if (g.id !== groupId) return g;
        if (g.creativeIds.includes(assetId) || g.creativeIds.length >= 5) return g;
        return { ...g, creativeIds: [...g.creativeIds, assetId] };
      }),
    })),

  removeCreativeFromGroup: (groupId, assetId) => {
    const state = get();
    const group = state.creativeGroups.find((g) => g.id === groupId);
    if (!group) return;
    const remaining = group.creativeIds.filter((id) => id !== assetId);
    if (remaining.length === 0) {
      get().removeGroup(groupId);
    } else {
      set((s) => ({
        creativeGroups: s.creativeGroups.map((g) =>
          g.id === groupId ? { ...g, creativeIds: remaining } : g
        ),
      }));
    }
  },

  toggleGroupToProvider: (groupId, feedProviderId) =>
    set((s) => {
      const exists = s.edges.groupToProvider.some(
        (e) => e.groupId === groupId && e.feedProviderId === feedProviderId
      );
      if (!exists) {
        return {
          edges: {
            ...s.edges,
            groupToProvider: [...s.edges.groupToProvider, { groupId, feedProviderId }],
          },
        };
      }
      const newG2P = s.edges.groupToProvider.filter(
        (e) => !(e.groupId === groupId && e.feedProviderId === feedProviderId)
      );
      const providerStillConnected = newG2P.some((e) => e.feedProviderId === feedProviderId);
      let edges: CanvasEdges = { ...s.edges, groupToProvider: newG2P };
      if (!providerStillConnected) edges = cascadeProviderRemoval(feedProviderId, edges);
      return { edges };
    }),

  toggleProviderToArticle: (feedProviderId, articleId) =>
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
              { feedProviderId, articleId, headline: "", headlineRac: "", callToAction: "" },
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
    const newRouter: RouterNode = { id: `router-${Date.now()}`, feedProviderId };
    set((s) => ({ routerNodes: [...s.routerNodes, newRouter] }));
    return newRouter;
  },

  removeRouter: (routerId) =>
    set((s) => ({ routerNodes: s.routerNodes.filter((r) => r.id !== routerId) })),

  reset: () =>
    set({
      creativeGroups: [],
      edges: { ...initialEdges },
      nodePositions: {},
      routerNodes: [],
    }),

  buildCampaignMatrix: (): CampaignBuildItem[] => {
    const { creativeGroups, edges } = get();
    const items: CampaignBuildItem[] = [];

    for (const { groupId, feedProviderId } of edges.groupToProvider) {
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
    return items;
  },
}));
