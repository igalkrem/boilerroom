# Snapchat API — placement_v2 Research & Findings

**Date:** June 2026  
**Researcher:** BoilerRoom / Igal Kremer  
**Accounts tested:** `75774d2e-c3e2-4e9c-a56a-3e13fbc2127e`, `082c59b3-9047-40bb-b79c-ce5c0723a722`  
**Campaigns tested:** `9883d6ed-6435-458a-bc32-8dd8b23c7ce6`, `6c66d7e9-fd64-406a-814b-2a61150984d6`

---

## Background

BoilerRoom creates Snapchat ad squads programmatically via the Marketing API. We discovered that squads were landing on **Manual / Content** placement by default (Stories & Spotlight + Publisher Stories), rather than **Smart placement (AUTOMATIC)**. We investigated whether we could set a better placement at creation time without breaking the ability to update budget/bid/status via API later.

---

## What the Snapchat UI Shows vs. What the API Returns

When a squad is created without any `placement_v2` field:

- **Snapchat UI:** Shows "Manual" placement with specific positions checked (not Smart placement)
- **API GET response:** Returns `"placement": "UNSUPPORTED"` (the old v1 field, which can no longer represent v2 placements)
- **API GET response:** Returns `placement_v2: undefined` — the field is **not returned** on GET even when it was set at creation

This discrepancy caused initial confusion. The `placement` field being `"UNSUPPORTED"` does **not** mean Smart placement — it means the old field can't represent the v2 state.

---

## Default Placement Behavior

Creating a squad **without** `placement_v2`:
- Snapchat assigns **Manual / Content** internally
- UI shows: Manual → Content → Stories & Spotlight (Between content: User Stories ✓, Publisher & Creator Stories ✓) + Within content: Publisher Stories ✓
- Spotlight, Creator Stories, Discover feed, Camera are **not** checked by default

---

## Placement Options Tested

### Option 1: No `placement_v2` (current BoilerRoom default)
| Step | Result |
|------|--------|
| POST (create) | ✓ Success |
| GET | `placement_v2` not returned |
| PUT (budget change) | ✓ **SUCCESS — squad is UNLOCKED** |

**Conclusion:** Safe. Squad can be updated via API. Lands on Manual/Content placement.

---

### Option 2: `placement_v2: { config: "CUSTOM", snapchat_positions: [...] }` without CHAT_FEED
| Step | Result |
|------|--------|
| POST (create) | ✗ **E21011** — "For this optimization goal, you must have chat feed placement selected" |

**Conclusion:** Rejected at creation. CHAT_FEED is mandatory for PIXEL_PURCHASE squads since Snap enforced it on **27 November 2025**.

---

### Option 3: `placement_v2: { config: "CUSTOM", platforms: ["SNAPCHAT"], snapchat_positions: [...all including CHAT_FEED] }`
| Step | Result |
|------|--------|
| POST (create) | ✓ Success — `placement_v2` returned in create response |
| GET after creation | `placement_v2: undefined` — not returned by GET |
| PUT without `placement_v2` in body | ✗ **E2025** — "Update is not supported for this entity: AdSquad was created with placement v2, please update the placement in Ads Manager" |
| PUT with `placement_v2` echoed back in body | ✗ **E2025** — same error |

**Conclusion:** Squad is **permanently locked** once created with `placement_v2`. Neither including nor omitting `placement_v2` in the PUT body resolves E2025.

---

### Option 4: `placement_v2: "AUTOMATIC"` (Smart placement) at creation
- Previously tested: also causes **E2025** lock
- Confirmed broken both at POST time and PATCH time

---

## Key Errors Encountered

