"use client";

import { useAdAccounts } from "@/hooks/useAdAccounts";
import { useRouter } from "next/navigation";
import { Card, Badge, Button, Spinner, Alert } from "@/components/ui";
import type { SnapAdAccount } from "@/types/snapchat";

function statusVariant(status: SnapAdAccount["status"]) {
  if (status === "ACTIVE") return "green";
  if (status === "PAUSED") return "yellow";
  return "gray";
}

export default function DashboardPage() {
  const { accounts, isLoading, error } = useAdAccounts();
  const router = useRouter();

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
        <Alert type="info">No ad accounts found. Make sure your Snapchat account has Business Manager access.</Alert>
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
