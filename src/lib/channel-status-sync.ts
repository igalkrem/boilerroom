import {
  getInUseChannelsByUser,
  getInUseChannelsWithoutSquadId,
  updateChannelPausedStatus,
  updateChannelAdSquadId,
  type ChannelRow,
} from "@/lib/db";
import { getAdSquad, getAdSquads } from "@/lib/snapchat/adsquads";
import { isEntityNotFound } from "@/lib/snapchat/errors";
import { getAdSet, getAdSets } from "@/lib/meta/adsets";
import { isMetaEntityNotFound } from "@/lib/meta/errors";

export interface ChannelSyncTokens {
  snapAccessToken?: string;
  metaAccessToken?: string;
}

export interface ChannelSyncResult {
  checked: number;
  paused: number;
  resumed: number;
  errors: number;
  backfilled: number;
  /** Channels whose platform token was absent this run — untouched, retried next tick. */
  skipped: number;
}

function isMetaChannel(ch: ChannelRow): boolean {
  const s = ch.traffic_source.toLowerCase();
  return s === "meta" || s === "facebook";
}

/**
 * Meta ad set delivery states that mean "not running". Anything not listed here —
 * IN_PROCESS, PENDING_REVIEW, PREAPPROVED, WITH_ISSUES — is treated as still live.
 *
 * The asymmetry is deliberate. Wrongly marking a live ad set as paused starts the
 * 24h clock that releases its channel back to the pool, so a still-earning campaign
 * can collide with a new one on the same channel_id. Wrongly holding a channel a few
 * hours longer only delays reuse. Bias toward holding.
 */
const META_INACTIVE_EFFECTIVE_STATUSES = new Set([
  "PAUSED",
  "DELETED",
  "ARCHIVED",
  "CAMPAIGN_PAUSED",
  "ADSET_PAUSED",
  "DISAPPROVED",
]);

function isMetaAdSetInactive(adSet: { status?: string; effective_status?: string }): boolean {
  if (adSet.status !== undefined && adSet.status !== "ACTIVE") return true;
  if (adSet.effective_status !== undefined) {
    return META_INACTIVE_EFFECTIVE_STATUSES.has(adSet.effective_status);
  }
  return false;
}

/**
 * Pick the ad set that owns a channel from the name matches under its campaign.
 *
 * A channel_id is reused across relaunch variants, so a plain name match is
 * routinely ambiguous — the 2026-07-30 repair saw 27 of 28 channels match more
 * than one ad set. Delivery status disambiguates: exactly one is live. Returning
 * null on a genuine tie is correct; guessing writes a wrong link that then wins
 * the reporting join's exact-match arm over the name fallback.
 */
export function pickOwningAdSet<T extends { id?: string; name?: string; status?: string; effective_status?: string }>(
  candidates: T[],
  channelId: string
): T | null {
  const matches = candidates.filter((s) => s.name?.includes(channelId));
  if (matches.length === 0) return null;
  const active = matches.filter((s) => (s.effective_status ?? s.status) === "ACTIVE");
  if (active.length === 1) return active[0];
  if (active.length === 0 && matches.length === 1) return matches[0];
  return null;
}

/**
 * For every in-use channel belonging to googleUserId that has an ad_squad_snap_id,
 * fetch the current status from the platform that owns it and update paused_since:
 *   inactive + paused_since IS NULL     → set paused_since = NOW()  (start 24h grace clock)
 *   active   + paused_since IS NOT NULL → clear paused_since        (campaign reactivated)
 *
 * Channels are routed by traffic_source. ad_squad_snap_id holds a Snapchat squad
 * UUID for Snap channels and a numeric Graph ad set id for Meta channels — asking
 * Snapchat about a Meta id yields a 404, which the not-found branch below reads as
 * "entity deleted" and would use to release a channel that is still earning.
 *
 * Errors on individual entities are logged and swallowed — one 404 must not abort the rest.
 */
export async function syncChannelPausedStatus(
  googleUserId: string,
  tokens: ChannelSyncTokens
): Promise<ChannelSyncResult> {
  const channels = await getInUseChannelsByUser(googleUserId);

  const toSetPaused: string[] = [];
  const toClearPaused: string[] = [];
  let errors = 0;
  let skipped = 0;

  const classify = (ch: ChannelRow, inactive: boolean) => {
    if (!inactive && ch.paused_since != null) {
      toClearPaused.push(ch.ad_squad_snap_id!);
    } else if (inactive && ch.paused_since == null) {
      toSetPaused.push(ch.ad_squad_snap_id!);
    }
  };

  if (channels.length > 0) {
    await Promise.allSettled(
      channels.map(async (ch) => {
        const meta = isMetaChannel(ch);
        const token = meta ? tokens.metaAccessToken : tokens.snapAccessToken;
        if (!token) {
          skipped++;
          return;
        }
        try {
          if (meta) {
            classify(ch, isMetaAdSetInactive(await getAdSet(ch.ad_squad_snap_id!, token)));
          } else {
            const squad = await getAdSquad(ch.ad_squad_snap_id!, token);
            // Squad is inactive if admin status is not ACTIVE, OR if Snapchat's effective_status
            // indicates non-delivery (e.g. all ads rejected — status stays ACTIVE but effective_status changes)
            const isInactive =
              squad.status !== "ACTIVE" ||
              (squad.effective_status !== undefined && squad.effective_status !== "ACTIVE");
            classify(ch, isInactive);
          }
        } catch (err: unknown) {
          const isGone = meta ? isMetaEntityNotFound(err) : isEntityNotFound(err);
          if (isGone && ch.paused_since == null) {
            // Entity deleted or missing — start the 24h grace clock so channel exits in-use
            toSetPaused.push(ch.ad_squad_snap_id!);
          } else {
            errors++;
            console.error(
              `[channel-status-sync] failed to fetch ${meta ? "Meta ad set" : "Snap squad"} ` +
                `${ch.ad_squad_snap_id} for user ${googleUserId}:`,
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
  // were created before the link-squad call was wired in, or their link-squad call
  // failed (it is fire-and-forget on both orchestrators). Find the owning entity by
  // listing the campaign's children and matching the channel_id in the name.
  let backfilled = 0;
  const orphans = await getInUseChannelsWithoutSquadId(googleUserId);
  if (orphans.length > 0) {
    await Promise.allSettled(
      orphans.map(async (ch) => {
        const meta = isMetaChannel(ch);
        const token = meta ? tokens.metaAccessToken : tokens.snapAccessToken;
        if (!token) {
          skipped++;
          return;
        }
        try {
          // Widened to the shape pickOwningAdSet needs — the two platform types share
          // no ancestor, and only these four fields participate in the match.
          const candidates: Array<{ id?: string; name?: string; status?: string; effective_status?: string }> =
            meta
              ? await getAdSets(ch.campaign_snap_id!, token)
              : await getAdSquads(ch.campaign_snap_id!, token);
          const match = pickOwningAdSet(candidates, ch.channel_id);
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
    skipped,
  };
}
