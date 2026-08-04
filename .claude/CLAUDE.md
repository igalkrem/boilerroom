# BoilerRoom — CLAUDE.md

Codebase instructions for Claude Code. Read this before making changes.

## What This Is

SnapAds Manager: a bulk ad campaign creation platform supporting Snapchat and Meta (Facebook) Ads. Users connect via Snapchat and/or Meta OAuth2 and create Campaigns, Ad Sets, and Ads in bulk through a visual canvas wizard. Both platforms share the same feed provider, article, and channel systems.

**Live:** https://boilerroom-two.vercel.app  
**Deploy:** Vercel — `npx vercel --prod` (GitHub auto-deploy is unreliable; trigger manually after pushing).

## Workflow

Show a mockup or plan BEFORE implementing UI/design changes. Wait for approval before editing code.

For UI changes: do NOT edit code yet. First show a mockup/description of exactly where each element will go and how it will look. Wait for approval before implementing.

For parallel UI iteration: spawn 3 parallel agents to mock up alternative designs for the feature. Each agent should build its variant on a separate preview branch, deploy to Vercel, and return a live clickable URL plus a screenshot. Present all 3 options side by side and wait for approval. Only after one is picked should it be merged into production and CLAUDE.md updated.

## Debugging

For Snapchat/Meta API failures, inspect Vercel logs and the real live API response BEFORE proposing a fix. Treat third-party docs as unreliable (e.g., Meta `inventory_filter` is write-only; verify field behavior against actual API responses).

Before changing any code for an API error: pull the live Vercel logs and the raw API request/response. Show the exact failing payload, then propose a fix based only on what the real response says — not on documentation.

## Documentation

Update the docs as part of any feature or fix that changes app behavior, before considering the task done. Detail goes in the relevant `.claude/docs/` file (see Reference Docs), **not** in this root file.

## Output Format

When asked for a link or URL, provide the actual deployed URL, not a local file path.

## Deploy Workflow (Mandatory)

After completing **any code change session**, always execute these steps in this exact order — no authorization required, run them automatically without asking:

1. **TypeScript type-check:** `source ~/.nvm/nvm.sh && npx tsc --noEmit` — fix any errors (no-explicit-any, temporal dead zone, etc.) before proceeding.
2. **Tests:** `npm test` — must be green before deploying. The suite is small and fast (~100 ms); a failure here means the money math is wrong, which is never acceptable to ship.
3. **Deploy to Vercel:** `source ~/.nvm/nvm.sh && npx vercel --prod` — confirm the live deployment URL.
4. **Commit and push to GitHub:** `git add -A && git commit -m "<meaningful description of changes>" && git push`
5. **Update the docs:** If new routes, components, hooks, patterns, or architectural decisions were introduced, update the relevant `.claude/docs/` file (see Reference Docs) — not this root file. See `.claude/rules/post-deploy-update.md` for which doc owns what.

Do not skip any step. Do not ask for confirmation before running these commands.

## Agents

