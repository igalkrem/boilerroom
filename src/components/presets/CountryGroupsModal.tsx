"use client";

import { useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { Button, Input } from "@/components/ui";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import {
  loadCountryGroups,
  upsertCountryGroup,
  deleteCountryGroup,
  countPresetsUsingGroup,
  unlinkPresetsFromGroup,
} from "@/lib/country-groups";
import type { CountryGroup } from "@/types/country-group";

interface CountryGroupsModalProps {
  onClose: () => void;
}

type View = "list" | "form";

export function CountryGroupsModal({ onClose }: CountryGroupsModalProps) {
  const [groups, setGroups] = useState<CountryGroup[]>([]);
  const [view, setView] = useState<View>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [countryCodes, setCountryCodes] = useState<string[]>([]);
  const [nameError, setNameError] = useState("");
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setGroups(loadCountryGroups());
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (view === "form") setView("list");
        else onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, view]);

  function openNew() {
    setEditingId(null);
    setName("");
    setCountryCodes([]);
    setNameError("");
    setView("form");
  }

  function openEdit(group: CountryGroup) {
    setEditingId(group.id);
    setName(group.name);
    setCountryCodes(group.countryCodes);
    setNameError("");
    setView("form");
  }

  function handleSave() {
    if (!name.trim()) {
      setNameError("Name is required");
      return;
    }
    if (countryCodes.length === 0) {
      setNameError("Select at least one country");
      return;
    }
    const group: CountryGroup = {
      id: editingId ?? uuid(),
      name: name.trim(),
      countryCodes,
      createdAt: editingId
        ? (groups.find((g) => g.id === editingId)?.createdAt ?? new Date().toISOString())
        : new Date().toISOString(),
    };
    upsertCountryGroup(group);
    setGroups(loadCountryGroups());
    setView("list");
  }

  function handleDelete(group: CountryGroup) {
    const usageCount = countPresetsUsingGroup(group.id);
    const message =
      usageCount > 0
        ? `"${group.name}" is used by ${usageCount} preset${usageCount !== 1 ? "s" : ""} — they'll keep their current countries but stop auto-updating. Delete anyway?`
        : `Delete "${group.name}"? This cannot be undone.`;
    if (!window.confirm(message)) return;
    if (usageCount > 0) unlinkPresetsFromGroup(group.id);
    deleteCountryGroup(group.id);
    setGroups(loadCountryGroups());
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {view === "list" ? "Country Groups" : editingId ? "Edit Country Group" : "New Country Group"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {view === "list" ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Group countries together to reuse as geo-targeting across presets. Linked presets
                stay in sync — editing a group updates every preset that uses it on its next launch.
              </p>
              {groups.length === 0 ? (
                <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center">
                  <p className="text-gray-500 text-sm">No country groups yet.</p>
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
                  {groups.map((group) => (
                    <div key={group.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{group.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {group.countryCodes.join(", ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(group)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-600"
                          onClick={() => handleDelete(group)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Button onClick={openNew}>+ New Group</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                label="Group Name"
                placeholder="e.g. Tier 1 EN"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError(""); }}
              />
              <MultiSelect
                label="Countries"
                options={COUNTRY_OPTIONS}
                value={countryCodes}
                onChange={(v) => { setCountryCodes(v); setNameError(""); }}
              />
              {nameError && <p className="text-xs text-red-600">{nameError}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        {view === "form" && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="ghost" onClick={() => setView("list")}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        )}
      </div>
    </div>
  );
}
