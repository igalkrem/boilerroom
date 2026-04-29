"use client";

import { useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { Button, Input } from "@/components/ui";
import type { FeedProvider } from "@/types/feed-provider";
import { emptyFeedProvider } from "@/types/feed-provider";
import { upsertFeedProvider } from "@/lib/feed-providers";
import { SnapTab } from "./tabs/SnapTab";
import { ChannelsTab } from "./tabs/ChannelsTab";
import { DomainsTab } from "./tabs/DomainsTab";
import { CombosTab } from "./tabs/CombosTab";

type Tab = "snap" | "channels" | "domains" | "combos" | "facebook";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "snap",     label: "Snap" },
  { id: "channels", label: "Channels" },
  { id: "domains",  label: "Domains" },
  { id: "combos",   label: "Combos" },
  { id: "facebook", label: "Facebook" },
];

interface FeedProviderModalProps {
  provider?: FeedProvider | null;
  onClose: () => void;
  onSaved: (provider: FeedProvider) => void;
}

export function FeedProviderModal({ provider, onClose, onSaved }: FeedProviderModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("snap");
  const [data, setData] = useState<FeedProvider>(() => {
    if (provider) return { ...provider };
    return {
      id: uuid(),
      ...emptyFeedProvider(),
      createdAt: new Date().toISOString(),
    };
  });
  const [nameError, setNameError] = useState("");
  const backdropRef = useRef<HTMLDivElement>(null);

  // Keep the saved ID stable so Channels tab can load by existing ID
  const savedId = provider?.id ?? null;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleSave() {
    if (!data.name.trim()) {
      setNameError("Name is required");
      return;
    }
    setNameError("");
    upsertFeedProvider(data);
    onSaved(data);
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex-1 max-w-xs">
            <Input
              placeholder="Feed Provider Name"
              value={data.name}
              onChange={(e) => { setData((d) => ({ ...d, name: e.target.value })); setNameError(""); }}
              error={nameError}
              className="text-lg font-semibold"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100 px-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "snap" && (
            <SnapTab
              snapConfig={data.snapConfig}
              onChange={(snapConfig) => setData((d) => ({ ...d, snapConfig }))}
              urlConfig={data.urlConfig}
              onUrlConfigChange={(urlConfig) => setData((d) => ({ ...d, urlConfig }))}
            />
          )}
          {activeTab === "channels" && (
            <ChannelsTab
              feedProviderId={savedId}
              channelConfig={data.channelConfig}
              onChange={(channelConfig) => setData((d) => ({ ...d, channelConfig }))}
            />
          )}
          {activeTab === "domains" && (
            <DomainsTab
              domains={data.domains}
              onChange={(domains) => setData((d) => ({ ...d, domains }))}
            />
          )}
          {activeTab === "combos" && (
            <CombosTab
              combos={data.combos}
              snapConfig={data.snapConfig}
              domains={data.domains}
              onChange={(combos) => setData((d) => ({ ...d, combos }))}
            />
          )}
          {activeTab === "facebook" && (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400 italic">
              Coming soon
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>
            {provider ? "Save Changes" : "Create Feed Provider"}
          </Button>
        </div>
      </div>
    </div>
  );
}
