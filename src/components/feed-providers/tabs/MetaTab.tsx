"use client";

import { useRouter } from "next/navigation";
import type { FeedProvider } from "@/types/feed-provider";

interface MetaTabProps {
  metaConfig: FeedProvider["metaConfig"];
}

export function MetaTab({ metaConfig }: MetaTabProps) {
  const router = useRouter();
  const accounts = metaConfig?.allowedAdAccountIds ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Assigned Meta Ad Accounts
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Ad accounts are assigned to this provider from the{" "}
          <button
            type="button"
            onClick={() => router.push("/dashboard/traffic-sources")}
            className="text-blue-600 hover:underline"
          >
            Traffic Sources
          </button>{" "}
          page. Changes made there are reflected here automatically.
        </p>

        {accounts.length === 0 ? (
          <div className="border border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center text-sm text-gray-400">
            No Meta ad accounts assigned yet.{" "}
            <button
              type="button"
              onClick={() => router.push("/dashboard/traffic-sources")}
              className="text-blue-600 hover:underline"
            >
              Go to Traffic Sources
            </button>{" "}
            to connect Meta and assign accounts.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {accounts.map((id) => (
              <li key={id} className="px-4 py-2.5 text-sm font-mono text-gray-700 dark:text-gray-300">
                {id}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
