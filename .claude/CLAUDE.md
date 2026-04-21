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
- **Video:** ffmpeg.wasm (lazy-loaded ~30 MB) for browser-side transcoding to 720×1280 H.264/AAC
- **API:** Snapchat Marketing API v1 — all calls are server-side only, proxied through Next.js API routes

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
```

## Project Structure

```
src/
├── app/
│   ├── (auth)/                        # Login & OAuth callback pages
│   ├── api/
│   │   ├── auth/                      # login, logout, refresh, session, callback
│   │   └── snapchat/
│   │       ├── campaigns/
│   │       ├── adsquads/
│   │       ├── creatives/
│   │       ├── ads/
│   │       ├── ad-accounts/
│   │       ├── profiles/              # GET ?adAccountId= → first profile_id for creative payload
│       └── media/                 # upload-init, upload-chunk, upload-finalize, upload (image), poll
│   └── dashboard/
│       ├── [adAccountId]/create/      # 4-step wizard
│       ├── pixels/                    # Pixel CRUD UI (new/[id]/edit)
│       └── presets/                   # Campaign preset CRUD UI (new/[id]/edit/[id]/use)
├── components/
│   ├── wizard/
│   │   ├── steps/                     # Step1–Step4 form components
│   │   ├── WizardShell.tsx            # Orchestrates the 4-step flow
│   │   ├── StepIndicator.tsx
│   │   ├── SubmissionProgress.tsx
│   │   └── LoadPresetBanner.tsx
│   ├── pixels/                        # PixelForm component
│   └── presets/                       # Preset management components
├── hooks/
│   └── useWizardStore.ts              # Zustand store (all wizard state)
├── lib/
│   ├── snapchat/                      # Server-side API client (campaigns, adsquads, creatives, media, profiles, auth)
│   ├── submission-orchestrator.ts     # Sequences: uploadMedia → campaigns → ad sets → creatives → ads
│   ├── uploadMediaToSnapchat.ts       # Client-side upload pipeline (5 MB chunks, parallel); called by orchestrator
│   ├── presets.ts                     # Preset CRUD (localStorage, key: boilerroom_presets_v1)
│   ├── pixels.ts                      # Pixel CRUD (localStorage, key: boilerroom_pixels_v1)
│   ├── session.ts                     # iron-session helpers & auth validation
│   └── rate-limiter.ts
└── types/
    ├── wizard.ts                      # Form types (CampaignFormData, AdSquadFormData, CreativeFormData)
    ├── snapchat.ts                    # API payload types (SnapCampaignPayload, etc.)
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
- **Media upload (deferred):** Step 3 only transcodes/resizes locally — no Snapchat API calls. The actual upload happens at submission time in the `uploadMedia` stage. `lib/uploadMediaToSnapchat.ts` handles the full pipeline: `POST /api/snapchat/media` (create entity) → multipart-upload-v2 (INIT → parallel 4 MB chunks → finalize) → poll for processing. Poll timeout: 2s × 90 attempts = 3 minutes. All creatives upload in parallel across files. Chunk size is 4 MB (not 5 MB) to stay under Vercel's 4.5 MB serverless function payload limit. File names are sanitized to `[a-zA-Z0-9._\-]` before the media entity POST — Snapchat rejects names with spaces, unicode, or special chars (E1001). **Polling is client-side:** `/api/snapchat/media/poll` does a single status check per call; the retry loop (90 × 2s) lives in `uploadMediaToSnapchat.ts` — never inside a Vercel serverless function (which would time out at ~60s). Image uploads via `/api/snapchat/media/upload` do not need polling.
- **Video transcoding:** ffmpeg.wasm loads on demand in the browser. Converts uploaded video to 720×1280 H.264/AAC (yuv420p, Main profile) before the file is stored in the wizard store. Transcode happens in Step 3; upload happens at submit time.
- **All Snapchat API calls are server-side.** Never call the Snapchat Marketing API from the browser.

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
- Ad `type` is always `SNAP_AD` — `WEB_VIEW`, `DEEP_LINK`, and `APP_INSTALL` are **not** valid Ad type values (E2002). The creative type determines rendering behavior; the ad type is always SNAP_AD.
- Interaction type is hardcoded to WEB_VIEW — the dropdown is hidden from the UI. The `interactionType` field still exists in the store and orchestrator to drive URL property selection. **Both creative `type` and ad `type` are always `"SNAP_AD"`** — `INTERACTION_TYPE_MAP["WEB_VIEW"] = "SNAP_AD"`. Web view behaviour comes from `web_view_properties.url` on the creative. Snapchat renders a default "More" swipe-up label automatically. **Do NOT use `"WEB_VIEW"` as creative type** — E1008 ("Ad with ad type SNAP_AD does not match creative with type WEB_VIEW") is a confirmed hard API constraint; there is no valid Ad type to pair with WEB_VIEW creative because WEB_VIEW is also not a valid Ad type (E2002). **Do NOT send `call_to_action` on SNAP_AD creatives** — E2002 "call to action must be null". The CTA dropdown in Step 3 has no effect for the current WEB_VIEW ads (it is only sent for DEEP_LINK/APP_INSTALL creative types).
- Batch error responses: Snapchat returns errors in `sub_request_error_reason` (not `error_type`/`message`) for validation failures. All four batch-create libs read this field as a fallback.
- Ad squad geo targeting: `targeting.geos` (NOT `geo_locations`) — array of `{ country_code: string }` with **lowercase** country codes (e.g., `"us"`, not `"US"`). Wrong field name or uppercase codes cause E1001.
- Ad squad device targeting: `devices[].device_type` is `"MOBILE"` or `"WEB"`. When device = MOBILE, an optional `os_type` field (`"iOS"` or `"ANDROID"`) can be set — shown as a conditional "OS" dropdown in Step 2. Omitting `os_type` targets all OSes.
- Fields intentionally omitted from payloads and **removed from the TypeScript types**: `frequency_cap_max_impressions`, `frequency_cap_time_period`, `shareable`. Do not re-add them to `SnapAdSquadPayload` or `SnapCreativePayload`. Also hardcoded/not user-facing: `pacing_type` (always `"STANDARD"`), `targeting_age_min`, `targeting_age_max`. `profile_properties` is required on creatives (E2652 if absent, E2006 if `profile_id` is null); type is `{ profile_id: string }` — not optional, no `Record<string, unknown>` union. The orchestrator auto-fetches the first profile_id via `GET /api/snapchat/profiles?adAccountId=...` before the creatives stage; if unresolvable, it returns early with errors instead of proceeding without the field.
- Batch API response order is not guaranteed — the orchestrator matches results by `name` with positional-index fallback (`find(r => r.name === x) ?? results[i]`). Both layers are required. Do not simplify to name-only or index-only.
