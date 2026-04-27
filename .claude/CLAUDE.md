# BoilerRoom — CLAUDE.md

Codebase instructions for Claude Code. Read this before making changes.

## What This Is

SnapAds Manager: a bulk Snapchat ad campaign creation platform. Users connect via Snapchat OAuth2 and create Campaigns, Ad Sets, and Ads in bulk through a 4-step wizard.

**Live:** https://boilerroom-two.vercel.app  
**Deploy:** Vercel — `npx vercel --prod` (GitHub auto-deploy is unreliable; trigger manually after pushing).

## Agents

- **`code-reviewer`** — functional correctness: bugs, type safety, error handling, data flows. Run before any PR.
- **`security-audit`** — auth, SSRF, access control, secrets, OWASP. Run before any deploy or when new API routes are added.
- **`snapchat-api-auditor`** — Snapchat API spec compliance: payload field names vs live docs, forbidden fields, invalid enums. Run before any deploy or after a Snapchat API update.

## Stack

- **Framework:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Auth:** Snapchat OAuth2 + iron-session (encrypted HttpOnly cookies)
- **Forms:** react-hook-form + Zod
- **State:** Zustand (`useWizardStore`)
- **Storage:** Vercel Blob (`@vercel/blob`) — client-side uploads, public access, store: `boilerroom-silo`. Also used for persistent metadata storage (see KV Sync below).
- **Database:** Neon Postgres via `@vercel/postgres` (`POSTGRES_URL` env var) — used exclusively for the performance dashboard reporting cache. 3 tables: `snapchat_ad_squad_stats`, `kingsroad_report`, `report_sync_log`. Migrations run automatically on first `/api/reporting/sync` call via `runMigrations()` in `src/lib/db/index.ts`. **Note:** `@vercel/postgres` is deprecated upstream — migrate to `@neondatabase/serverless` when convenient.
- **API:** Snapchat Marketing API v1 — all calls are server-side only, proxied through Next.js API routes
- **KingsRoad API:** `https://partnerhub-api.kingsroad.io/api/v3` — sell-side revenue reporting. Bearer token in `KINGSROAD_API_TOKEN`. Paginated `/report/` endpoint, page_size=2000. Used only server-side in `/api/reporting/sync`.

## Running Locally

Node.js must be loaded via NVM:

```bash
source ~/.nvm/nvm.sh && npm run dev
```

Snapchat OAuth requires HTTPS — run a tunnel in a second terminal:

```bash
cloudflared tunnel --url http://localhost:3000
```

