"use client";

import { create } from "zustand";
import type { CampaignBuildItem, CreativeGroup, CreativeRow, RowConfig } from "@/types/wizard";

// ─── Store ────────────────────────────────────────────────────────────────────

const MAX_GROUPS_PER_ROW = 8;
const MAX_CREATIVES_PER_GROUP = 5;

interface CanvasStore {
  creativeRows: CreativeRow[];
  creativeGroups: CreativeGroup[];
  rowConfigs: RowConfig[];
  nodePositions: Record<string, { x: number; y: number }>;

  // Row-level actions
  addRow: () => CreativeRow;
  removeRow: (rowId: string) => void;
  duplicateRow: (rowId: string) => CreativeRow | null;
  addGroupToRow: (rowId: string, assetId: string) => void;
  removeGroupFromRow: (rowId: string, groupId: string) => void;

  // Group-internal actions (used for multi-creative slots within a group)
  addCreativeToGroup: (groupId: string, assetId: string) => void;
  removeCreativeFromGroup: (groupId: string, assetId: string) => void;

  // Per-row config actions
  addProviderToRow: (rowId: string, feedProviderId: string) => void;
  removeProviderFromRow: (rowId: string, feedProviderId: string) => void;
  toggleArticleInRow: (
    rowId: string,
    feedProviderId: string,
    articleId: string,
    headline?: string,
    headlineRac?: string
  ) => void;
  setRowArticleContent: (
    rowId: string,
    feedProviderId: string,
    articleId: string,
    headline: string,
    callToAction: string,
    headlineRac?: string
  ) => void;
  toggleAdAccountInRow: (rowId: string, adAccountId: string) => void;
  togglePresetInRow: (rowId: string, presetId: string) => void;
  setRowPresetDuplications: (rowId: string, presetId: string, count: number) => void;

  setNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  setNodePositions: (positions: Record<string, { x: number; y: number }>) => void;
  reset: () => void;

  buildCampaignMatrix: () => CampaignBuildItem[];
}

function emptyRowConfig(rowId: string): RowConfig {
  return { rowId, feedProviderIds: [], articles: [], adAccountIds: [], presets: [] };
}

