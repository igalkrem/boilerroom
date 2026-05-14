import { NextRequest, NextResponse } from "next/server";
import { getAllUserTokens, upsertUserToken } from "@/lib/db";
import { refreshAccessToken } from "@/lib/snapchat/auth";
import { syncAccount } from "@/lib/reporting/sync-logic";
import { verifyCronSecret } from "@/lib/db/token-crypto";
import { syncChannelPausedStatus } from "@/lib/channel-status-sync";

export const maxDuration = 300;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
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
  const yesterday = yesterdayStr();
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

      await Promise.allSettled(
        user.ad_account_ids.map(async ({ id, timezone }) => {
          try {
            await syncAccount(id, yesterday, today, timezone || "America/Los_Angeles", accessToken, true);
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