Use the cloudflared URL as the redirect URI in `.env.local` and in the Snap OAuth app settings.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
SNAPCHAT_CLIENT_ID
SNAPCHAT_CLIENT_SECRET
SNAPCHAT_REDIRECT_URI    # https://<tunnel-or-vercel-url>/api/auth/callback
NEXT_PUBLIC_APP_URL      # https://<tunnel-or-vercel-url>
SESSION_SECRET           # 64-char hex: openssl rand -hex 32
SESSION_COOKIE_NAME      # snap_ads_session
SNAPCHAT_API_BASE_URL    # https://adsapi.snapchat.com/v1
SNAPCHAT_AUTH_URL        # https://accounts.snapchat.com/login/oauth2/authorize
SNAPCHAT_TOKEN_URL       # https://accounts.snapchat.com/login/oauth2/access_token
BLOB_READ_WRITE_TOKEN    # from Vercel Dashboard → Storage → boilerroom-silo → .env.local tab
KINGSROAD_API_TOKEN      # Bearer token from KingsRoad Profile → API Credentials tab
POSTGRES_URL             # set automatically by: npx vercel env pull .env.local (after linking Neon in Vercel Storage)
```

## Project Structure

```
src/
├── app/
│   ├── (auth)/                        # Login & OAuth callback pages
│   ├── api/
│   │   ├── auth/                      # login, logout, refresh, session, callback
│   │   ├── data/                      # GET/POST — reads/writes user-scoped JSON blobs for persistent metadata
│   │   ├── reporting/
│   │   │   ├── sync/                  # POST {adAccountId, startDate, endDate} — fetches Snapchat stats + KingsRoad data, upserts into Postgres; skips finalized dates, re-fetches recent dates at most once/hour
│   │   │   └── combined/              # GET ?adAccountId&startDate&endDate&country — JOIN query returning merged metrics with EUR→USD conversion
│   │   ├── silo/
│   │   │   ├── upload/                # Vercel Blob client-upload token endpoint (handleUpload)
│   │   │   └── delete/                # DELETE handler — removes blobs by URL array
│   │   └── snapchat/
│   │       ├── campaigns/
│   │       ├── adsquads/
│   │       ├── creatives/
│   │       ├── ads/
│   │       ├── ad-accounts/
│   │       ├── profiles/              # GET ?adAccountId= → first profile_id for creative payload
│   │       └── media/                 # upload-init, upload-chunk, upload-finalize, upload (image + small video ≤4.4 MB), upload-from-blob (server fetches Blob → Snapchat, any size), poll, copy
│   └── dashboard/
│       ├── [adAccountId]/create/      # 4-step wizard
│       ├── pixels/                    # Pixel CRUD UI (new/[id]/edit)
│       ├── presets/                   # Campaign preset CRUD UI (new/[id]/edit/[id]/use)
│       ├── performance/               # Global performance dashboard (top-nav link)
│       └── silo/                      # Media library
│           ├── page.tsx               # Library grid with search/filter/delete
│           ├── upload/                # Upload page with tag selector + SiloUploader
│           └── tags/                  # Tag CRUD (create, edit, delete)
├── components/
│   ├── wizard/
│   │   ├── steps/                     # Step1–Step4 form components
│   │   ├── WizardShell.tsx            # Orchestrates the 4-step flow
│   │   ├── StepIndicator.tsx
│   │   ├── SubmissionProgress.tsx
│   │   └── LoadPresetBanner.tsx
│   ├── silo/
│   │   ├── SiloUploader.tsx           # Batch uploader: hash → optimize → Blob upload (3 concurrent)
│   │   ├── SiloBrowser.tsx            # Picker modal for Step 3 wizard integration
│   │   ├── AssetCard.tsx              # Thumbnail card with quick actions
│   │   ├── AssetPreviewModal.tsx      # Full preview + metadata + usage history
│   │   └── SnapchatUploadModal.tsx    # Pre-upload asset to Snapchat ad accounts (2 concurrent)
│   ├── layout/
│   │   ├── AuthGuard.tsx
│   │   ├── TopNav.tsx
│   │   └── KVHydrationProvider.tsx    # On dashboard mount: hydrates localStorage from Vercel Blob; blocks render on fresh session until data loaded
│   ├── performance/
│   │   ├── PerformanceTable.tsx       # Sortable table aggregated by ad squad + country; click row → DrilldownModal
│   │   └── DrilldownModal.tsx         # Per-ad-squad daily breakdown table with totals row
│   ├── pixels/                        # PixelForm component
│   └── presets/                       # Preset management components
├── hooks/
│   └── useWizardStore.ts              # Zustand store (all wizard state)
├── lib/
│   ├── snapchat/                      # Server-side API client (campaigns, adsquads, creatives, media, profiles, auth, stats)
│   ├── submission-orchestrator.ts     # Sequences: uploadMedia → campaigns → ad sets → creatives → ads
│   ├── uploadMediaToSnapchat.ts       # Client-side upload pipeline + uploadBlobToSnapchat (server-side path for Silo uploads)
│   ├── silo.ts                        # Silo asset CRUD (localStorage + KV sync, key: boilerroom_silo_v1)
│   ├── silo-tags.ts                   # Tag CRUD + auto-naming (localStorage + KV sync, key: boilerroom_silo_tags_v1)
│   ├── silo-utils.ts                  # Browser utils: hash, optimizeImage, generateThumbnail, getVideoDuration
│   ├── presets.ts                     # Preset CRUD (localStorage + KV sync, key: boilerroom_presets_v1)
│   ├── pixels.ts                      # Pixel CRUD (localStorage + KV sync, key: boilerroom_pixels_v1)
│   ├── kv-sync.ts                     # hydrateFromKV(key) + syncToKV(key, data) — debounced 1.5s writes to /api/data
│   ├── db/
│   │   ├── index.ts                   # sql helper + runMigrations() (idempotent, runs once per process)
│   │   └── migrations.sql             # CREATE TABLE IF NOT EXISTS for all 3 reporting tables
│   ├── country-map.ts                 # countryNameToCode / countryCodeToName — normalises KingsRoad country_name ↔ Snapchat ISO-2
│   ├── fx-rate.ts                     # getEurToUsd() — fetches frankfurter.app, cached 1h in module memory
│   ├── kingsroad.ts                   # fetchKingsRoadReport(startDate, endDate) — paginated KingsRoad /report/ client
│   ├── session.ts                     # iron-session helpers & auth validation
│   └── rate-limiter.ts
└── types/
    ├── wizard.ts                      # Form types (CampaignFormData, AdSquadFormData, CreativeFormData)
    ├── snapchat.ts                    # API payload types (SnapCampaignPayload, etc.)
    ├── silo.ts                        # SiloAsset, SiloTag, SnapchatUploadStatus, SnapchatUploadStage
    ├── preset.ts                      # CampaignPreset type
    ├── pixel.ts                       # SavedPixel type
    └── session.ts
