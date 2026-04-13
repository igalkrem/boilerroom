# BoilerRoom — CLAUDE.md

Codebase instructions for Claude Code. Read this before making changes.

## What This Is

SnapAds Manager: a bulk Snapchat ad campaign creation platform. Users connect via Snapchat OAuth2 and create Campaigns, Ad Sets, and Ads in bulk through a 4-step wizard.

**Live:** https://boilerroom-two.vercel.app  
**Deploy:** Vercel — push to `main` triggers auto-deploy.

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
│   │       └── media/                 # upload-init, upload-chunk, upload-finalize
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
│   ├── snapchat/                      # Server-side API client (campaigns, adsquads, creatives, media, auth)
│   ├── submission-orchestrator.ts     # Sequences: campaigns → ad sets → creatives → ads
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
- **Submission orchestrator:** `lib/submission-orchestrator.ts` batches API calls in sequence: campaigns → ad sets (squads) → creatives → ads. Tracks per-entity submission status.
- **Campaign presets:** Users save campaign + ad set templates (no names — filled in the wizard). Preset loading resets dates to future. Start date can be "immediate" (undefined). Managed under `/dashboard/presets`.
- **Pixels:** Users register Snap Pixel IDs once under `/dashboard/pixels` (localStorage). Step 2 requires selecting a pixel per ad set. `pixel_id` and `pixel_conversion_event` are sent on the ad squad payload.
- **Pixel conversion event:** Required when optimization goal is `PIXEL_PAGE_VIEW` or `PIXEL_PURCHASE`. A conditional "Conversion Event" dropdown appears in Step 2 (and optionally in presets).
- **Duplicate buttons:** Store exposes `duplicateCampaign()`, `duplicateAdSquad()`, `duplicateCreative()`. Duplicated creatives reset `mediaId`/`uploadStatus` so media must be re-uploaded.
- **Media upload:** Client-side validates files (4 MB minimum pre-check), then uses Snapchat's multipart-upload-v2 protocol via three API routes: `upload-init` → `upload-chunk` → `upload-finalize`. After finalize, polls for media processing with 2s intervals (30 attempts max = 60s timeout). Upload failures show a retry button.
- **Video transcoding:** ffmpeg.wasm loads on demand in the browser. Converts uploaded video to 720×1280 H.264/AAC before upload.
- **All Snapchat API calls are server-side.** Never call the Snapchat Marketing API from the browser.

## Snapchat API Field Notes

- Campaign objective: `objective_v2_properties.objective_v2_type` (not legacy `objective`)
- Campaign lifetime budget: `lifetime_spend_cap_micro` (NOT `lifetime_budget_micro` — that's ad squad only)
- `spend_cap_type` is an ad squad field only, not valid on campaigns
- Ad squad pixel tracking: `pixel_id` + `pixel_conversion_event` (required for pixel-based goals)
- Creative destination URL: `interaction_zone_properties.web_view_url` (for WEB_VIEW) or `deep_link_url` (for DEEP_LINK/APP_INSTALL)
- Ad destination URL: `web_view_properties.url` (for WEB_VIEW) or `deep_link_properties.deep_link_uri` — sent on the Ad payload in addition to the Creative
- Creative public profile: `profile_properties.profile_id` (optional)
- Ad `type` mirrors the creative type (SNAP_AD, WEB_VIEW, APP_INSTALL, DEEP_LINK)
- Default creative interaction type: WEB_VIEW (so destination URL is always visible in Step 3)
