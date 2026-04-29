"use client";

import { useState } from "react";
import { v4 as uuid } from "uuid";
import type { FeedProvider, FeedProviderCombo } from "@/types/feed-provider";

interface CombosTabProps {
  combos: FeedProvider["combos"];
  snapConfig: FeedProvider["snapConfig"];
  domains: FeedProvider["domains"];
  onChange: (combos: FeedProvider["combos"]) => void;
}

export function CombosTab({ combos, snapConfig, domains, onChange }: CombosTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<FeedProviderCombo>>({});

  function startNew() {
    const id = uuid();
    setDraft({ id, name: "" });
    setEditingId(id);
  }

  function startEdit(combo: FeedProviderCombo) {
    setDraft({ ...combo });
    setEditingId(combo.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({});
  }

  function saveCombo() {
    if (!draft.id || !draft.name?.trim()) return;
    const combo: FeedProviderCombo = {
      id: draft.id,
      name: draft.name,
      pixelId: draft.pixelId,
      adAccountIds: draft.adAccountIds,
      domainId: draft.domainId,
      channelConfig: draft.channelConfig,
    };
    const exists = combos.find((c) => c.id === combo.id);
    onChange(exists ? combos.map((c) => (c.id === combo.id ? combo : c)) : [...combos, combo]);
    cancelEdit();
  }

  function deleteCombo(id: string) {
    onChange(combos.filter((c) => c.id !== id));
  }

  const pixelOptions = snapConfig.allowedPixelIds;
  const domainOptions = domains;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Combos are reusable setting groups you can apply when selecting a preset.
        </p>
        <button
          type="button"
          onClick={startNew}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          + New combo
        </button>
      </div>

      {combos.length === 0 && editingId === null && (
        <div className="border border-dashed border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
          No combos yet. Click &quot;+ New combo&quot; to create one.
        </div>
      )}

      <div className="space-y-2">
        {combos.map((combo) =>
          editingId === combo.id ? null : (
            <div key={combo.id} className="flex items-center gap-3 border border-gray-200 rounded-lg p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{combo.name}</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {combo.pixelId && (
                    <span className="text-xs bg-purple-50 text-purple-700 border border-purple-100 px-1.5 py-0.5 rounded">
                      pixel
                    </span>
                  )}
                  {combo.domainId && (
                    <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded">
                      {domainOptions.find((d) => d.id === combo.domainId)?.baseDomain ?? "domain"}
                    </span>
                  )}
                  {combo.channelConfig?.addChannelIdToCampaignName && (
                    <span className="text-xs bg-orange-50 text-orange-700 border border-orange-100 px-1.5 py-0.5 rounded">
                      channel → name
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => startEdit(combo)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => deleteCombo(combo.id)}
                className="text-gray-300 hover:text-red-500"
              >
                ✕
              </button>
            </div>
          )
        )}

        {editingId !== null && (
          <div className="border-2 border-blue-200 rounded-lg p-4 space-y-3 bg-blue-50/30">
            <input
              type="text"
              placeholder="Combo name"
              value={draft.name ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />

            {pixelOptions.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Pixel</label>
                <select
                  value={draft.pixelId ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, pixelId: e.target.value || undefined }))}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— None —</option>
                  {pixelOptions.map((id) => (
                    <option key={id} value={id}>{id.slice(0, 16)}…</option>
                  ))}
                </select>
              </div>
            )}

            {domainOptions.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Domain</label>
                <select
                  value={draft.domainId ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, domainId: e.target.value || undefined }))}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— None —</option>
                  {domainOptions.map((d) => (
                    <option key={d.id} value={d.id}>{d.baseDomain}</option>
                  ))}
                </select>
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.channelConfig?.addChannelIdToCampaignName ?? false}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    channelConfig: { addChannelIdToCampaignName: e.target.checked },
                  }))
                }
                className="rounded border-gray-300"
              />
              <span className="text-xs text-gray-700">Add channel ID to campaign name</span>
            </label>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={saveCombo}
                disabled={!draft.name?.trim()}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Save combo
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
