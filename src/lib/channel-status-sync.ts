import { getInUseChannelsByUser, updateChannelPausedStatus } from "@/lib/db";
import { getAdSquad } from "@/lib/snapchat/adsquads";

export interface ChannelSyncResult {
  checked: number;
  paused: number;
  resumed: number;
  errors: number;
}

/**
 * For every in-use channel belonging to googleUserId that has an ad_squad_snap_id,
 * fetch the current Snapchat status and update paused_since accordingly:
 *   PAUSED + paused_since IS NULL  → set paused_since = NOW()   (start 24h grace clock)
 *   ACTIVE + paused_since IS NOT NULL → clear paused_since       (campaign reactivated)
 * Errors on individual squads are logged and swallowed — one 404 must not abort the rest.
 */
export async function syncChannelPausedStatus(
  googleUserId: string,
  accessToken: string
): Promise<ChannelSyncResult> {
  const channels = await getInUseChannelsByUser(googleUserId);
  if (channels.length === 0) return { checked: 0, paused: 0, resumed: 0, errors: 0 };

  const toSetPaused: string[] = [];
  const toClearPaused: string[] = [];
  let errors = 0;

  await Promise.allSettled(
    channels.map(async (ch) => {
      try {
        const squad = await getAdSquad(ch.ad_squad_snap_id!, accessToken);
        if (squad.status === "PAUSED" && ch.paused_since == null) {
          toSetPaused.push(ch.ad_squad_snap_id!);
        } else if (squad.status === "ACTIVE" && ch.paused_since != null) {
          toClearPaused.push(ch.ad_squad_snap_id!);
        }
      } catch (err) {
        errors++;
        console.error(
          `[channel-status-sync] failed to fetch squad ${ch.ad_squad_snap_id} for user ${googleUserId}:`,
          err
        );
      }
    })
  );

  await updateChannelPausedStatus(toSetPaused, googleUserId, "set");
  await updateChannelPausedStatus(toClearPaused, googleUserId, "clear");

  return {
    checked: channels.length,
    paused: toSetPaused.length,
    resumed: toClearPaused.length,
    errors,
  };
}
