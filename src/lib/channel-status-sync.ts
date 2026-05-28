import { getInUseChannelsByUser, getInUseChannelsWithoutSquadId, updateChannelPausedStatus, updateChannelAdSquadId } from "@/lib/db";
import { getAdSquad, getAdSquads } from "@/lib/snapchat/adsquads";

export interface ChannelSyncResult {
  checked: number;
  paused: number;
  resumed: number;
  errors: number;
  backfilled: number;
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

  const toSetPaused: string[] = [];
  const toClearPaused: string[] = [];
  let errors = 0;

  if (channels.length > 0) {
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
  }

  // Backfill pass: channels that have a campaign_snap_id but no ad_squad_snap_id
  // were created before the link-squad call was wired in. Find their squad by
  // looking up all squads under the campaign and matching the channel_id in the name.
  let backfilled = 0;
  const orphans = await getInUseChannelsWithoutSquadId(googleUserId);
  if (orphans.length > 0) {
    await Promise.allSettled(
      orphans.map(async (ch) => {
        try {
          const squads = await getAdSquads(ch.campaign_snap_id!, accessToken);
          const match = squads.find((s) => s.name?.includes(ch.channel_id));
          if (match?.id) {
            await updateChannelAdSquadId(ch.channel_id, match.id, googleUserId);
            backfilled++;
          }
        } catch (err) {
          console.error(
            `[channel-status-sync] backfill failed for channel ${ch.channel_id} / campaign ${ch.campaign_snap_id}:`,
            err
          );
        }
      })
    );
  }

  return {
    checked: channels.length,
    paused: toSetPaused.length,
    resumed: toClearPaused.length,
    errors,
    backfilled,
  };
}