```

## Architecture Notes

- **OAuth flow:** `/api/auth/*` routes handle token exchange and refresh; tokens live in an iron-session HttpOnly cookie.
- **Wizard state:** Zustand store (`useWizardStore`) holds all 4-step data in memory. `WizardShell` uses a `presetKey` to force react-hook-form remounts after preset loading.
- **Submission orchestrator:** `lib/submission-orchestrator.ts` runs five stages in sequence: (1) **uploadMedia** — all creatives upload in parallel via `uploadMediaToSnapchat`; (2) campaigns; (3) ad sets; (4) creatives; (5) ads. Each stage's results are tracked individually. A creative whose upload fails is skipped in later stages without aborting the rest. `pacing_type` is hardcoded to `"STANDARD"` in the orchestrator — it is not a user-facing field. Before the creatives stage, the orchestrator fetches the ad account's Snapchat Public Profile ID via `GET /api/snapchat/profiles?adAccountId=...` and includes it in every creative payload as `profile_properties: { profile_id: "..." }` — required by Snapchat (E2652 if field absent, E2006 if profile_id null). **If the profile ID cannot be resolved (all API endpoints fail and `SNAPCHAT_PROFILE_ID` env var is not set), the orchestrator records a structured error for every creative and returns early — campaigns and ad squads already created are left as-is.** **Batch response matching:** Snapchat does not consistently echo `name` in response objects. The orchestrator uses name-match with positional-index fallback (`find(r => r.name === x) ?? results[i]`). Pure name-only matching silently breaks when Snapchat omits the name field; pure positional-only breaks on reorder. Both layers are required. When Snapchat returns fewer result objects than submitted items (partial batch failure), the missing entries record `"No result returned from API"` as the error.
- **Campaign presets:** Users save campaign + ad set templates (no names — filled in the wizard). Preset loading clamps both `startDate` and `endDate` to the future via `ensureFutureDate` — stale dates from old presets are silently promoted to today. Start date can be "immediate" (undefined). `pixelId` is normalised to `undefined` (not `""`) on preset load. Managed under `/dashboard/presets`.
- **Pixels:** Users register Snap Pixel IDs once under `/dashboard/pixels` (localStorage). Step 2 shows a pixel selector; `pixel_id` is required only when the optimization goal is `PIXEL_PAGE_VIEW` or `PIXEL_PURCHASE`. Only `pixel_id` is sent on the ad squad payload — `pixel_conversion_event` is NOT a valid Snapchat field and is not in the codebase.
- **Duplicate buttons:** Store exposes `duplicateCampaign()`, `duplicateAdSquad()`, `duplicateCreative()`. Duplicated creatives reset `mediaId`/`mediaFile`/`uploadStatus` so media must be re-attached. `mediaFile` (the `File` object) is cleared alongside `mediaId` on duplicate.
- **Media upload (deferred):** Step 3 resizes images locally (canvas → 1080×1920 JPEG) — no Snapchat API calls. Videos are passed through as-is (no transcoding). The actual upload happens at submission time in the `uploadMedia` stage. Two upload functions exist in `lib/uploadMediaToSnapchat.ts`:
  - **`uploadBlobToSnapchat(blobUrl, fileName, adAccountId, mediaType)`** — used by `SnapchatUploadModal` for all Silo uploads regardless of size. The server fetches the file from Vercel Blob (server-to-server, no Vercel body limit applies) and posts it to Snapchat's simple upload endpoint (`POST /api/snapchat/media/upload-from-blob`). Snapchat marks media `READY` immediately — no polling ever needed. SSRF guard: `blobUrl` must end with `.vercel-storage.com`. The sanitized `fileName` is passed to the route and included as the filename in the FormData part (`form.append("file", blob, fileName)`) — Snapchat returns 400 if the multipart part has no filename.
  - **`uploadMediaToSnapchat(file, adAccountId, mediaType)`** — used by the submission orchestrator for wizard uploads (local `File` object). **Size-based routing**: files ≤ 4.4 MB → simple single-POST (`POST /api/snapchat/media/upload`, READY immediately); files > 4.4 MB → chunked multipart-upload-v2 (INIT → 2 parallel 4 MB chunks → FINALIZE → poll until `READY`). The 4.4 MB simple-upload threshold (not 4 MB) leaves headroom under Vercel's 4.5 MB incoming request limit. Chunk size is a separate 4 MB constant. **Polling is client-side:** the retry loop (150 × 2s = 5 min) lives in `uploadMediaToSnapchat.ts`; if it exhausts without `READY`, `PollTimeoutError` is thrown — caller stores the `mediaId` in `processing` stage and shows a "Check" button. Chunked upload routes (`upload-init`, `upload-chunk`, `upload-finalize`) use `rateLimitedFetch` which retries 429s with exponential backoff (2s, 4s, 8s, 16s).
  - File names are sanitized to `[a-zA-Z0-9._\-]` before every media entity POST AND in the INIT `file_name` field — Snapchat rejects names with spaces, unicode, or special chars (E1001) on both calls. **Videos must be H.264 MP4** — no client-side transcoding.
- **All Snapchat API calls are server-side.** Never call the Snapchat Marketing API from the browser.
- **Silo — media library:** Users upload images/videos once to Vercel Blob and reuse them across campaigns. Asset metadata (URLs, tags, Snapchat upload state) lives in localStorage (`boilerroom_silo_v1`). Tags auto-name files with a prefix + zero-padded index (e.g. `smbs_v_001`). The upload pipeline: SHA-256 hash (duplicate detection) → canvas resize/thumbnail → `upload()` from `@vercel/blob/client` direct to Blob (bypasses Vercel's 4.5 MB serverless limit) — token issued by `/api/silo/upload`. 3 files upload concurrently. Snapchat mediaIds are cached per-ad-account in `snapchatUploads[]` on each asset — if a `ready` mediaId exists for the current ad account, Step 3 skips the Snapchat upload entirely at submission time. Cross-account reuse tries `media_copy` first (`/api/snapchat/media/copy`) — same org → instant copy, no re-upload; different org → falls back to `uploadBlobToSnapchat` (server-side re-upload). `SnapchatUploadStage` is written to localStorage at every transition so status survives page navigation. The `SnapchatUploadModal` lets users pre-upload assets to selected ad accounts from the library (2 concurrent) — it calls `uploadBlobToSnapchat` directly, never downloading the file to the browser. WizardShell post-submission hook caches new mediaIds and records usage history in Silo assets.
- **KV Sync — persistent metadata storage:** All four localStorage-backed stores (`silo.ts`, `silo-tags.ts`, `pixels.ts`, `presets.ts`) call `syncToKV(key, data)` from `lib/kv-sync.ts` on every write. `syncToKV` is debounced 1.5s and fires a `POST /api/data` in the background — fire-and-forget, never blocks the UI. Blob paths are `metadata/{snapUserId}/{key}.json` (user-scoped). On every dashboard mount, `KVHydrationProvider` fetches all 4 keys via `GET /api/data?key=...`: if localStorage is empty (new browser/cleared storage) it shows a spinner and blocks until KV data is loaded; if localStorage already has data it renders immediately and merges in the background (union by ID — picks up records from other browsers without overwriting local changes). The `/api/data` route validates the session and scopes paths to `session.snapUserId` — users cannot read or write each other's data.
- **Silo → wizard Back-navigation invariant:** `pendingMediaFiles` is a module-level `Map<creativeId, File>` in `Step3Creatives.tsx` — cleared on component unmount. `siloSelections` is local React state — reset on remount. When the user navigates Back from Step 4 → Step 3, both are empty. `onNext` therefore falls back to `existingCreative?.mediaFile` from the Zustand store. On mount, the component also restores `siloSelections` from `creatives[].siloAssetId` via `getAssetById` so the Silo asset card re-renders correctly. **Never remove this fallback** — without it, `mediaIdMap` stays empty and the orchestrator returns silently after the ad squads stage, skipping profiles + creatives + ads entirely.

- **Performance dashboard:** `/dashboard/performance` — global page (all accounts via selector). Attribution: `snapchat_ad_squad_stats.ad_squad_id = kingsroad_report.custom_channel_name`. Sync flow: `POST /api/reporting/sync` checks `report_sync_log` per date — finalized dates (>1 day old) are never re-fetched; dates within the last 24h are re-fetched at most once per hour. Combined query: LEFT JOIN on (ad_squad_id, date, country_code), returns spend in USD + revenue in EUR converted to USD via Frankfurter exchange rate. ROI = `(revenue_usd - spend_usd) / spend_usd × 100%`. Country normalization: KingsRoad `country_name` (e.g. `"UNITED STATES"`) → ISO-2 code via `countryNameToCode()` at ingest time; Snapchat stats use ISO-2 natively. **`getCampaigns(adAccountId)` and `getAdSquads(campaignId)` were added to the existing Snapchat client files** — used both by the sync route (to enumerate all ad squads) and the combined route (to resolve ad squad names). The performance routes require `isAdAccountAllowed` to pass — the account selector on the page calls `/api/snapchat/ad-accounts` first, which populates `session.allowedAdAccountIds`.

## Security Notes

- **`isAdAccountAllowed` denies by default:** When `session.allowedAdAccountIds` is empty (fresh session before dashboard loads), the function returns `false`. It is populated by `/api/snapchat/ad-accounts` — all Snapchat API routes that accept an `adAccountId` must call this check. Do NOT revert the default to `true`.
- **`/api/data` is user-scoped:** Blob paths are `metadata/{snapUserId}/{key}.json`. Never use a shared path — any change that removes the `snapUserId` namespace lets any user overwrite another's data. Valid keys are whitelisted: `br_silo_assets`, `br_silo_tags`, `br_pixels`, `br_presets`.
- **`media/upload` and `media/poll` require ownership checks:** Both routes call `isAdAccountAllowed` before forwarding to Snapchat. Do not remove these checks when refactoring the media pipeline.
- **`media/copy` checks both source and destination:** An ownership check on destination only would let any authenticated user exfiltrate media from accounts they don't own. Both `sourceAdAccountId` and `destinationAdAccountId` must be verified.
- **`media/upload-from-blob` SSRF guard:** The `blobUrl` field is validated to only allow hostnames ending in `.vercel-storage.com` before the server-side fetch. Do not relax this to arbitrary URLs — it would allow the server to make authenticated Snapchat uploads on behalf of any URL the attacker controls.
- **Snapchat error bodies are not forwarded verbatim:** Routes should `console.error` full error details and return `{ error: "internal_error" }` to the client. Do not propagate raw `String(err)` in 5xx responses.

## Snapchat API Field Notes

- Campaign objective: `objective_v2_properties.objective_v2_type` is always `"SALES"` — hardcoded in the orchestrator and hidden from the UI. `CampaignObjective` type is the literal `"SALES"`.
- Campaign budget: only `daily_budget_micro` is supported (`spendCapType: "DAILY_BUDGET" | "NO_BUDGET"`). Lifetime budget is not used at the campaign level. Minimum: $20 (20,000,000 micro). Ad squads still support both daily and lifetime.
- `lifetime_spend_cap_micro` and `lifetime_budget_micro` are NOT sent on campaigns and are NOT present on `SnapCampaignPayload`. `lifetime_budget_micro` is ad-squad only.
- `spend_cap_type` is an ad squad field only, not valid on campaigns
- Ad squad `delivery_constraint` is required — set to `"DAILY_BUDGET"` or `"LIFETIME_BUDGET"` based on `spendCapType`. `conversion_location` is NOT a valid ad-squad API field (causes E1001); do not add it.
- Valid optimization goals (SALES + WEB): `PIXEL_PURCHASE`, `PIXEL_SIGNUP`, `PIXEL_ADD_TO_CART`, `PIXEL_PAGE_VIEW`, `LANDING_PAGE_VIEW`. These are the only values in the `OptimizationGoal` type and the Step 2 dropdown. Do not add goals from other objectives (SWIPES, IMPRESSIONS, etc.) — they will return E2844 with the SALES campaign objective.
- Ad squad pixel tracking: only `pixel_id` is sent, always optional. `pixel_conversion_event` is NOT a valid Snapchat ad squad API field (causes E1001).
- Creative destination URL: `web_view_properties.url` (for WEB_VIEW) or `deep_link_properties.deep_link_url` (for DEEP_LINK/APP_INSTALL)
- Ad destination URL: URL fields (`web_view_properties`, `deep_link_properties`) are NOT sent on the Ad payload — they live on the Creative only. The Ad payload only needs `ad_squad_id`, `creative_id`, `name`, `type`, `status`.
- Ad `type` for WEB_VIEW creatives is `"REMOTE_WEBPAGE"` (not `"SNAP_AD"`). Confirmed via cross-referencing a live Snapchat UI-created campaign: creative type `WEB_VIEW` pairs with ad type `REMOTE_WEBPAGE`. The previous `SNAP_AD`+`SNAP_AD` workaround was used because pairing `WEB_VIEW` creative with `SNAP_AD` ad returns E1008, and `WEB_VIEW` is not a valid ad type (E2002) — but `REMOTE_WEBPAGE` is valid. `AD_TYPE_MAP` in the orchestrator maps creative type → ad type: `WEB_VIEW → REMOTE_WEBPAGE`, all others → `SNAP_AD`.
- Interaction type is hardcoded to WEB_VIEW — the dropdown is hidden from the UI. The `interactionType` field still exists in the store and orchestrator to drive URL property selection. `INTERACTION_TYPE_MAP["WEB_VIEW"] = "WEB_VIEW"` (creative type). Web view behaviour comes from `web_view_properties.url` on the creative. **`call_to_action` is valid on `WEB_VIEW` creatives** — the CTA dropdown in Step 3 is active. Do NOT send `call_to_action` on `SNAP_AD` creatives (E2002 "call to action must be null") — the orchestrator already guards this with `creativeType !== "SNAP_AD"`.
- Batch error responses: Snapchat returns errors in `sub_request_error_reason` (not `error_type`/`message`) for validation failures. All four batch-create libs read this field as a fallback.
- Ad squad geo targeting: `targeting.geos` (NOT `geo_locations`) — array of `{ country_code: string }` with **lowercase** country codes (e.g., `"us"`, not `"US"`). Wrong field name or uppercase codes cause E1001.
- Ad squad device targeting: `devices[].device_type` is `"MOBILE"` or `"WEB"`. When device = MOBILE, an optional `os_type` field (`"iOS"` or `"ANDROID"`) can be set — shown as a conditional "OS" dropdown in Step 2. Omitting `os_type` targets all OSes.
- Fields intentionally omitted from payloads and **removed from the TypeScript types**: `frequency_cap_max_impressions`, `frequency_cap_time_period`, `shareable`. Do not re-add them to `SnapAdSquadPayload` or `SnapCreativePayload`. Also hardcoded/not user-facing: `pacing_type` (always `"STANDARD"`), `targeting_age_min`, `targeting_age_max`. `profile_properties` is required on creatives (E2652 if absent, E2006 if `profile_id` is null); type is `{ profile_id: string }` — not optional, no `Record<string, unknown>` union. The orchestrator auto-fetches the first profile_id via `GET /api/snapchat/profiles?adAccountId=...` before the creatives stage; if unresolvable, it returns early with errors instead of proceeding without the field.
- Batch API response order is not guaranteed — the orchestrator matches results by `name` with positional-index fallback (`find(r => r.name === x) ?? results[i]`). Both layers are required. Do not simplify to name-only or index-only.