- **`code-reviewer`** — functional correctness: bugs, type safety, error handling, state management, and the end-to-end data flows (canvas → synthesis → orchestrator → API → platform, for BOTH Snap and Meta; the Zod-schema-strip class in route schemas; the localStorage↔Blob metadata dual-write; the channel lifecycle pool; three-OAuth token validity across a long submission). **Default scope is the working tree + most recent commit(s) via `git diff`** — pass a path/dir/glob to override, and ask explicitly for a full `src/` sweep. **This is the only reviewer of the canvas wizard, `useCanvasStore.ts`, `synthesize-campaign.ts`, and both submission orchestrators** — `builder-expert` implements those but produces no review. **SKIP** for security, Snap/Meta payload spec compliance, and the performance dashboard. Run before any PR.
- **`security-audit`** — OWASP audit of the real surface: per-resource authz/IDOR across BOTH the Snap and Meta route families, the three OAuth flows (Google login + Snap/Meta traffic sources), Postgres (parameterized SQL, ILIKE escaping, lazy migrations), public-access Vercel Blob (media AND the `/api/data` metadata JSON store), the cron secret and its all-tenant blast radius, the `execFile` FFmpeg transcode path, SSRF host-pin consistency, the middleware limiter that covers only `/api/auth/*`, the two debug subsystems still shipping to prod, and env fallbacks. Run before any deploy and whenever an API route is added.
- **`dashboard-reviewer`** — the performance dashboard and reporting pipeline: metric formulas, the sync/read pipeline for BOTH platforms, timezone and historical-ROI date math, inline editing (incl. the ROAS editor and `roasDisplayDivisor`), SQL JOIN/attribution accuracy across all three revenue feeds (Visymo EUR, Predicto Snap, Predicto FB), and cron cadence. Owns the Snapchat **Stats** and Meta **Insights** APIs. **TRIGGER** for `src/app/dashboard/performance/`, `src/components/performance/`, `src/app/api/reporting/`, `src/lib/reporting/`, `src/lib/{snapchat,meta}/stats.ts`, `src/lib/{visymo,predicto,fx-rate}.ts`. **SKIP** for the canvas wizard, campaign creation, and payload spec compliance.
- **`snapchat-api-auditor`** — Snapchat Marketing API spec compliance only: payload field names, enums, required/forbidden fields for Campaigns/AdSquads/Creatives/Ads, plus media upload and batch response parsing. **SKIP** for Meta (use `meta-api-auditor`), the Stats API (use `dashboard-reviewer`), bugs, and security. Run before any deploy or after a Snapchat API change.
- **`meta-api-auditor`** — Meta Graph API spec compliance only (version pinned in `lib/meta/graph-version.ts`): payload field names, enums, **numeric scales**, required/forbidden fields for Campaigns/Ad Sets/Creatives/Ads/Media/Pages, **and whether each field survives its route's Zod schema** (`.strip()` has silently dropped shipped fields twice). Embeds the hard-won constants: `bid_constraints.roas_average_floor` ×10000 (NOT `bid_amount`), ABO-only budgets, `excluded_geo_locations` as a top-level sibling, `creative_asset_groups_spec` on the AD node with `titles`/`bodies`, Advantage+ individual flags without `standard_enhancements`, PBIA/`instagram_user_id` usability (the v22+ name; `instagram_actor_id` is unsupported), and no Meta token refresh (~60 d). **SKIP** for Snapchat, Meta Insights/reporting, bugs, and security. Run before any deploy, after a Graph version bump, or on any launch failure with an `error_subcode`.
- **`builder-expert`** — **implementation agent, not a reviewer** (has Edit/Write/Bash; produces no review artifact). Domain reference for the canvas wizard: React Flow canvas, `useCanvasStore`, submission orchestrators, `synthesizeCampaign()`/`synthesizeMetaCampaign()`, URL macros, Silo integration, node/edge components. **TRIGGER** for any task *changing* `src/components/wizard/`, `src/hooks/useCanvasStore.ts`, `src/lib/{submission-orchestrator,meta-submission-orchestrator,synthesize-campaign}.ts`. **SKIP** for reviews of any kind — route those to `code-reviewer`.
- **`snapchat-placement-debugger`** — ad-squad PLACEMENT problems: "Smart / Automatic placement" (`placement_v2`) and the E2025 "squad frozen against edits" lock. Works from LIVE evidence (Vercel logs + the `/api/debug/placement-probe` experiment), never docs. **TRIGGER** when a campaign won't launch on Smart Placements, a squad becomes uneditable after launch (E2025), `placement_v2` behaviour changes, or the DPA/CHAT_FEED constraint is in question. **SKIP** for generic field compliance (use `snapchat-api-auditor`), security, or wizard/canvas bugs.

## Reusable Prompts

