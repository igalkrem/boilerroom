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
          // Squad is inactive if admin status is not ACTIVE, OR if Snapchat's effective_status
          // indicates non-delivery (e.g. all ads rejected — status stays ACTIVE but effective_status changes)
          const isInactive =
            squad.status !== "ACTIVE" ||
            (squad.effective_status !== undefined && squad.effective_status !== "ACTIVE");
          if (!isInactive && ch.paused_since != null) {
            toClearPaused.push(ch.ad_squad_snap_id!);
          } else if (isInactive && ch.paused_since == null) {
            toSetPaused.push(ch.ad_squad_snap_id!);
          }
        } catch (err: unknown) {
          const msg = String(err);
          const isGone = msg.includes("not found") || msg.includes("404");
          if (isGone && ch.paused_since == null) {
            // Squad deleted or missing — start the 24h grace clock so channel exits in-use
            toSetPaused.push(ch.ad_squad_snap_id!);
          } else {
            errors++;
            console.error(
              `[channel-status-sync] failed to fetch squad ${ch.ad_squad_snap_id} for user ${googleUserId}:`,
              err
            );
          }
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