// Tiny counter to disambiguate IDs created in the same millisecond
let idCounter = 0;
function freshId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  creativeRows: [],
  creativeGroups: [],
  rowConfigs: [],
  nodePositions: {},

  addRow: () => {
    const newRow: CreativeRow = { id: freshId("row"), groupIds: [] };
    set((s) => ({
      creativeRows: [...s.creativeRows, newRow],
      rowConfigs: [...s.rowConfigs, emptyRowConfig(newRow.id)],
    }));
    return newRow;
  },

  removeRow: (rowId) =>
    set((s) => {
      const row = s.creativeRows.find((r) => r.id === rowId);
      const removedGroupIds = new Set(row?.groupIds ?? []);
      return {
        creativeRows: s.creativeRows.filter((r) => r.id !== rowId),
        creativeGroups: s.creativeGroups.filter((g) => !removedGroupIds.has(g.id)),
        rowConfigs: s.rowConfigs.filter((c) => c.rowId !== rowId),
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
    // Deep-copy the source row's config
    const srcConfig = state.rowConfigs.find((c) => c.rowId === rowId);
    const newConfig: RowConfig = srcConfig
      ? {
          rowId: newRow.id,
          feedProviderIds: [...srcConfig.feedProviderIds],
          articles: srcConfig.articles.map((a) => ({ ...a })),
          adAccountIds: [...srcConfig.adAccountIds],
          presets: srcConfig.presets.map((p) => ({ ...p })),
        }
      : emptyRowConfig(newRow.id);
    set((s) => ({
      creativeRows: [...s.creativeRows, newRow],
      creativeGroups: [...s.creativeGroups, ...newGroups],
      rowConfigs: [...s.rowConfigs, newConfig],
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
    set((s) => ({
      creativeRows: s.creativeRows.map((r) =>
        r.id === rowId ? { ...r, groupIds: remainingGroupIds } : r
      ),
      creativeGroups: s.creativeGroups.filter((g) => g.id !== groupId),
    }));
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

  // ─── Per-row config ────────────────────────────────────────────────────────

  addProviderToRow: (rowId, feedProviderId) =>
    set((s) => ({
      rowConfigs: s.rowConfigs.map((c) => {
        if (c.rowId !== rowId) return c;
        if (c.feedProviderIds.includes(feedProviderId)) return c;
        return { ...c, feedProviderIds: [...c.feedProviderIds, feedProviderId] };
      }),
    })),

  removeProviderFromRow: (rowId, feedProviderId) =>
    set((s) => ({
      rowConfigs: s.rowConfigs.map((c) =>
        c.rowId !== rowId
          ? c
          : {
              ...c,
              feedProviderIds: c.feedProviderIds.filter((id) => id !== feedProviderId),
              // Also drop any articles tied to this provider
              articles: c.articles.filter((a) => a.feedProviderId !== feedProviderId),
            }
      ),
    })),

  toggleArticleInRow: (rowId, feedProviderId, articleId, headline, headlineRac) =>
    set((s) => ({
      rowConfigs: s.rowConfigs.map((c) => {
        if (c.rowId !== rowId) return c;
        const exists = c.articles.some(
          (a) => a.feedProviderId === feedProviderId && a.articleId === articleId
        );
        if (exists) {
          return {
            ...c,
            articles: c.articles.filter(
              (a) => !(a.feedProviderId === feedProviderId && a.articleId === articleId)
            ),
          };
        }
        return {
          ...c,
          articles: [
            ...c.articles,
            {
              feedProviderId,
              articleId,
              headline: headline ?? "",
              headlineRac: headlineRac ?? "",
              callToAction: "MORE",
            },
          ],
        };
      }),
    })),

  setRowArticleContent: (rowId, feedProviderId, articleId, headline, callToAction, headlineRac) =>
    set((s) => ({
      rowConfigs: s.rowConfigs.map((c) =>
        c.rowId !== rowId
          ? c
          : {
              ...c,
              articles: c.articles.map((a) =>
                a.feedProviderId === feedProviderId && a.articleId === articleId
                  ? { ...a, headline, callToAction, ...(headlineRac !== undefined ? { headlineRac } : {}) }
                  : a
              ),
            }
      ),
    })),

  toggleAdAccountInRow: (rowId, adAccountId) =>
    set((s) => ({
      rowConfigs: s.rowConfigs.map((c) => {
        if (c.rowId !== rowId) return c;
        const exists = c.adAccountIds.includes(adAccountId);
        return {
          ...c,
          adAccountIds: exists
            ? c.adAccountIds.filter((id) => id !== adAccountId)
            : [...c.adAccountIds, adAccountId],
        };
      }),
    })),

  togglePresetInRow: (rowId, presetId) =>
    set((s) => ({
      rowConfigs: s.rowConfigs.map((c) => {
        if (c.rowId !== rowId) return c;
        const exists = c.presets.some((p) => p.presetId === presetId);
        return {
          ...c,
          presets: exists
            ? c.presets.filter((p) => p.presetId !== presetId)
            : [...c.presets, { presetId, duplications: 1 }],
        };
      }),
    })),

  setRowPresetDuplications: (rowId, presetId, count) =>
    set((s) => ({
      rowConfigs: s.rowConfigs.map((c) =>
        c.rowId !== rowId
          ? c
          : {
              ...c,
              presets: c.presets.map((p) =>
                p.presetId === presetId
                  ? { ...p, duplications: Math.max(1, Math.min(10, count)) }
                  : p
              ),
            }
      ),
    })),

  setNodePosition: (nodeId, position) =>
    set((s) => ({ nodePositions: { ...s.nodePositions, [nodeId]: position } })),

  setNodePositions: (positions) =>
    set((s) => ({ nodePositions: { ...s.nodePositions, ...positions } })),

  reset: () =>
    set({
      creativeRows: [],
      creativeGroups: [],
      rowConfigs: [],
      nodePositions: {},
    }),

  buildCampaignMatrix: (): CampaignBuildItem[] => {
    const { creativeRows, creativeGroups, rowConfigs } = get();
    const items: CampaignBuildItem[] = [];
    for (const config of rowConfigs) {
      const row = creativeRows.find((r) => r.id === config.rowId);
      if (!row) continue;
      for (const groupId of row.groupIds) {
        const group = creativeGroups.find((g) => g.id === groupId);
        if (!group || group.creativeIds.length === 0) continue;
        for (const { feedProviderId, articleId, headline, headlineRac, callToAction } of config.articles) {
          for (const { presetId, duplications } of config.presets) {
            for (const adAccountId of config.adAccountIds) {
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
