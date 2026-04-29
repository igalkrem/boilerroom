"use client";

import { create } from "zustand";
import type { CanvasEdges, CampaignBuildItem } from "@/types/wizard";
import { loadAdAccountConfigs } from "@/lib/adAccounts";

interface CanvasStore {
  creativeIds: string[];
  edges: CanvasEdges;
  selectedAdAccountIds: string[];

  addCreative: (id: string) => void;
  removeCreative: (id: string) => void;
  toggleCreativeToProvider: (creativeId: string, feedProviderId: string) => void;
  toggleProviderToArticle: (feedProviderId: string, articleId: string) => void;
  setArticleContent: (feedProviderId: string, articleId: string, headline: string, callToAction: string) => void;
  toggleArticleToPreset: (articleId: string, presetId: string) => void;
  setDuplications: (articleId: string, presetId: string, count: number) => void;
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

  addCreative: (id) =>
    set((s) => ({ creativeIds: s.creativeIds.includes(id) ? s.creativeIds : [...s.creativeIds, id] })),

  removeCreative: (id) =>
    set((s) => ({
      creativeIds: s.creativeIds.filter((c) => c !== id),
      edges: {
        ...s.edges,
        creativeToProvider: s.edges.creativeToProvider.filter((e) => e.creativeId !== id),
      },
    })),

  toggleCreativeToProvider: (creativeId, feedProviderId) =>
    set((s) => {
      const exists = s.edges.creativeToProvider.some(
        (e) => e.creativeId === creativeId && e.feedProviderId === feedProviderId
      );
      return {
        edges: {
          ...s.edges,
          creativeToProvider: exists
            ? s.edges.creativeToProvider.filter(
                (e) => !(e.creativeId === creativeId && e.feedProviderId === feedProviderId)
              )
            : [...s.edges.creativeToProvider, { creativeId, feedProviderId }],
        },
      };
    }),

  toggleProviderToArticle: (feedProviderId, articleId) =>
    set((s) => {
      const exists = s.edges.providerToArticle.some(
        (e) => e.feedProviderId === feedProviderId && e.articleId === articleId
      );
      return {
        edges: {
          ...s.edges,
          providerToArticle: exists
            ? s.edges.providerToArticle.filter(
                (e) => !(e.feedProviderId === feedProviderId && e.articleId === articleId)
              )
            : [...s.edges.providerToArticle, { feedProviderId, articleId, headline: "", callToAction: "" }],
        },
      };
    }),

  setArticleContent: (feedProviderId, articleId, headline, callToAction) =>
    set((s) => ({
      edges: {
        ...s.edges,
        providerToArticle: s.edges.providerToArticle.map((e) =>
          e.feedProviderId === feedProviderId && e.articleId === articleId
            ? { ...e, headline, callToAction }
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

  toggleAdAccount: (id) =>
    set((s) => ({
      selectedAdAccountIds: s.selectedAdAccountIds.includes(id)
        ? s.selectedAdAccountIds.filter((a) => a !== id)
        : [...s.selectedAdAccountIds, id],
    })),

  setSelectedAdAccountIds: (ids) => set({ selectedAdAccountIds: ids }),

  reset: () => set({ creativeIds: [], edges: { ...initialEdges }, selectedAdAccountIds: [] }),

  buildCampaignMatrix: (): CampaignBuildItem[] => {
    const { creativeIds, edges, selectedAdAccountIds } = get();
    if (selectedAdAccountIds.length === 0) return [];
    const adAccountConfigs = loadAdAccountConfigs();
    const items: CampaignBuildItem[] = [];

    for (const adAccountId of selectedAdAccountIds) {
      const accCfg = adAccountConfigs.find((c) => c.id === adAccountId);
      for (const creativeId of creativeIds) {
        const providerEdges = edges.creativeToProvider.filter((e) => e.creativeId === creativeId);
        for (const { feedProviderId } of providerEdges) {
          // Skip cross-provider mismatch: account isn't assigned to this provider
          if (accCfg && accCfg.feedProviderIds.length > 0 && !accCfg.feedProviderIds.includes(feedProviderId)) {
            continue;
          }
          const articleEdges = edges.providerToArticle.filter((e) => e.feedProviderId === feedProviderId);
          for (const { articleId, headline, callToAction } of articleEdges) {
            const presetEdges = edges.articleToPreset.filter((e) => e.articleId === articleId);
            for (const { presetId, duplications } of presetEdges) {
              for (let i = 0; i < duplications; i++) {
                items.push({ adAccountId, creativeId, feedProviderId, articleId, presetId, duplicationIndex: i, headline, callToAction });
              }
            }
          }
        }
      }
    }
    return items;
  },
}));