**Debug a Snapchat/Meta API error:**
> Before changing any code, pull the live Vercel logs and the raw API request/response for this error. Show me the exact failing payload, then propose a fix based only on what the real response says — not on documentation.

**Debug Smart Placements (placement_v2 / E2025 lock):**
> Invoke the `snapchat-placement-debugger` agent. Do NOT change any placement code from docs or guesses. First have me run the Smart Placement Probe (dashboard → Smart Placement Probe page → pick a test account → Run), then pull the raw report from Vercel logs (`query: "placement-probe"`, newest deployment), build the truth table (Smart? × editable-after?), and only then recommend the fix — which must keep in-app budget/bid/pause editing working.

**UI change (mockup-first):**
> For this UI change, do NOT edit code yet. First show me a mockup/description of exactly where each element will go and how it will look. Wait for my approval before implementing.

**Parallel UI variants:**
> Before writing any production code, spawn 3 parallel agents to mock up alternative UI designs for [feature]. Each agent should build its variant on a separate preview branch, deploy to Vercel, and return a live clickable URL plus a screenshot. Present all 3 options side by side and wait for my approval. Only after I pick one should you merge it into production and update CLAUDE.md.

**Parallel code review:**
> Run three parallel review agents over this codebase — one for security, one for type-safety/lint, one for correctness — then consolidate findings into a prioritized fix list before making any changes.

**Continuous review swarm:**
> Set up a continuous review swarm triggered on each commit. Launch parallel sub-agents: (1) security audit for leaked secrets and vulnerable patterns, scanning git history; (2) TypeScript/ESLint strictness including no-explicit-any; (3) dead-code and unused-export detection. Each agent must apply fixes, run the full type-check and production build to verify zero errors, then open a separate PR with a summary. Only present PRs that build cleanly, and flag any credential exposure as urgent.

## Stack

