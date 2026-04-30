"use client";

import { create } from "zustand";
import type { CanvasEdges, CampaignBuildItem } from "@/types/wizard";
import { loadAdAccountConfigs } from "@/lib/adAccounts";

// ─── Cascade helpers ──────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], n: number): T[][] {
  if (n <= 0 || arr.length === 0) return arr.length > 0 ? [arr] : [];
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += n) chunks.push(arr.slice(i, i + n));
  return chunks;
}

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
// for any article that becomes orphaned.
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

interface CanvasStore {
  creativeIds: string[];
  edges: CanvasEdges;
  selectedAdAccountIds: string[];
  presetCreativesPerAdSet: Record<string, number>;

  addCreative: (id: string) => void;
  removeCreative: (id: string) => void;
  toggleCreativeToProvider: (creativeId: string, feedProviderId: string) => void;
  toggleProviderToArticle: (feedProviderId: string, articleId: string) => void;
  setArticleContent: (feedProviderId: string, articleId: string, headline: string, callToAction: string, headlineRac?: string) => void;
  toggleArticleToPreset: (articleId: string, presetId: string) => void;
  setDuplications: (articleId: string, presetId: string, count: number) => void;
  setPresetCreativesPerAdSet: (presetId: string, count: number) => void;
  toggleAdAccount: (id: string) => void;
  setSelectedAdAccountIds: (ids: string[]) => void;
  reset: () => void;

  buildCampaignMatrix: () => CampaignBuildItem[];
}

const initialEdges: CanvasEdges = {
  creativeToProvider: [],
  providerToArticle: [],
  articleToPreset: [],
};

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  creativeIds: [],
  edges: { ...initialEdges },
  selectedAdAccountIds: [],
  presetCreativesPerAdSet: {},

  addCreative: (id) =>
    set((s) => ({ creativeIds: s.creativeIds.includes(id) ? s.creativeIds : [...s.creativeIds, id] })),

  removeCreative: (id) =>
    set((s) => {
      const newC2P = s.edges.creativeToProvider.filter((e) => e.creativeId !== id);
      // For each provider that lost this creative, cascade if now empty
      const removedProviders = s.edges.creativeToProvider
        .filter((e) => e.creativeId === id)
        .map((e) => e.feedProviderId);
      let edges: CanvasEdges = { ...s.edges, creativeToProvider: newC2P };
      for (const feedProviderId of removedProviders) {
        const stillHasCreative = newC2P.some((e) => e.feedProviderId === feedProviderId);
        if (!stillHasCreative) edges = cascadeProviderRemoval(feedProviderId, edges);
      }
      return { creativeIds: s.creativeIds.filter((c) => c !== id), edges };
    }),

  toggleCreativeToProvider: (creativeId, feedProviderId) =>
    set((s) => {
      const exists = s.edges.creativeToProvider.some(
        (e) => e.creativeId === creativeId && e.feedProviderId === feedProviderId
      );
      if (!exists) {
        return {
          edges: {
            ...s.edges,
            creativeToProvider: [...s.edges.creativeToProvider, { creativeId, feedProviderId }],
          },
        };
      }
      // Removing: cascade if provider loses all creative connections
      const newC2P = s.edges.creativeToProvider.filter(
        (e) => !(e.creativeId === creativeId && e.feedProviderId === feedProviderId)
      );
      const providerStillConnected = newC2P.some((e) => e.feedProviderId === feedProviderId);
      let edges: CanvasEdges = { ...s.edges, creativeToProvider: newC2P };
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
      // Removing: cascade if article loses all provider connections
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

  setPresetCreativesPerAdSet: (presetId, count) =>
    set((s) => ({
      presetCreativesPerAdSet: {
        ...s.presetCreativesPerAdSet,
        [presetId]: Math.max(1, Math.min(10, count)),
      },
    })),

  toggleAdAccount: (id) =>
    set((s) => ({
      selectedAdAccountIds: s.selectedAdAccountIds.includes(id)
        ? s.selectedAdAccountIds.filter((a) => a !== id)
        : [...s.selectedAdAccountIds, id],
    })),

  setSelectedAdAccountIds: (ids) => set({ selectedAdAccountIds: ids }),

  reset: () =>
    set({ creativeIds: [], edges: { ...initialEdges }, selectedAdAccountIds: [], presetCreativesPerAdSet: {} }),

  buildCampaignMatrix: (): CampaignBuildItem[] => {
    const { creativeIds, edges, selectedAdAccountIds, presetCreativesPerAdSet } = get();
    if (selectedAdAccountIds.length === 0) return [];
    const adAccountConfigs = loadAdAccountConfigs();
    const items: CampaignBuildItem[] = [];

    // Follow wizard flow: provider → article → preset (creatives grouped per provider)
    const uniqueProviderIds = [...new Set(edges.providerToArticle.map((e) => e.feedProviderId))];

    for (const feedProviderId of uniqueProviderIds) {
      // Creatives connected to this provider
      const providerCreatives = creativeIds.filter((cId) =>
        edges.creativeToProvider.some((e) => e.creativeId === cId && e.feedProviderId === feedProviderId)
      );
      if (providerCreatives.length === 0) continue;

      const articleEdges = edges.providerToArticle.filter((e) => e.feedProviderId === feedProviderId);

      for (const { articleId, headline, headlineRac, callToAction } of articleEdges) {
        const presetEdges = edges.articleToPreset.filter((e) => e.articleId === articleId);

        for (const { presetId, duplications } of presetEdges) {
          const n = presetCreativesPerAdSet[presetId] ?? 1;
          const chunks = chunkArray(providerCreatives, n);

          const eligibleAccounts = selectedAdAccountIds.filter((adAccountId) => {
            const accCfg = adAccountConfigs.find((c) => c.id === adAccountId);
            return !accCfg || accCfg.feedProviderIds.length === 0 || accCfg.feedProviderIds.includes(feedProviderId);
          });

          for (const chunk of chunks) {
            for (const adAccountId of eligibleAccounts) {
              for (let i = 0; i < duplications; i++) {
                items.push({
                  adAccountId,
                  creativeIds: chunk,
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