| Error | Message | Cause |
|-------|---------|-------|
| E2025 | "Update is not supported for this entity: AdSquad was created with placement v2, please update the placement in Ads Manager" | Squad was created with any `placement_v2` value — permanently locked |
| E21011 | "For this optimization goal, you must have chat feed placement selected" | CUSTOM placement without CHAT_FEED; enforced since Nov 27 2025 |
| E2845 | "Placement platform must contain SNAPCHAT" | CUSTOM placement without `platforms: ["SNAPCHAT"]` in payload |
| E1008 | "Ad squad type must be GEO_FILTER or SCT_ID" | POSTing squad to wrong endpoint (`/adaccounts/{id}/adsquads` instead of `/campaigns/{id}/adsquads`) |
| E4001 | "Failed to copy over @DaoImmutable property productProperties.catalogVertical" | Known Snapchat server-side bug on certain accounts; unrelated to placement |

---

## Snap Support Response (June 2026)

Snap support suggested that E2025 might be caused by **not including `placement_v2` in the PUT body** rather than a true lock, and asked us to:
1. GET the squad to retrieve the current `placement_v2`
2. Echo it back in every subsequent PUT

**Our test results refuted this:**
- GET does not return `placement_v2` — there is nothing to echo back
- PUT with `placement_v2` included → E2025
- PUT without `placement_v2` → E2025 (same)
- The error message explicitly says: *"AdSquad was created with placement v2, please update the placement in Ads Manager"*

Snap also asked to confirm whether the issue is limited to campaign `dcfae5c2-dd5c-4ab9-84b6-f471ff71342e`. It is **not** — we reproduced E2025 on multiple campaigns across multiple ad accounts.

---

## CHAT_FEED Enforcement (Since Nov 27, 2025)

Per official Snap developer announcements: from 27 November 2025, Snapchat enforces inclusion of `CHAT_FEED` in any custom placement configuration for specific optimization goals including `PIXEL_PURCHASE`. Squads omitting it from a CUSTOM config are rejected at creation time with E21011.

This means the minimum viable CUSTOM placement payload for a PIXEL_PURCHASE squad is:
```json
"placement_v2": {
  "config": "CUSTOM",
  "platforms": ["SNAPCHAT"],
  "snapchat_positions": [
    "INTERSTITIAL_USER",
    "INTERSTITIAL_CONTENT",
    "INTERSTITIAL_SPOTLIGHT",
    "INSTREAM",
    "PUBLIC_STORIES_INSTREAM",
    "FEED",
    "CHAT_FEED"
  ]
}
```
...but sending this locks the squad permanently against API updates (E2025).

---

## Correct API Endpoints

| Operation | Endpoint |
|-----------|----------|
| Create ad squad | `POST /campaigns/{campaignId}/adsquads` |
| Update ad squad | `PUT /campaigns/{campaignId}/adsquads` |
| Get single ad squad | `GET /adsquads/{adSquadId}` |
| List squads by account | `GET /adaccounts/{adAccountId}/adsquads` |

**Common mistake:** POSTing to `/adaccounts/{id}/adsquads` returns E1008 "Ad squad type must be GEO_FILTER or SCT_ID" — this is the wrong create endpoint.

---

## Summary & Current BoilerRoom Decision

| Approach | Creates OK | API updatable (budget/bid/status) | UI placement shown |
|----------|------------|-----------------------------------|--------------------|
| No `placement_v2` (current) | ✓ | ✓ | Manual / Content |
| CUSTOM + all positions | ✓ | ✗ (E2025 — permanently locked) | Manual / All positions |
| AUTOMATIC (Smart placement) | ✓ | ✗ (E2025 — permanently locked) | Smart placement |

**Current BoilerRoom behavior:** Create squads without `placement_v2`. Squads land on Manual/Content. Budget, bid, and status can all be updated via API. This is the only approach that keeps squads manageable via API.

**If Smart placement or Manual+All is needed:** Must be changed manually in Ads Manager UI after creation. Cannot be achieved via API without permanently losing the ability to update the squad programmatically.

---

## Open Questions for Snap Support

1. Is E2025 on placement_v2 squads a known permanent limitation or a bug?
2. Is there any API path to update budget/bid/status on squads created with `placement_v2`?
3. Why does GET `/adsquads/{id}` not return the `placement_v2` field when it was set at creation?
4. Is the lock specific to certain API versions or all v1 endpoints?