- **Framework:** Next.js 14 (App Router), TypeScript, Tailwind CSS — **permanent dark mode**: `darkMode: 'class'` in `tailwind.config.ts`, `<html class="dark">` set in `src/app/layout.tsx` (no toggle). All components use `dark:` Tailwind variants alongside their light classes. `src/app/globals.css` defines `--node-bg: #1f2937` (dark canvas background color used by nodes), a safety-net rule that forces dark backgrounds/text on any native input/select/textarea without explicit Tailwind dark classes, and a React Flow attribution override. Never remove the `dark` class from `<html>` and never add a light/dark toggle — the platform is dark-only.
- **Canvas:** `@xyflow/react` (React Flow v12) + `@dagrejs/dagre` for auto-layout
- **Auth:** Google OAuth2 (primary login) + Snapchat OAuth2 (traffic source, optional) + Meta OAuth2 (traffic source, optional, Phase 0 complete) + iron-session (encrypted HttpOnly cookies). Session type (`src/types/session.ts`) includes `pendingUploads?: Record<string, { addPath: string; finalizePath: string }>` for server-pinned chunked upload paths (see docs/security.md). Meta session fields (`metaAccessToken`, `metaExpiresAt`, `metaUserId`, `metaOAuthState`, `metaAllowedAdAccountIds`) and helpers (`isMetaConnected`, `isMetaAdAccountAllowed` in `session.ts`) are live. Meta tokens are long-lived (~60 days, Graph API v25.0) — no refresh mechanism; users must reconnect after expiry. `expires_at` persisted in `user_meta_tokens` DB table; the Traffic Sources page shows an expiry warning when ≤7 days remain.
- **Forms:** react-hook-form + Zod
- **Tests:** Vitest (`npm test`) — see the Tests section. Money math only; there is no component/integration/e2e layer.
- **State:** Zustand — `useCanvasStore` (canvas wizard graph state), `useWizardStore` (legacy, still used by `LoadPresetBanner` and preset/use page)
- **Storage:** Vercel Blob (`@vercel/blob`) — client-side uploads, public access, store: `boilerroom-silo`. Also used for persistent metadata storage (see docs/media-and-silo.md).
- **Zip generation:** `jszip` — used only by `POST /api/meta/ad-media?download=1` (Ad Media Downloader tab) to bundle a Meta ad's resolved images/videos into a single downloadable zip, built in-memory (`generateAsync({type:"arraybuffer"})`) and returned as the response body.
- **Video transcoding:** Server-side via `@ffmpeg-installer/ffmpeg` (native Linux FFmpeg binary, ~80 MB bundled in `node_modules`). Invoked from `POST /api/silo/transcode` using Node's `child_process.execFile`. `next.config.mjs` marks it `experimental.serverComponentsExternalPackages` so webpack leaves the binary alone. Upload flow: browser uploads raw video first → calls `/api/silo/transcode` → server downloads from Blob, transcodes to H.264, re-uploads result, returns `optimizedUrl`. The browser-side WASM packages (`@ffmpeg/ffmpeg` + `@ffmpeg/core` + `@ffmpeg/util`) remain installed but `transcodeVideoToH264()` in `silo-utils.ts` is no longer called during upload. Core WASM files (~31 MB) are still copied to `public/ffmpeg/` at build time by `scripts/copy-ffmpeg.mjs` (`prebuild`/`predev`); `public/ffmpeg/` is gitignored.
- **Database:** Neon Postgres via `@vercel/postgres` (`POSTGRES_URL` env var) — reporting cache (4 tables: `snapchat_ad_squad_stats`, `visymo_report`, `predicto_report` — includes `impressions` column added via migration, `report_sync_log`) + channel lifecycle (`feed_provider_channels` — includes `ad_squad_snap_id` column for Predicto revenue JOIN) + cron token storage (`user_snapchat_tokens`) + Meta token storage (`user_meta_tokens` — active; stores encrypted access token + `meta_user_id` + `expires_at` + `ad_account_ids`; CRUD in `db/index.ts`: `upsertUserMetaToken`, `updateMetaAdAccountIds`, `getAllUserMetaTokens`, `deleteUserMetaToken`). Migrations run automatically on first call to `/api/reporting/sync`, `/api/reporting/combined`, `/api/reporting/drilldown`, `/api/reporting/sync-status`, or `/api/reporting/cron-sync` via `runMigrations()` in `src/lib/db/index.ts` — any route querying a migration-managed table directly (not just via `syncAccount()`/`syncMetaAccount()`) must call it first, or it risks a transient "relation does not exist" error on a fresh deploy that renames/creates a table (see the `kingsroad_report`→`visymo_report` idempotent rename guard at the top of `runMigrations()`, which must run before the `migrations.sql` statement loop). **Note:** `@vercel/postgres` is deprecated upstream — migrate to `@neondatabase/serverless` when convenient.
- **API:** Snapchat Marketing API v1 — all calls are server-side only, proxied through Next.js API routes
- **Visymo API:** `https://partnerhub-api.kingsroad.io/api/v3` (internal name Visymo; underlying partner hostname is still `partnerhub-api.kingsroad.io`, env var still `KINGSROAD_API_TOKEN`) — sell-side revenue reporting. Bearer token in `KINGSROAD_API_TOKEN`. Paginated `/report/` endpoint, page_size=2000. Used only server-side in `/api/reporting/sync`.
- **Predicto API:** `https://server.predicto.ai/api/v1/search/reporting` (**no trailing slash** — trailing slash causes a 307 HTTPS→HTTP redirect that strips the Authorization header, silently failing every sync) — second sell-side revenue source. Bearer token in `PREDICTO_API_TOKEN`. Flat (non-paginated) response. Revenue field in response is `estimated_revenue` (not `revenue`); click/funnel metrics return as strings and need `Number()` coercion. Revenue already in USD (no FX conversion). Synced alongside Visymo inside `syncAccount()` in `sync-logic.ts`. If `PREDICTO_API_TOKEN` is not set, Predicto sync is silently skipped.
- **Predicto FB:** SAME Predicto API/endpoint/shape with a SEPARATE token (`PREDICTO_FB_API_TOKEN`), reporting revenue generated by **Facebook (Meta) traffic**. `fetchPredictoFbReport()` in `predicto.ts` (shares `fetchPredictoWithToken()` core). Global feed (keyed by `custom_channel_id`), fetched inside `syncMetaAccount()` gated to the :46 window (same backend as Predicto), upserted into `predicto_fb_report`. Joined to `meta_ad_set_stats` in the combined query via `feed_provider_channels` (channel_id → ad_set_id) exactly like Predicto→Snap; Meta rows' `revenue_usd`/ROI come from this feed (Meta pixel purchase value stays in `snap_results`/`snap_purchase_value_usd`).
- **Vercel Cron (`vercel.json`):** `15,46 * * * *` schedule pointing to `/api/reporting/cron-sync` — fires at :15 and :46 each hour. Source-coupled: **:15 run** syncs Visymo feed + Snapchat stats for Visymo accounts (aligned with Visymo :15 data publish); **:46 run** syncs Predicto feed + Snapchat stats for Predicto accounts (aligned with Predicto :46 data publish). Accounts classified by network via `getAccountNetwork()` DB joins. **Unassigned accounts (no feed provider config, no DB-derivable network) are skipped entirely — not synced by cron at all** (changed 2026-07-29; previously they synced on both windows as a fallback, which also made Visymo's and Predicto's displayed snap-sync timestamps in `SyncStatusBar` look identical since most accounts were often unclassified and dominated both `sync-status` timestamp calculations; the fallback and its `unassigned` API field / UI pill were both removed rather than kept as a frozen-timestamp display). `CRON_SECRET` is auto-injected by Vercel Pro; add it manually to `.env.local` for local testing. **Bug fixed 2026-07-27:** `isVisymoRun`/`getAccountNetwork()` only ever controlled which accounts' *Snapchat* stats synced each tick — the Visymo/Predicto *feed* fetches inside `syncAccount()`/`syncMetaAccount()` were separately gated by `shouldSkipFeed()`'s :15/:46 window, but cron called both with `force=true`, which made that gate a no-op (`shouldSkipFeed` returns `false` immediately when forced). In practice both feeds (plus Predicto FB) refreshed on **every** tick instead of alternating, confirmed by their "last synced" timestamps in `SyncStatusBar` clustering within 1-2 minutes of each other regardless of the theoretical 31-minute :15/:46 gap. Fixed by splitting cron's single `force` into `force` (unchanged) + `forceStatsOnly` (see `sync-logic.ts` below) so cron can still re-check Snapchat/Meta account stats every tick without also defeating the feed-level throttle.

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

