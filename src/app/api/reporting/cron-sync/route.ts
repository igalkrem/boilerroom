import { NextRequest, NextResponse } from "next/server";
import { getAllUserTokens, upsertUserToken, sql } from "@/lib/db";
import { refreshAccessToken } from "@/lib/snapchat/auth";
import { syncAccount } from "@/lib/reporting/sync-logic";
import { verifyCronSecret } from "@/lib/db/token-crypto";
import { syncChannelPausedStatus } from "@/lib/channel-status-sync";
import { getProviderNetworkMap } from "@/lib/reporting/provider-network";

async function getAccountNetwork(
  adAccountId: string,
  providerMap: Map<string, "kingsroad" | "predicto">
): Promise<"kingsroad" | "predicto" | "unknown"> {
  // 1. Explicit provider config (authoritative — no DB data required)
  const fromProvider = providerMap.get(adAccountId);
  if (fromProvider) return fromProvider;

  // 2. DB join fallback for accounts not yet configured with revenueSource
  const [kr, pred] = await Promise.all([
    sql`SELECT 1 FROM snapchat_ad_squad_stats sas
        INNER JOIN kingsroad_report kr ON kr.custom_channel_name = sas.ad_squad_id
        WHERE sas.ad_account_id = ${adAccountId} LIMIT 1`,
    sql`SELECT 1 FROM snapchat_ad_squad_stats sas
        INNER JOIN feed_provider_channels fpc ON fpc.ad_squad_snap_id = sas.ad_squad_id
        WHERE sas.ad_account_id = ${adAccountId} LIMIT 1`,
  ]);
  if (kr.rows.length > 0) return "kingsroad";
  if (pred.rows.length > 0) return "predicto";
  return "unknown";
}

export const maxDuration = 300;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function nDaysAgoStr(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userTokens = await getAllUserTokens();
  if (userTokens.length === 0) {
    return NextResponse.json({ message: "no users to sync", synced: 0 });
  }

  const today = todayStr();
  const startDate = nDaysAgoStr(1); // today + yesterday

  // :17 run = KingsRoad window (sync KingsRoad feed + KingsRoad Snap accounts)
  // :47 run = Predicto window  (sync Predicto feed + Predicto Snap accounts)
  const isKingsRoadRun = new Date().getUTCMinutes() < 30;

  let totalUsers = 0;
  let totalAccounts = 0;

  await Promise.allSettled(
    userTokens.map(async (user) => {
      if (user.ad_account_ids.length === 0) return;

      let accessToken: string;
      try {
        const tokens = await refreshAccessToken(user.refresh_token);
        accessToken = tokens.access_token;
        // Persist the new refresh token if Snapchat rotated it.
        if (tokens.refresh_token) {
          await upsertUserToken(user.google_user_id, tokens.refresh_token);
        }
      } catch (err) {
        console.error(`[cron-sync] token refresh failed for user ${user.google_user_id}:`, err);
        return; // skip this user, retry next run
      }

      // Update paused_since for all in-use channels before normalizeChannelStatuses
      // runs lazily on next assignChannel/listChannels call.
      try {
        const channelSync = await syncChannelPausedStatus(user.google_user_id, accessToken);
        if (channelSync.checked > 0) {
          console.log(`[cron-sync] channel sync for ${user.google_user_id}:`, channelSync);
        }
      } catch (err) {
        // Non-fatal — report sync must not fail because of channel sync.
        console.error(`[cron-sync] channel status sync failed for user ${user.google_user_id}:`, err);
      }

      // Classify accounts by network, then only sync the ones relevant to this window.
      // Unknown accounts (no data yet) are included in both windows as a fallback.
      const providerMap = await getProviderNetworkMap(user.google_user_id);
      const classified = await Promise.all(
        user.ad_account_ids.map(async ({ id, timezone }) => ({
          id,
          timezone,
          network: await getAccountNetwork(id, providerMap),
        }))
      );

      const accountsToSync = classified.filter(({ network }) =>
        network === "unknown" ||
        (isKingsRoadRun ? network === "kingsroad" : network === "predicto")
      );

      await Promise.allSettled(
        accountsToSync.map(async ({ id, timezone }) => {
          try {
            await syncAccount(id, startDate, today, timezone || "America/Los_Angeles", accessToken, true);
            totalAccounts++;
          } catch (err) {
            console.error(`[cron-sync] sync failed for account ${id}:`, err);
          }
        })
      );

      totalUsers++;
    })
  );

  console.log(`[cron-sync] done — users: ${totalUsers}, accounts: ${totalAccounts}`);
  return NextResponse.json({ synced_users: totalUsers, synced_accounts: totalAccounts });
}
