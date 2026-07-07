# Brief: Snapchat "Smart Placement" locks ad squads against API updates

**Project:** BoilerRoom (SnapAds Manager)
**Status:** Root cause confirmed. Product workaround shipped. Platform-level API limitation — not fixable on our end.
**Related:** [`snapchat-placement-v2-research.md`](./snapchat-placement-v2-research.md) — earlier raw investigation, including a Snap Support exchange.

## TL;DR

Snapchat's Marketing API lets you set an ad squad's placement (`placement_v2`) at creation, but doing so — **via the API or by editing placements in Snapchat Ads Manager afterward** — permanently locks that ad squad against all future API writes (budget, bid, status). The only way to keep an ad squad API-editable is to never touch its placement at all, which means it's stuck on Snapchat's undocumented default (resolves as legacy `placement: "SNAP_ADS"` / `"UNSUPPORTED"`, shown in the UI as Manual → Content with a fixed subset of positions). There is no configuration that gets both a chosen placement and API editability. Confirmed with live test traffic, not docs — Snap's own docs and even Snap Support gave incorrect guidance here (see below).

## Why this mattered

BoilerRoom bulk-creates campaigns → ad squads → ads via the Marketing API, and the product's core workflow is managing budget/bid/pause for many squads from our own dashboard (not Ads Manager). We wanted ad squads to run on Snapchat's "Smart placement" (auto-optimized delivery across placements) instead of the fixed default, without losing that in-app management capability. Turns out you can't have both.

## Evidence (three independent live tests, same result every time)

We built a self-cleaning diagnostic — creates real paused test ad squads in a live ad account, exercises them, deletes them — rather than trusting docs or a single anecdotal test. Three separate experiments all converged on the same answer:

1. **Sending `placement_v2` in the squad creation POST** (`{config: "AUTOMATIC"}`, or `CUSTOM` with explicit positions): squad creates fine, but every subsequent `PUT` (e.g. changing daily budget) fails with:
   ```
   Error code: E2025, message: Update is not supported for this entity :
   [AdSquad was created with placement v2, please update the placement in Ads Manager]
   ```
2. **`{config: "CONTENT"}`** is rejected outright at creation (`E39400: Placement config must be AUTOMATIC or CUSTOM`) — not a documented enum value despite appearing to work in some UI flows.
3. **`CUSTOM` placement requires `CHAT_FEED`** in the position list for certain optimization goals (`E21011`), enforced since Nov 27, 2025 — but `CHAT_FEED` is separately disallowed for Dynamic Product Ads, making CUSTOM placement impossible for catalogue/DPA squads regardless of the lock issue.
4. **The decisive test:** create a squad with *no* `placement_v2` (confirmed API-editable), then edit its placements manually in **Snapchat Ads Manager** (not via our API at all), then retry the same API `PUT`. Result: identical `E2025` lock. So the lock isn't about *how* the API payload is shaped — it's Snapchat's system flagging the entity as "placement was configured" (by any actor) and refusing further API writes to it, full stop.

Snap Support (see the linked research doc) suggested the lock might be resolvable by GET-ing the current `placement_v2` and echoing it back on every PUT — that didn't hold up either: `GET /adsquads/{id}` never returns `placement_v2` at all, so there's nothing to echo, and the PUT fails identically with or without attempting it.

## Current behavior / product decision

We didn't want to silently choose one tradeoff for all users, so we shipped it as an explicit **per-preset opt-in** ("Smart placement" toggle):

- **Off (default):** ad squad launches on Snapchat's default placement, fully editable from our dashboard (budget/bid/pause). No functional change from before this investigation.
- **On:** ad squad launches with `placement_v2: {config: "AUTOMATIC"}`. Our UI shows a warning that the squad will need to be managed in Snapchat Ads Manager thereafter — budget/bid/pause edits from our dashboard will fail with a clear message instead of a confusing raw API error.

No code path lets a squad be both custom-placed and API-editable — that state doesn't exist on Snapchat's side as far as we can tell.

## Open questions if you're talking to anyone at Snap

1. Is E2025-on-touched-placement an intentional permanent lock, a bug, or an artifact of API version (v1 batch endpoints) that a newer endpoint avoids?
2. Why does `GET /adsquads/{id}` never return `placement_v2`, even for squads created with it set?
3. Is there *any* supported way (a different endpoint, a flag, a support-ticket-only override) to update budget/bid/status on a placement-locked squad?