**Live browser verification of `/dashboard/*` — use `/api/auth/dev-login`.** The dashboard tree is gated behind Google OAuth, and `GOOGLE_CLIENT_ID`/`GOOGLE_REDIRECT_URI` are not set locally, so real sign-in cannot complete against localhost. `src/app/api/auth/dev-login/route.ts` mints the same iron-session cookie the callbacks would, bootstrapping the Snap access token (refreshed from `user_snapchat_tokens`) and Meta token from the DB — no credentials typed anywhere:

```bash
open "http://localhost:3000/api/auth/dev-login?secret=$DEV_LOGIN_SECRET&to=/dashboard/performance"
```

Then `preview_start` + `navigate` reaches any dashboard route with real data. Two independent gates: the route 404s when `NODE_ENV === "production"`, and again unless `DEV_LOGIN_SECRET` (≥32 chars, `.env.local` only, never set on Vercel) matches via `timingSafeEqual`. It never accepts a caller-supplied identity — the user comes from `DEV_LOGIN_GOOGLE_USER_ID` or is inferred when exactly one `user_snapchat_tokens` row exists — and `?to=` accepts single-leading-slash relative paths only. Redirects resolve against `request.nextUrl.origin`, **not** `NEXT_PUBLIC_APP_URL`, which points at the deployed origin and would bounce the dev browser to production.

