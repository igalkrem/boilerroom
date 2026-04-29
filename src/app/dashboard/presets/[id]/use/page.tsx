"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPresetById } from "@/lib/presets";
import { useAdAccounts } from "@/hooks/useAdAccounts";
import { useWizardStore } from "@/hooks/useWizardStore";
import { loadAdAccountConfigs } from "@/lib/adAccounts";
import { Select, Button, Spinner, Alert } from "@/components/ui";
import type { CampaignPreset } from "@/types/preset";
import type { AdAccountConfig } from "@/types/ad-account";

export default function UsePresetPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { accounts: allAccounts, isLoading, error } = useAdAccounts();
  const { loadPreset, reset, setAdAccountId } = useWizardStore();
  const [configs, setConfigs] = useState<AdAccountConfig[]>([]);

  useEffect(() => {
    setConfigs(loadAdAccountConfigs());
  }, []);

  const accounts = allAccounts.filter((a) => {
    const cfg = configs.find((c) => c.id === a.id);
    return !cfg?.hidden;
  });

  const [preset, setPreset] = useState<CampaignPreset | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");

  useEffect(() => {
    const found = getPresetById(params.id);
    if (!found) {
      setNotFound(true);
    } else {
      setPreset(found);
    }
  }, [params.id]);

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  if (notFound) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-gray-500">Preset not found.</p>
        <button
          onClick={() => router.push("/dashboard/presets")}
          className="text-cyan-600 underline text-sm"
        >
          Back to Presets
        </button>
      </div>
    );
  }

  if (!preset) return null;

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }));

  function handleLoad() {
    if (!selectedAccountId || !preset) return;
    reset();
    setAdAccountId(selectedAccountId);
    loadPreset(preset);
    router.push(`/dashboard/${selectedAccountId}/create`);
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Load Preset</h1>
        <p className="text-sm text-gray-500 mt-1">
          Select an ad account to start the wizard with <strong>{preset.name}</strong>.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-500">
          <Spinner /> Loading ad accounts...
        </div>
      )}

      {error && (
        <Alert type="error">Failed to load ad accounts. {error.message}</Alert>
      )}

      {!isLoading && !error && accounts.length === 0 && (
        <Alert type="info">No ad accounts found.</Alert>
      )}

      {accounts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <Select
            label="Ad Account"
            options={accountOptions}
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
          />
          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push("/dashboard/presets")}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleLoad}
              disabled={!selectedAccountId}
            >
              Load &amp; Start Wizard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
