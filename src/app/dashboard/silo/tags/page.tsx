"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { loadTags, upsertTag, deleteTag } from "@/lib/silo-tags";
import { loadAssets } from "@/lib/silo";
import type { SiloTag } from "@/types/silo";

export default function SiloTagsPage() {
  const router = useRouter();
  const [tags, setTags] = useState<SiloTag[]>([]);
  const [assetCounts, setAssetCounts] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrefix, setEditPrefix] = useState("");
  const [error, setError] = useState("");

  function reload() {
    const t = loadTags();
    setTags(t);
    const assets = loadAssets();
    const counts: Record<string, number> = {};
    t.forEach((tag) => { counts[tag.id] = assets.filter((a) => a.tagId === tag.id).length; });
    setAssetCounts(counts);
  }

  useEffect(() => { reload(); }, []);

  function sanitizePrefix(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/, "");
  }

  function handleCreate() {
    setError("");
    const name = newName.trim();
    const prefix = newPrefix.trim() || sanitizePrefix(name);
    if (!name) { setError("Tag name is required"); return; }
    if (!prefix) { setError("Prefix is required"); return; }
    const tag: SiloTag = { id: uuid(), name, prefix, nextIndex: 1, createdAt: new Date().toISOString() };
    upsertTag(tag);
    setNewName("");
    setNewPrefix("");
    reload();
  }

  function handleDelete(tag: SiloTag) {
    const count = assetCounts[tag.id] ?? 0;
    const msg = count > 0
      ? `Delete tag "${tag.name}"? It has ${count} asset${count !== 1 ? "s" : ""} — they will remain but lose this tag.`
      : `Delete tag "${tag.name}"?`;
    if (!window.confirm(msg)) return;
    deleteTag(tag.id);
    reload();
  }

  function startEdit(tag: SiloTag) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditPrefix(tag.prefix);
  }

  function saveEdit(tag: SiloTag) {
    const name = editName.trim();
    const prefix = editPrefix.trim();
    if (!name || !prefix) return;
    upsertTag({ ...tag, name, prefix });
    setEditingId(null);
    reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tags</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tags group creatives and control auto-naming. Files uploaded under a tag are named <span className="font-mono text-gray-700">prefix_v_001</span>, <span className="font-mono text-gray-700">prefix_v_002</span>…
          </p>
        </div>
        <Button variant="ghost" onClick={() => router.push("/dashboard/silo")}>
          ← Back to Library
        </Button>
      </div>

      {/* Create form */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Create New Tag</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          <Input
            label="Tag Name"
            placeholder="e.g. Cars"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (!editingId) setNewPrefix(sanitizePrefix(e.target.value));
            }}
            error={error}
          />
          <Input
            label="Prefix (for naming)"
            placeholder="e.g. cars"
            value={newPrefix}
            onChange={(e) => setNewPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
          />
        </div>
        {newPrefix && (
          <p className="text-xs text-gray-500">
            First file will be named: <span className="font-mono font-medium text-gray-700">{newPrefix}_v_001</span>
          </p>
        )}
        <Button onClick={handleCreate}>+ Create Tag</Button>
      </div>

      {/* Tags list */}
      {tags.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <p className="text-gray-500 text-sm">No tags yet. Create one above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tags.map((tag) => (
            <Card key={tag.id} className="flex flex-col gap-3">
              {editingId === tag.id ? (
                <div className="space-y-2">
                  <Input
                    label="Tag Name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <Input
                    label="Prefix"
                    value={editPrefix}
                    onChange={(e) => setEditPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(tag)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <h2 className="font-semibold text-gray-900 text-base">{tag.name}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Prefix: <span className="font-mono text-gray-700">{tag.prefix}</span>
                      {" · "}Next: <span className="font-mono text-gray-700">{tag.prefix}_v_{String(tag.nextIndex).padStart(3, "0")}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="gray">{assetCounts[tag.id] ?? 0} asset{(assetCounts[tag.id] ?? 0) !== 1 ? "s" : ""}</Badge>
                  </div>
                  <p className="text-xs text-gray-400">Created {new Date(tag.createdAt).toLocaleDateString()}</p>
                  <div className="flex gap-2 mt-auto pt-2 border-t border-gray-100">
                    <Button size="sm" variant="secondary" className="flex-1" onClick={() => startEdit(tag)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="flex-1 text-red-600 hover:text-red-700" onClick={() => handleDelete(tag)}>Delete</Button>
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