## Tests

```bash
npm test          # vitest run — one pass, what CI/pre-deploy should use
npm run test:watch
```

Vitest, `environment: "node"`, config in `vitest.config.mts` (**`.mts`, not `.ts`** — Vite's native config loader treats a bare `.ts` config as CommonJS and warns about the ESM import). Path aliases resolve from tsconfig via `resolve.tsconfigPaths: true` — do **not** re-add the `vite-tsconfig-paths` plugin, it is now redundant and warns. Test files are `src/**/*.test.ts`, colocated with what they test.

**Coverage is deliberately narrow: the money math only** (`money.test.ts`, `roas-floor.test.ts` — 25 assertions). This is not an attempt at broad coverage; it is a guard on the arithmetic that moves real ad spend, chosen because that is exactly where the 2026-08-03 ROAS bug lived. Two properties worth preserving if these are extended:

- **Assert the premise, not just the conclusion.** `money.test.ts` asserts `2.01 * 1_000_000 !== 2_010_000` *before* asserting the function rounds it correctly. That line caught a wrong example while these tests were being written: `8.15 * 1e6` was assumed inexact and is in fact exact. Without the premise assertion, the test would have passed while documenting a falsehood. Float error here is **intermittent** — most values are exact — so spot-checking proves nothing; see the test for values that actually fail.
- **The ROAS tests are the durable form of a verification that was previously thrown away.** The eight preset/provider combinations were originally checked with a temp script that was then deleted, so the check existed nowhere. `roas-floor.test.ts` pins those cases plus the two near-misses: the divisor-less call that produced 9 mis-scaled live ad sets, and the missing normalisation that would have sent a legacy preset to 90,000,000.

`normalizePresetRoasFloor`'s threshold is pinned from both sides (`9.99` untouched, `10` normalised). When the legacy shim is finally deleted, the "cannot express a true ratio of 10 or more" test is the one that should fail and be removed with it.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
GOOGLE_CLIENT_ID         # from Google Cloud Console → APIs & Credentials → OAuth 2.0 Client IDs
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI      # https://<tunnel-or-vercel-url>/api/auth/google/callback
SNAPCHAT_CLIENT_ID
SNAPCHAT_CLIENT_SECRET
SNAPCHAT_REDIRECT_URI    # https://<tunnel-or-vercel-url>/api/auth/snapchat/callback
NEXT_PUBLIC_APP_URL      # https://<tunnel-or-vercel-url>
SESSION_SECRET           # 64-char hex: openssl rand -hex 32. Session cookies ONLY — no longer the token-encryption key
TOKEN_ENCRYPTION_KEY     # 64-char hex, MUST differ from SESSION_SECRET. At-rest key for stored Snapchat refresh / Meta access tokens (SEC-15). Set on Production + Development; PREVIEW IS STILL UNSET (the CLI cannot set an all-preview-branches var non-interactively — add it in the Vercel dashboard). Unset = falls back to the legacy SESSION_SECRET-derived key, which can read pre-backfill rows but NOT v2 rows
SESSION_COOKIE_NAME      # snap_ads_session
SNAPCHAT_API_BASE_URL    # https://adsapi.snapchat.com/v1
SNAPCHAT_AUTH_URL        # https://accounts.snapchat.com/login/oauth2/authorize
SNAPCHAT_TOKEN_URL       # https://accounts.snapchat.com/login/oauth2/access_token
BLOB_READ_WRITE_TOKEN    # from Vercel Dashboard → Storage → boilerroom-silo → .env.local tab
KINGSROAD_API_TOKEN      # Bearer token from Visymo Profile → API Credentials tab (env var name unchanged from before the Visymo rename)
PREDICTO_API_TOKEN       # Bearer token from Predicto — Snap-traffic revenue (optional — sync skipped if not set)
PREDICTO_FB_API_TOKEN    # Bearer token from Predicto FB — Facebook-traffic revenue (optional — sync skipped if not set)
POSTGRES_URL             # set automatically by: npx vercel env pull .env.local (after linking Neon in Vercel Storage)
CRON_SECRET              # bearer secret for /api/reporting/cron-sync. verifyCronSecret() fails CLOSED when unset, disabling cron. This is the ONLY credential guarding an endpoint that acts on EVERY tenant
DEV_LOGIN_SECRET         # local only, ≥32 chars: openssl rand -hex 24. Enables /api/auth/dev-login for browser verification. NEVER set this on Vercel
DEV_LOGIN_GOOGLE_USER_ID # optional — only needed if more than one user_snapchat_tokens row exists
DEV_LOGIN_EMAIL          # optional — display-only, defaults to dev@adcore.com
ENABLE_DEBUG_ROUTES      # optional, set to 1 to expose /api/debug/placement-probe and /api/meta/debug/test-launch in production. Off by default — unset it again after finishing a probe
```

## Architecture Notes

- **OAuth flow:** `/api/auth/*` routes handle token exchange and refresh; tokens live in an iron-session HttpOnly cookie.

The rest of this section was split by topic on 2026-08-04 — see Reference Docs.

## Reference Docs

`.claude/docs/` holds the detail that used to live in this file. **Read only the ones the current task touches** — that is the entire point of the split, and reading all of them defeats it.

| File | Read it when | Size |
|---|---|---|
| [`docs/project-structure.md`](docs/project-structure.md) | Locating a file, or adding a route/component/lib module | 71 KB |
| [`docs/canvas-wizard.md`](docs/canvas-wizard.md) | Touching the React Flow canvas, `useCanvasStore`, `synthesize-campaign.ts`, either submission orchestrator, or URL/naming macros | 35 KB |
| [`docs/campaign-config.md`](docs/campaign-config.md) | Feed providers, channel lifecycle, presets, Country Groups, or articles | 26 KB |
| [`docs/dashboard-reporting.md`](docs/dashboard-reporting.md) | The performance dashboard, metric formulas, attribution SQL, the ROAS divisor, or FX | 25 KB |
| [`docs/security.md`](docs/security.md) | Adding or changing any API route, auth check, CSP, or anything touching stored tokens | 45 KB |
| [`docs/snapchat-api.md`](docs/snapchat-api.md) | Snapchat payload fields, enums, `placement_v2`, the Stats API, or Catalogue/Collection ads | 25 KB |
| [`docs/meta-api.md`](docs/meta-api.md) | Meta bidding/ROAS floors, Instagram identity/PBIA, the "Flexible" ad format, ABO budgets, or Meta media | 16 KB |
| [`docs/media-and-silo.md`](docs/media-and-silo.md) | Silo, media upload/transcode, or the KV metadata store | 6 KB |

**Why this file was split.** It reached 272 KB in 699 lines, with one paragraph of 16,137 characters. At that size the harness reported *"CLAUDE.md was read before the last conversation was summarized, but the contents are too large to include"* — i.e. the document whose whole purpose is preventing repeat mistakes had stopped loading reliably, and was being added to anyway.

**Keep it that way.** New detail belongs in the relevant `docs/` file, not here. This root file should stay under ~30 KB and hold only what is needed on *every* task: what the app is, the workflow, agents, stack, how to run it, tests, and env vars. If a new topic doesn't fit an existing doc, add a file and a row above rather than growing a section here.

Do not convert the links above into `@docs/...` imports — Claude Code's `@` syntax eagerly inlines the target, which would re-create the original problem in a new shape.
