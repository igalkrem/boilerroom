"use client";

import { useEffect, useState } from "react";
import { useAdAccounts } from "@/hooks/useAdAccounts";
import { useSnapchatAuth } from "@/hooks/useSnapchatAuth";
import { useRouter } from "next/navigation";
import { loadAdAccountConfigs } from "@/lib/adAccounts";
import { Card, Badge, Button, Spinner, Alert } from "@/components/ui";
import type { SnapAdAccount } from "@/types/snapchat";
import type { AdAccountConfig } from "@/types/ad-account";

function statusVariant(status: SnapAdAccount["status"]) {
  if (status === "ACTIVE") return "green";
  if (status === "PAUSED") return "yellow";
  return "gray";
}

export default function DashboardPage() {
  const { accounts: allAccounts, isLoading, error } = useAdAccounts();
  const { snapConnected, isLoading: authLoading } = useSnapchatAuth();
  const [configs, setConfigs] = useState<AdAccountConfig[]>([]);
  const router = useRouter();

  useEffect(() => {
    setConfigs(loadAdAccountConfigs());
  }, []);

  // Filter out hidden accounts
  const accounts = allAccounts.filter((a) => {
    const cfg = configs.find((c) => c.id === a.id);
    return !cfg?.hidden;
  });

  if (authLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <Spinner /> Loading…
      </div>
    );
  }

  if (!snapConnected) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-yellow-400 flex items-center justify-center mx-auto">
          <svg viewBox="0 0 24 24" className="w-9 h-9 text-gray-950" fill="currentColor">
            <path d="M12.166.002c.83-.005 3.39.229 4.643 2.848.422.88.338 2.352.269 3.562l-.012.2c-.006.09.049.125.106.101.225-.093.456-.24.7-.397.328-.21.664-.426 1.021-.506a1.53 1.53 0 01.379-.024c.498.032.938.346 1.106.785.217.567-.045 1.128-.779 1.663-.118.086-.247.164-.375.241-.403.241-.732.437-.665.671.044.152.19.332.364.553.536.677 1.344 1.7 1.344 3.414 0 2.618-1.83 4.62-4.99 5.544-.193.056-.236.151-.267.27-.046.175-.085.325-.296.484-.271.2-.68.3-1.252.302-.494.002-1.102-.08-1.76-.167-.77-.102-1.566-.209-2.27-.153-.703.055-1.377.22-2.018.379-.548.138-1.072.27-1.572.27h-.049c-.545-.008-.938-.106-1.198-.3-.208-.158-.248-.307-.291-.48-.03-.117-.072-.212-.265-.268C3.83 18.625 2 16.623 2 14.005c0-1.715.808-2.737 1.344-3.414.174-.22.32-.401.364-.553.068-.233-.262-.43-.665-.671a5.39 5.39 0 01-.375-.241C1.934 8.59 1.672 8.03 1.89 7.46c.167-.439.608-.753 1.106-.785a1.51 1.51 0 01.379.024c.357.08.693.296 1.021.506.244.157.475.304.7.397.056.023.112-.011.106-.1l-.012-.201C5.12 6.09 5.037 4.617 5.46 3.736 6.574 1.388 8.91.807 10.316.36 10.83.193 11.444.006 12.166.002z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Connect Snapchat</h2>
        <p className="text-sm text-gray-500">
          Connect your Snapchat account to create and manage campaigns.
        </p>
        <Button onClick={() => router.push("/dashboard/traffic-sources")}>
          Go to Traffic Sources
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Ad Accounts</h1>
      <p className="text-sm text-gray-500 mb-6">Select an account to create bulk campaigns.</p>

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-500">
          <Spinner /> Loading accounts...
        </div>
      )}

      {error && (
        <Alert type="error">Failed to load ad accounts. {error.message}</Alert>
      )}

      {!isLoading && !error && accounts.length === 0 && (
        <Alert type="info">
          No ad accounts available.{" "}
          {allAccounts.length > 0
            ? "All accounts are hidden. Manage visibility in Traffic Sources."
            : "Make sure your Snapchat account has Business Manager access."}
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((account) => (
          <Card key={account.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <h2 className="font-semibold text-gray-900 text-base leading-snug">
                {account.name}
              </h2>
              <Badge variant={statusVariant(account.status)}>{account.status}</Badge>
            </div>
            <div className="text-xs text-gray-500 space-y-0.5">
              <p>ID: {account.id}</p>
              <p>Currency: {account.currency}</p>
            </div>
            <Button
              size="sm"
              className="mt-auto"
              onClick={() => router.push(`/dashboard/${account.id}/create`)}
            >
              Create Bulk Campaign
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
