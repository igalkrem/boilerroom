# BoilerRoom — CLAUDE.md

Codebase instructions for Claude Code. Read this before making changes.

## What This Is

SnapAds Manager: a bulk Snapchat ad campaign creation platform. Users connect via Snapchat OAuth2 and create Campaigns, Ad Sets, and Ads in bulk through a visual canvas wizard.

**Live:** https://boilerroom-two.vercel.app  
**Deploy:** Vercel — `npx vercel --prod` (GitHub auto-deploy is unreliable; trigger manually after pushing).

## Deploy Workflow (Mandatory)

After completing **any code change session**, always execute these steps in this exact order — no authorization required, run them automatically without asking:

1. **Deploy to Vercel:** `source ~/.nvm/nvm.sh && npx vercel --prod`
2. **Commit and push to GitHub:** `git add -A && git commit -m "<meaningful description of changes>" && git push`
3. **Update this CLAUDE.md:** If new routes, components, hooks, patterns, or architectural decisions were introduced, update the relevant sections of this file to keep it accurate.

Do not skip any step. Do not ask for confirmation before running these commands.

## Agents

- **`builder-expert`** — canvas wizard: React Flow canvas, useCanvasStore, submission orchestrator, synthesizeCampaign(), URL macros, Silo integration, node/edge components. **TRIGGER** for any task touching `src/components/wizard/`, `src/hooks/useCanvasStore.ts`, `src/lib/submission-orchestrator.ts`, `src/lib/synthesize-campaign.ts`, or any question about the builder feature. **SKIP** for security, API spec compliance, and unrelated features.
- **`code-reviewer`** — functional correctness: bugs, type safety, error handling, data flows. Run before any PR.
- **`security-audit`** — auth, SSRF, access control, secrets, OWASP. Run before any deploy or when new API routes are added.
- **`snapchat-api-auditor`** — Snapchat API spec compliance: payload field names vs live docs, forbidden fields, invalid enums. Run before any deploy or after a Snapchat API update.

## Stack

- **Framework:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Canvas:** `@xyflow/react` (React Flow v12) + `@dagrejs/dagre` for auto-layout
- **Auth:** Google OAuth2 (primary login) + Snapchat OAuth2 (traffic source, optional) + iron-session (encrypted HttpOnly cookies)
- **Forms:** react-hook-form + Zod
- **State:** Zustand — `useCanvasStore` (canvas wizard graph state), `useWizardStore` (legacy, still used by `LoadPresetBanner` and preset/use page)
- **Storage:** Vercel Blob (`@vercel/blob`) — client-side uploads, public access, store: `boilerroom-silo`. Also used for persistent metadata storage (see KV Sync below).
- **Database:** Neon Postgres via `@vercel/postgres` (`POSTGRES_URL` env var) — reporting cache (3 tables: `snapchat_ad_squad_stats`, `kingsroad_report`, `report_sync_log`) + channel lifecycle (`feed_provider_channels`). Migrations run automatically on first `/api/reporting/sync` call via `runMigrations()` in `src/lib/db/index.ts`. **Note:** `@vercel/postgres` is deprecated upstream — migrate to `@neondatabase/serverless` when convenient.
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
GOOGLE_CLIENT_ID         # from Google Cloud Console → APIs & Credentials → OAuth 2.0 Client IDs
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI      # https://<tunnel-or-vercel-url>/api/auth/google/callback
SNAPCHAT_CLIENT_ID
SNAPCHAT_CLIENT_SECRET
SNAPCHAT_REDIRECT_URI    # https://<tunnel-or-vercel-url>/api/auth/snapchat/callback
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
│   │   ├── auth/                      # logout, refresh, session; google/{login,callback}; snapchat/{connect,callback,disconnect}
│   │   ├── data/                      # GET/POST — reads/writes user-scoped JSON blobs for persistent metadata
│   │   ├── feed-providers/
│   │   │   └── channels/              # GET/POST/DELETE — list, bulk-insert, hard-delete channels
│   │   │       ├── assign/            # POST — picks oldest available channel, marks in-use
│   │   │       └── release/           # POST — moves in-use channel to cooldown
│   │   ├── reporting/
│   │   │   ├── sync/                  # POST {adAccountId, startDate, endDate} — fetches Snapchat stats + KingsRoad data, upserts into Postgres; skips finalized dates, re-fetches recent dates at most once/hour
│   │   │   ├── combined/              # GET ?adAccountId&startDate&endDate — JOIN query returning merged metrics with EUR→USD conversion; includes all KingsRoad fields
│   │   │   └── drilldown/             # GET ?adSquadId&adAccountId — same JOIN but no date filter; returns ALL available dates for one campaign
│   │   ├── silo/
│   │   │   ├── upload/                # Vercel Blob client-upload token endpoint (handleUpload)
│   │   │   └── delete/                # DELETE handler — removes blobs by URL array
│   │   └── snapchat/
│   │       ├── campaigns/
│   │       ├── adsquads/
│   │       ├── creatives/
│   │       │   └── [id]/              # PATCH — update creative web_view_properties.url (for {{ad.id}} injection after ad creation)
│   │       ├── ads/
│   │       ├── ad-accounts/
│   │       ├── profiles/              # GET ?adAccountId= → first profile_id for creative payload
│   │       └── media/                 # upload-init, upload-chunk, upload-finalize, upload (image + small video ≤4.4 MB), upload-from-blob (server fetches Blob → Snapchat, any size), poll, copy
│   └── dashboard/
│       ├── page.tsx                   # Campaign builder (WizardShell) — default landing page
│       ├── [adAccountId]/create/      # Campaign builder with pre-selected ad account
│       ├── create/                    # Campaign builder (no pre-selected account)
│       ├── pixels/                    # Pixel CRUD UI (new/[id]/edit)
│       ├── presets/                   # Campaign preset CRUD UI (new/[id]/edit); card grid shows feed/geo/pixel/bid/budget/device + Duplicate action; no "Load in Wizard"
│       ├── articles/                  # Article CRUD UI (new/[id]/edit)
│       ├── feed-providers/            # Feed Provider board UI (card grid + FeedProviderModal) — own top-nav tab
│       ├── performance/               # **Default landing page** — auto-loads on mount, auto-refreshes every 15 min
│       └── silo/                      # Media library
│           ├── page.tsx               # Library grid with search/filter/delete; auto-fill grid (minmax 180–240px) keeps cards compact on wide screens
│           ├── upload/                # Upload page with tag selector + SiloUploader
│           └── tags/                  # Tag CRUD (create, edit, delete)
├── components/
│   ├── wizard/
│   │   ├── CampaignCanvas.tsx         # React Flow free-form canvas; grey bg; fitView maxZoom 0.75
│   │   ├── CanvasControls.tsx         # Top bar: Add Creative, Auto-align, Review →; computeAutoLayout (dagre LR, ranksep 200)
│   │   ├── nodes/
│   │   │   ├── CreativeGroupNode.tsx  # Group card: thumbnail grid (1–5), click-to-preview modal, + Add creative footer, source handle right
│   │   │   ├── ProviderNode.tsx       # Left accent bar + group count; hidden until first group added; no "+ Router" button
│   │   │   ├── RouterNode.tsx         # Sleek circle (⑃ icon) — auto-inserted when provider gets second article
│   │   │   ├── ArticleNode.tsx        # Slug + query + inline headline/CTA editor (expand ▼); 📄 icon
│   │   │   ├── AdAccountNode.tsx      # Initials avatar; connected state from articleToAdAccount edges (no click-select)
│   │   │   └── PresetNode.tsx         # Name + config + duplication rows; no Creatives/set control (replaced by groups)
│   │   ├── edges/
│   │   │   └── ProviderEdge.tsx       # Dotted SmoothStep in provider color (was bezier)
│   │   ├── ReviewAndPost.tsx          # Fallback campaign name template + launch matrix table; shows "Provider template active" badge when any provider has a naming template
│   │   ├── WizardShell.tsx            # Build/Review/Done mode toggle + sequential launch loop
│   │   ├── SubmissionProgress.tsx
│   │   └── LoadPresetBanner.tsx
│   ├── feed-providers/
│   │   ├── FeedProviderModal.tsx      # Large modal (max-w-3xl) with 5 tabs: Snap | Channels | Domains | Combos | Facebook
│   │   └── tabs/
│   │       ├── SnapTab.tsx            # Org ID, ad accounts, pixels + URL Parameters + Campaign Naming Template section (violet card; NamingTemplateEditor with segment pills + live preview)
│   │       ├── UrlParametersTab.tsx   # Parameter rows, always-visible filtered macro chips (two groups: Snapchat Native / BoilerRoom), live preview; hideBaseUrl prop
│   │       ├── ChannelsTab.tsx        # CSV upload, status table, lifecycle controls
│   │       ├── DomainsTab.tsx         # Domain rows (baseDomain + baseUrl + traffic source checkboxes)
│   │       └── CombosTab.tsx          # Named combos (pixel + domain + channel config)
│   ├── silo/
│   │   ├── SiloUploader.tsx           # Batch uploader: hash → optimize → Blob upload (3 concurrent)
│   │   ├── SiloBrowser.tsx            # Picker modal for canvas wizard integration
│   │   ├── AssetCard.tsx              # Thumbnail card with quick actions; bulk-mode checkbox overlay; single "Snap ✓" badge; portrait preview capped at max-h-[280px]
│   │   ├── AssetPreviewModal.tsx      # Full preview + metadata + usage history
│   │   └── SnapchatUploadModal.tsx    # Pre-upload to Snapchat — accepts assets: SiloAsset[] (single or bulk); 2-concurrent per asset
│   ├── layout/
│   │   ├── AuthGuard.tsx
│   │   ├── Sidebar.tsx                # Left sidebar navigation
│   │   ├── TopBar.tsx                 # Top bar (page header area)
│   │   └── KVHydrationProvider.tsx    # On dashboard mount: hydrates localStorage from Vercel Blob; blocks render on fresh session until data loaded
│   ├── performance/
│   │   ├── PerformanceTable.tsx       # Sortable table; 24 optional columns; checkbox bulk-select; inline Budget/Bid/Status editing per row; -1D/-2D/-3D ROI; campaign name filter; click row → DrilldownModal
│   │   ├── DrilldownModal.tsx         # Per-ad-squad daily breakdown — async-fetches ALL dates via /api/reporting/drilldown (no date filter)
│   │   ├── DateRangePicker.tsx        # Google Ads-style date picker: presets left, two-month calendar right; default = Today
│   │   └── ColumnSelector.tsx         # Dropdown checklist to show/hide metric columns; 24 columns (raw + computed); persists to localStorage (br_perf_cols)
│   ├── ui/
│   │   └── MultiSelect.tsx            # Controlled multi-select dropdown with checkboxes (react-hook-form Controller)
│   ├── pixels/                        # PixelForm component
│   ├── presets/                       # PresetForm — flat single-column form; Traffic Source selector (Snap active, Facebook coming soon); no Campaign Defaults section
│   └── articles/                      # ArticleForm component
├── hooks/
│   ├── useCanvasStore.ts              # Zustand store for canvas wizard graph state + buildCampaignMatrix()
│   └── useWizardStore.ts              # Legacy Zustand store (still used by LoadPresetBanner + preset/use page)
├── lib/
│   ├── snapchat/                      # Server-side API client (campaigns, adsquads, creatives, media, profiles, auth, stats)
│   ├── submission-orchestrator.ts     # Sequences: uploadMedia → channel assign → campaigns → adSquads → URL resolve → creatives → ads → patchCreatives
│   ├── synthesize-campaign.ts         # Converts CampaignBuildItem + resolved entities → {campaigns, adSquads, creatives}; throws if preset has no adSquads or provider URL is empty
│   ├── resolve-campaign-name.ts       # resolveCampaignName(fallbackTemplate, item, ctx, providerTemplate?) — uses provider's NamingSegment[] template if present, else string-replace fallback; also exports generateUniqueId4()
│   ├── uploadMediaToSnapchat.ts       # Client-side upload pipeline + uploadBlobToSnapchat (server-side path for Silo uploads)
│   ├── silo.ts                        # Silo asset CRUD (localStorage + KV sync, key: boilerroom_silo_v1)
│   ├── silo-tags.ts                   # Tag CRUD + auto-naming (localStorage + KV sync, key: boilerroom_silo_tags_v1)
│   ├── silo-utils.ts                  # Browser utils: hash, optimizeImage, generateThumbnail, getVideoDuration
│   ├── presets.ts                     # Preset CRUD (localStorage + KV sync, key: boilerroom_presets_v1) — loadPresets() defaults trafficSource="snap"; duplicatePreset(id) copies with new id/name
│   ├── pixels.ts                      # Pixel CRUD (localStorage + KV sync, key: boilerroom_pixels_v1)
│   ├── feed-providers.ts              # FeedProvider CRUD (localStorage + KV sync, key: boilerroom_feed_providers_v1) — upcast() normalises legacy records
│   ├── articles.ts                    # Article CRUD (localStorage + KV sync, key: boilerroom_articles_v1) — upcast() defaults query: "" for old records
│   ├── kv-sync.ts                     # hydrateFromKV(key) + syncToKV(key, data) — debounced 1.5s writes to /api/data
│   ├── db/
│   │   ├── index.ts                   # sql helper + runMigrations() + channel CRUD: normalizeChannelStatuses(), assignChannel(), releaseChannel(), listChannels(), bulkInsertChannels(), deleteChannels()
│   │   └── migrations.sql             # CREATE TABLE IF NOT EXISTS for all 4 tables (3 reporting + feed_provider_channels)
│   ├── country-map.ts                 # countryNameToCode / countryCodeToName — normalises KingsRoad country_name ↔ Snapchat ISO-2
│   ├── fx-rate.ts                     # getEurToUsd() — fetches frankfurter.app, cached 1h in module memory
│   ├── kingsroad.ts                   # fetchKingsRoadReport(startDate, endDate) — paginated KingsRoad /report/ client
│   ├── session.ts                     # iron-session helpers & auth validation
│   └── rate-limiter.ts
└── types/
    ├── wizard.ts                      # CampaignFormData, AdSquadFormData, CreativeFormData, SubmissionResults, CreativeGroup, CanvasEdges, CampaignBuildItem
    ├── feed-provider.ts               # FeedProvider (full type with snapConfig, urlConfig, channelConfig, domains, combos), UrlParameter, FeedProviderDomain, FeedProviderCombo, ChannelSetupType
    ├── article.ts                     # Article (id, feedProviderId, slug, query, allowedHeadlines, createdAt)
    ├── preset.ts                      # CampaignPreset (includes trafficSource, feedProviderId, comboId, creativeDefaults)
    ├── snapchat.ts                    # API payload types (SnapCampaignPayload, etc.)
    ├── silo.ts                        # SiloAsset, SiloTag, SnapchatUploadStatus, SnapchatUploadStage
    ├── pixel.ts                       # SavedPixel type
    └── session.ts
```

## Architecture Notes

- **OAuth flow:** `/api/auth/*` routes handle token exchange and refresh; tokens live in an iron-session HttpOnly cookie.

- **Canvas wizard:** `WizardShell` renders in three modes: `canvas` (`CampaignCanvas` React Flow), `review` (`ReviewAndPost`), `done` (success screen). `CampaignCanvas` is loaded via `next/dynamic` with `ssr: false`. The canvas uses `useCanvasStore` (Zustand) to track `creativeGroups: CreativeGroup[]` (each group holds 1–5 asset IDs), four edge lists (`groupToProvider`, `providerToArticle`, `articleToPreset`, `articleToAdAccount`), `nodePositions`, and `routerNodes`. `buildCampaignMatrix()` iterates groupToProvider edges — each group is an explicit chunk of creatives, producing `CampaignBuildItem[]` where each item has `creativeIds: string[]`. Cascade: removing a group→provider edge that orphans a provider also removes its article edges; removing a provider→article edge that orphans an article also removes its preset edges. On launch, `WizardShell` loads all assets for `item.creativeIds`, calls `synthesizeCampaign()`, then `runSubmission()`.

  **React Flow canvas (`CampaignCanvas.tsx`):** Nodes are freely draggable; positions persist in `store.nodePositions`. Key design decisions:
  - **Creative groups** — users add groups via "+ Add Creative" (creates new `CreativeGroup` node + opens SiloBrowser). Each group card shows portrait thumbnails; clicking a thumbnail opens a full preview modal (image or video player). Up to 5 creatives per group. Groups are the unit that connects to providers.
  - **Provider visibility** — providers only appear after at least one group exists.
  - **Auto-router** — in `onConnect`, when a provider already has ≥1 article edge and no router yet, a router is auto-inserted. No manual "+ Router" button on ProviderNode.
  - **Explicit article→account wiring** — users drag from article's right handle to an account's left handle. `store.edges.articleToAdAccount` stores these edges. No global `selectedAdAccountIds` broadcast.
  - **Left handle click = disconnect** — all target handles have an `onClick` that calls `makeDisconnectTarget(nodeId)`, which removes all incoming edges for that node (cascade-safe).
  - **Preset gate** — preset nodes are `disabled` until `store.edges.articleToAdAccount.length > 0`.
  - **Edges** — `ProviderEdge` uses `getSmoothStepPath` (right-angle routing, less tangling). All handles are 20px circles (`!w-5 !h-5 !rounded-full`).
  - **Router node** — sleek 36px circle with ⑃ icon (was diamond).
  - **Auto-align** — dagre LR with `ranksep: 200`, `nodesep: 60`; group node dims `220×160`.
  - **Canvas** — grey background `#f5f5f5`, `fitView` with `maxZoom: 0.75`.

  **React Flow render-loop hazards (React error #185):** Three pitfalls that cause an infinite `setNodes` loop:
  1. **`store.nodePositions` must NOT be in `buildNodes` deps.** Fix: read positions via `nodePositionsRef` (a `useRef` kept in sync via a separate `useEffect`) so `buildNodes` can read current positions without subscribing to them.
  2. **Use `change.dragging === false` (strict), not `!change.dragging`.** React Flow fires `onNodesChange` with `{ type: "position", dragging: undefined }` on initialization — `!undefined` is `true`, so every node's init position would be written to the store, triggering a rebuild loop.
  3. **Never inline `[]` as a fallback in hooks that feed into `buildNodes` deps.** `useAdAccounts` returns `data?.accounts ?? EMPTY_ACCOUNTS` where `EMPTY_ACCOUNTS` is a module-level constant. Inline `[]` creates a new reference every render while SWR is loading → `visibleAccounts` recomputes → `buildNodes` rebuilds → `setNodes` → re-render → repeat.
  All five visibility arrays (`activeProviderIds`, `activeProviderIdsFromArticles`, `visibleArticles`, `visibleAccounts`, `visiblePresets`) are wrapped in `useMemo`. `store.edges` is intentionally absent from `buildNodes` deps — visibility is already captured by the memoized arrays above.

  **Canvas visual rules:**
  - **Provider colors** — assigned from `PROVIDER_COLORS` array indexed by sort-order of `createdAt` (stable; not array position). Colors propagate to node borders, indicator dots, and SVG edges.
  - **CreativeGroupNode** — multi-color gradient border (CSS `background-image` double-gradient trick) when connected to more than one provider; single-provider uses that provider's color; empty/disconnected shows red-tinted.
  - **Ad account NodeCard** — connected state derived from `articleToAdAccount` edges (not from `selectedAdAccountIds`). Shows 2-letter initials avatar.
  - **Preset gate** — `disabled` until `articleToAdAccount.length > 0`.
  - **`visibleAccounts`** — filtered by `activeProviderIdsFromArticles`; visible once any article is connected.
  - **`visiblePresets`** — filtered by `activeProviderIdsFromArticles`.

- **synthesizeCampaign():** `lib/synthesize-campaign.ts` converts one `CampaignBuildItem` + resolved `(provider, article, preset, assets[])` into the `{campaigns[], adSquads[], creatives[]}` shape the orchestrator expects. One campaign + one ad squad are created; `creatives[]` has one entry per asset (all share the same `adSquadId`). When multiple assets are passed, creative names are suffixed `[1]`, `[2]`, etc. It calls `buildUrlTemplate()` which resolves static URL macros now (`{{article.name}}`, `{{article.query}}`, `{{creative.headline}}`, `{{creative.rac}}`, `{{organization_id}}`), passing each resolved value through `encodeURIComponent` so spaces and special chars are safe. Any remaining `{{...}}` that aren't `{{campaign.id}}`, `{{adset.id}}`, `{{ad.id}}`, or `{{channel.id}}` are stripped (replaced with `""`) — Snapchat rejects both literal and percent-encoded unknown macros (E2712). The three Snapchat native macros and `{{channel.id}}` are left untouched — Snapchat substitutes the native ones at click time; the orchestrator resolves `{{channel.id}}`.

- **Submission orchestrator:** `lib/submission-orchestrator.ts` runs **five stages** in sequence:
  1. **uploadMedia** — all creatives upload in parallel
  2. **Channel assignment** — if `provider.channelConfig.type === "provider-supplied"`, calls `POST /api/feed-providers/channels/assign`; if `addChannelIdToCampaignName`, appends `-{channelId}` to all campaign/squad/ad names; resolves `{{channel.id}}` in each creative's URL
  3. **campaigns** — create campaigns in Snapchat
  4. **adSquads** — create ad squads in Snapchat
  5. **creatives** — create creatives; **ads** — create ads
  Each stage's results are tracked individually. `pacing_type` is hardcoded to `"STANDARD"`. The orchestrator accepts an optional `provider?: FeedProvider` parameter (6th arg) for channel assignment.

- **URL macro system:** Macros split by resolution stage:

  | Macro | Resolved from | When |
  |---|---|---|
  | `{{article.name}}` | `article.slug` | synthesis time |
  | `{{article.query}}` | `article.query` | synthesis time |
  | `{{creative.headline}}` | canvas headline input | synthesis time |
  | `{{creative.rac}}` | `rac` field of the selected headline | synthesis time |
  | `{{organization_id}}` | `provider.snapConfig.organizationId` | synthesis time |
  | `{{channel.id}}` | assigned channel from Postgres | orchestrator (after channel assignment) |
  | `{{campaign.id}}` | Snapchat campaign ID | Snapchat native — substituted at click time |
  | `{{adset.id}}` | Snapchat ad squad ID | Snapchat native — substituted at click time |
  | `{{ad.id}}` | Snapchat ad ID | Snapchat native — substituted at click time |

- **Campaign naming macros** (used in `NamingSegment[]` provider templates only — not in URL templates):

  | Macro key | Resolved from | Notes |
  |---|---|---|
  | `preset.tag` | `preset.tag` field | Short label set per preset |
  | `article.name` | `article.slug` | Same value as `{{article.name}}` above |
  | `date_ddmm` | current date | e.g. `"3004"` for 30 April |
  | `unique_id_4` | `generateUniqueId4()` | Fresh random 4-char alphanumeric per campaign at launch time; preview uses stable per-row mock |
  | `preset.name` | `preset.name` | Full preset name |
  | `index` | `duplicationIndex + 1` | 1-based duplication count |

  `resolveCampaignName(fallback, item, ctx, providerTemplate?)` — if `providerTemplate` is non-empty, resolves segments and joins with `" | "`; otherwise falls back to the old string-replace logic using `fallback`.

- **Feed Providers (v3):** Full sell-side provider management. `FeedProvider` type lives in `src/types/feed-provider.ts` (not `article.ts`). Key fields:
  - `snapConfig` — `organizationId` (resolves `{{organization_id}}`), `allowedAdAccountIds[]`, `allowedPixelIds[]`, `campaignNamingTemplate?: NamingSegment[]` (Snap-specific; stored per-traffic-source — when Facebook is added it gets its own field)
  - `urlConfig` — `parameters: UrlParameter[]` (key/value with macro support). `baseUrl` is retained in the stored shape as a backward-compat fallback but is no longer shown in the UI — base URLs are now per-domain.
  - `channelConfig` — `type: "provider-supplied" | "parameter-based"`, `addChannelIdToCampaignName?`, `channelParamKey?`
  - `domains[]` — `FeedProviderDomain` (`id`, `baseDomain`, `baseUrl?`, `trafficSources[]`). Each domain carries its own `baseUrl`. `buildUrlTemplate()` resolves base URL as `domain.baseUrl ?? provider.urlConfig.baseUrl ?? ""` (latter is the fallback for old records).
  - `combos[]` — `FeedProviderCombo` (named preset of pixel + domain + channel settings)

  **Modal tabs:** Snap | Channels | Domains | Combos | Facebook (coming soon). The "URL Parameters" standalone tab was removed — URL parameter configuration now lives at the bottom of the Snap tab (rendered via `UrlParametersTab` with `hideBaseUrl`). Below URL Parameters, a violet **Campaign Naming Template** card (`NamingTemplateEditor`) lets users build segment-based names (literal text chips + macro chips joined by " | "). Macros: `{{preset.tag}}`, `{{article.name}}`, `{{date_ddmm}}`, `{{unique_id_4}}`. Live preview resolves against example values. Facebook tab is a placeholder.

  **`UrlParametersTab` behaviour:** macro chips are always visible above the preview URL (not a focus-gated popup). Chips are filtered to only show macros not already present in any parameter value. Clicking a chip inserts into the last-focused value input (tracked via `lastActiveIndexRef`). Chips are split into two labeled groups: **Snapchat Native** (yellow — `{{campaign.id}}`, `{{adset.id}}`, `{{ad.id}}` — substituted by Snapchat at click time) and **BoilerRoom** (blue — all others — resolved before sending to Snapchat). Preview URL uses a structured renderer (not a flat split): base URL, parameter keys, `?`, `&`, and `=` are regular weight; hardcoded literal parameter values are **bold**; macros are highlighted yellow (Snapchat native) or blue (BoilerRoom). The `source` field on each MACROS entry (`"snap"` | `"br"`) drives both the chip style and the preview highlight color.

  Legacy records (only had `name`, `parameterName`, `baseUrl`) are up-cast by `upcast()` in `feed-providers.ts` — all new fields default to empty/sensible values. The board UI is a card grid; clicking a card or "New" opens `FeedProviderModal`. No separate `/new` or `/[id]/edit` route pages — everything is in the modal.

- **Feed provider channels:** Postgres table `feed_provider_channels` tracks channel lifecycle: `available → in-use → cooldown → available`. Lifecycle promotion is lazy (runs on every read via `normalizeChannelStatuses(feedProviderId)`, no cron). Thresholds: `in-use` > 24h → cooldown; `cooldown` > 24h → available. Channels are imported via CSV upload in the Channels tab. `assignChannel()` picks the oldest available channel and marks it `in-use`. `releaseChannel()` moves a channel from `in-use` to `cooldown`. The table has a `google_user_id` column — all queries (`listChannels`, `bulkInsertChannels`, `deleteChannels`) filter by the session's Google user ID to enforce per-user ownership.

- **Campaign presets (v3):** `CampaignPreset` key fields: `trafficSource?: "snap" | "facebook"` (defaults to `"snap"` on load for old records), `feedProviderId` (required; `""` for legacy), `comboId?`, `tag?` (short label resolves `{{preset.tag}}` in naming templates), `creativeDefaults?: { adStatus, callToAction? }`. `brandName` removed from `creativeDefaults` — no longer in UI. Campaign is always saved as `status: "ACTIVE"`, `spendCapType: "NO_BUDGET"`, no start/end date. Ad squad always `spendCapType: "DAILY_BUDGET"`, no end date, no gender. `PresetForm` is a flat `max-w-2xl` form with three `<hr>`-divided sections: (1) Traffic Source + Name + **Preset Tag** + Feed Provider + Combo; (2) Geo + Device + OS + Placements; (3) Pixel + Optimization Goal + Bid Strategy + Bid Amount + Daily Budget + Ad Set Status + Ad Status + Call to Action. Always exactly one ad squad. Old presets without `feedProviderId` show an amber "Provider not found" warning on the list page. `duplicatePreset(id)` in `lib/presets.ts` creates a copy named "Copy of X". Preset list cards display: name, traffic source badge (Snap yellow / Facebook blue), and a 2-column data grid: Feed | Geo | Pixel | Bid | Budget | Device. Card actions: Edit | Duplicate | Delete — no "Load in Wizard" (preset selection happens in the wizard canvas).

- **Articles (v3):** `Article` type fields:
  - `slug` — "Keyword" in UI; plain string (no format restriction); resolves `{{article.name}}`
  - `query` — search keyword resolving `{{article.query}}`
  - `title?` — display title (optional, form only)
  - `previewUrl?` — URL for article preview; shown as a cyan "Preview" button in the table that opens a new tab
  - `domain?` — selected from the feed provider's `domains[]` (baseDomain); only domains belonging to the chosen provider are shown
  - `locale?` — locale code e.g. `"en_US"`; picked from a 10-option dropdown (German-Germany, English-AU/CA/GB/US, Spanish-AR/ES, Portuguese-Brazil, French-France, Italian-Italy)
  - `allowedHeadlines: { text: string; rac: string }[]` — each headline has a text (≤34 chars) and a RAC value. Old `string[]` records are migrated on load via `upcast()` (strings become `{ text: h, rac: "" }`). In the canvas wizard, the headline dropdown uses `h.text`; selecting a headline also stores its `rac` in the canvas edge (`headlineRac` field of `CampaignBuildItem`), which resolves `{{creative.rac}}` at synthesis time. In the form, each headline is stacked: text input on top, RAC input below in a muted gray style.

  `FeedProvider` is imported from `src/types/feed-provider.ts` (not `article.ts`). The articles list page renders a sortable/filterable table (columns: Provider, Keyword, Language, Domain, Headlines, Added, Actions). Provider colors use the same stable `PROVIDER_COLORS` palette as the canvas (providers sorted by `createdAt`, color by index) — consistent across both views. The Headlines column badge is clickable to expand a row showing all headlines and their RAC values. Action buttons are styled pills: gray Edit, cyan Preview (only when `previewUrl` set), red Delete.

  **`ArticleForm` gotcha:** `providers` loads async in a `useEffect`, so at mount the domain `<select>` has no options yet — the HTML select silently falls back to the first option. Fix: a second `useEffect` calls `setValue("domain", article.domain)` once `providers.length > 0`, restoring the saved value. Any future field that depends on a provider-driven option list should follow the same pattern.

- **Silo → wizard integration:** `CampaignCanvas` opens `SiloBrowser` modal to pick assets. `getAssetById(creativeId)` is called with the Silo asset ID. Silo asset fields: `mediaType` (not `type`), `originalFileName` (not `fileName`), `optimizedUrl ?? originalUrl` (not `blobUrl`). After submission, `WizardShell` caches new Snapchat mediaIds into Silo assets and records usage history.

- **Media upload (deferred):** The actual upload happens at submission time in the `uploadMedia` stage. Two upload functions in `lib/uploadMediaToSnapchat.ts`:
  - **`uploadBlobToSnapchat(blobUrl, fileName, adAccountId, mediaType)`** — used by `SnapchatUploadModal` for all Silo uploads regardless of size. SSRF guard: `blobUrl` must end with `.vercel-storage.com`. Snapchat marks media `READY` immediately.
  - **`uploadMediaToSnapchat(file, adAccountId, mediaType)`** — size-based routing: files ≤ 4.4 MB → simple single-POST (READY immediately); files > 4.4 MB → chunked multipart-upload-v2 (INIT → 2 parallel 4 MB chunks → FINALIZE → poll). Polling: 150 × 2s = 5 min max; `PollTimeoutError` on timeout. Chunked routes use `rateLimitedFetch` with exponential backoff on 429s.
  - File names are sanitized to `[a-zA-Z0-9._\-]` before every media entity POST. **Videos must be H.264 MP4.**

- **All Snapchat API calls are server-side.** Never call the Snapchat Marketing API from the browser.

- **Silo — media library:** Asset metadata lives in localStorage (`boilerroom_silo_v1`). Upload pipeline: SHA-256 hash → canvas resize/thumbnail → `upload()` from `@vercel/blob/client`. Snapchat mediaIds cached per-ad-account in `snapchatUploads[]`. Cross-account reuse tries `media_copy` first; falls back to `uploadBlobToSnapchat`. `SnapchatUploadModal` accepts `assets: SiloAsset[]` — works for single or bulk; 2-concurrent uploads per asset. Grid uses `repeat(auto-fill, minmax(180px, 240px))` so cards stay compact on wide screens. `AssetCard` portrait preview is capped at `max-h-[280px]`. **Bulk mode:** "Select" button in Silo header enables checkbox selection; sticky action bar appears with "Delete (N)" and "→ Snapchat (N)" when items are selected. `AssetCard` shows a single "Snap ✓" badge regardless of how many ad accounts have the asset cached (was: one badge per account).

- **KV Sync — persistent metadata storage:** All localStorage-backed stores call `syncToKV(key, data)` on every write — debounced 1.5s, fire-and-forget POST to `/api/data`. Blob paths: `metadata/{googleUserId}/{key}.json`. Blobs are stored with `access: "public"` (the `boilerroom-silo` store is a public store; private access is not supported). Server reads use `getDownloadUrl` from `@vercel/blob`. `KVHydrationProvider` blocks render on fresh session until KV data loaded; merges in background if localStorage already populated. Valid keys whitelisted in `/api/data`.

- **Performance dashboard:** `/dashboard/performance` — **default landing page**. Auto-loads on mount; auto-refreshes every 15 min. **Account detection:** `loadAdAccountConfigs()` → filter `!hidden`; fall back to all. **Multi-account:** `Promise.allSettled` for sync + load per account; rows merged. **Historical ROI:** page always fetches an additional `combined` call for the last 3 days (today−3 → today−1) and stores it in `historicalRows`; table computes -1D/-2D/-3D ROI per campaign from this data. **Columns:** `ColumnSelector` — 24 toggleable columns (raw KingsRoad fields + computed metrics: CPM, CPC, CTR, RPC, RPR, CPR, CVR, Profit); default visible set excludes lesser-used columns. Column label notes: "Clicks" = Snap swipes, "VZ Clicks" = KingsRoad `clicks`, "Funnel Clicks" = KingsRoad `funnel_clicks`. **Computed metrics:** all calculated client-side in `PerformanceTable` `useMemo`; RPC/RPR use `funnel_clicks >= 10` threshold (Visymo doesn't report < 10 clicks). **Inline controls:** Budget and Bid cells have pencil-icon edit mode (click → input → Enter/blur saves via PATCH); Status cell is a toggle switch (click fires PATCH immediately). No separate BudgetBidControls component. **Bulk actions bar:** appears at bottom of table when ≥1 row selected via checkbox; applies budget/bid/status to all selected campaigns in parallel. **Drilldown:** clicking a campaign row opens `DrilldownModal` which async-fetches from `/api/reporting/drilldown` (no date filter → all historical dates). **Campaign filter:** text input above table; client-side substring filter on `ad_squad_name`. Attribution: `snapchat_ad_squad_stats.ad_squad_id = kingsroad_report.custom_channel_name` (JOIN key). **ROI color:** green ≥ 100%, amber 50–99%, red < 50%, gray = null. **Combined/drilldown query:** KingsRoad pre-aggregated by `(custom_channel_name, record_date)` in subquery (prevents overcount when multiple country rows per date). KingsRoad fields stored: `clicks`, `earnings_eur`, `page_views`, `ad_requests`, `matched_ad_requests`, `funnel_clicks`, `funnel_impressions`, `funnel_requests`, `domain_name`.

## Security Notes

- **`isAdAccountAllowed` denies by default:** When `session.allowedAdAccountIds` is empty (fresh session before dashboard loads), the function returns `false`. It is populated by `/api/snapchat/ad-accounts` — all Snapchat API routes that accept an `adAccountId` must call this check. Do NOT revert the default to `true`. The four Snapchat GET proxy routes (`campaigns`, `adsquads`, `creatives`, `ads`) require `?adAccountId=` and call `isAdAccountAllowed` before fetching.
- **`/api/data` is user-scoped:** Blob paths are `metadata/{googleUserId}/{key}.json`. Blobs use `access: "public"` (store constraint — `boilerroom-silo` is a public store). Paths are non-guessable (contain internal Google user ID) but not secret. Never use a shared path. Valid keys are whitelisted: `br_silo_assets`, `br_silo_tags`, `br_pixels`, `br_presets`, `br_feed_providers`, `br_articles`, `br_ad_accounts_v1`.
- **`/api/feed-providers/channels/*` is user-scoped:** GET/POST/DELETE pass `session.googleUserId` to all DB functions; queries filter by `google_user_id` so users can only access their own channels. `assignChannel`, `releaseChannel`, and `normalizeChannelStatuses` all require `googleUserId` — never call them without it.
- **`/api/silo/delete` is user-scoped:** Before calling `del()`, the route fetches `metadata/{googleUserId}/br_silo_assets.json` from the blob store and verifies every URL to be deleted is present in the user's asset list. Fails safe (500) if the KV fetch fails.
- **`media/upload` and `media/poll` require ownership checks:** Both routes call `isAdAccountAllowed` before forwarding to Snapchat.
- **`media/copy` checks both source and destination:** Both `sourceAdAccountId` and `destinationAdAccountId` must be verified to prevent cross-account media exfiltration. Error response uses `retryAsUpload` (not `orgMismatch`) — only set when the error string contains "different organization".
- **`media/upload-from-blob` SSRF guard:** `blobUrl` must end with `.vercel-storage.com` before server-side fetch.
- **KingsRoad pagination SSRF guard:** `page.next` URL is validated to originate from `https://partnerhub-api.kingsroad.io` before following. Loop aborts on unexpected origin or invalid URL.
- **`/api/reporting/sync` date range is validated:** Zod schema enforces YYYY-MM-DD format and a maximum 90-day window. Requests outside this range return 400.
- **`/api/auth/refresh` skips Snapchat when token is still valid:** Pre-check compares `session.snapExpiresAt` against now − 5 min; returns `{ ok: true, cached: true }` without hitting Snapchat's token endpoint.
- **Session cookie has `maxAge: 14 days`:** Prevents indefinite persistence on shared machines. iron-session resets the clock on every `save()`.
- **Snapchat token revoked on disconnect:** `/api/auth/snapchat/disconnect` calls Snapchat's `revoke_token` endpoint (best-effort) before clearing the session fields.
- **Snapchat error bodies are not forwarded verbatim:** Routes `console.error` full details and return generic codes to the client (`"upload_failed"`, `"internal_error"`, etc.).
- **Content Security Policy (`next.config.mjs`):** `img-src` allows `'self' data: blob: https://*.public.blob.vercel-storage.com https://lh3.googleusercontent.com`. If you add images from a new external domain, update this list or they will be silently blocked. **Dev vs prod split:** `script-src` includes `'unsafe-eval'` in development only (`process.env.NODE_ENV === "development"`) because Next.js/webpack wraps every module in `eval()` for fast refresh — production keeps it strict without eval.

## Snapchat API Field Notes

- Campaign objective: `objective_v2_properties.objective_v2_type` is always `"SALES"` — hardcoded in the orchestrator and hidden from the UI.
- Campaign budget: only `daily_budget_micro` is supported (`spendCapType: "DAILY_BUDGET" | "NO_BUDGET"`). Minimum: $20 (20,000,000 micro). Ad squads support both daily and lifetime.
- `lifetime_spend_cap_micro` and `lifetime_budget_micro` are NOT sent on campaigns. `lifetime_budget_micro` is ad-squad only.
- `spend_cap_type` is an ad squad field only, not valid on campaigns.
- Ad squad `delivery_constraint` is required — `"DAILY_BUDGET"` or `"LIFETIME_BUDGET"`. `conversion_location` is NOT valid (E1001).
- Valid optimization goals (SALES + WEB): `PIXEL_PURCHASE`, `PIXEL_SIGNUP`, `PIXEL_ADD_TO_CART`, `PIXEL_PAGE_VIEW`, `LANDING_PAGE_VIEW`. Do not add goals from other objectives — they return E2844 with SALES objective.
- Ad squad pixel tracking: only `pixel_id` sent, always optional. `pixel_conversion_event` is NOT valid (E1001).
- Creative destination URL: `web_view_properties.url` (WEB_VIEW) or `deep_link_properties.deep_link_url` (DEEP_LINK/APP_INSTALL).
- Ad destination URL: URL fields are NOT sent on the Ad payload — Creative only. Ad payload: `ad_squad_id`, `creative_id`, `name`, `type`, `status`.
- Ad `type` for WEB_VIEW creatives is `"REMOTE_WEBPAGE"`. `AD_TYPE_MAP`: `WEB_VIEW → REMOTE_WEBPAGE`, all others → `SNAP_AD`.
- Interaction type is hardcoded to WEB_VIEW. **`call_to_action` is valid on `WEB_VIEW` creatives.** Do NOT send `call_to_action` on `SNAP_AD` creatives (E2002).
- `headline` is optional on creatives (`SnapCreativePayload`). Do NOT send `headline: ""` — Snapchat defaults `brand_name` to `""` when omitted, and E2607 fires if both are the same value (including both empty). Orchestrator uses `cr.headline || undefined`.
- Batch error responses: errors in `sub_request_error_reason` (not `error_type`/`message`).
- Ad squad geo targeting: `targeting.geos` (NOT `geo_locations`) — `{ country_code: string }` with **lowercase** codes. Old presets with `geoCountryCode` (singular) are migrated on load.
- Ad squad device targeting: `devices[].device_type` is `"MOBILE"` or `"WEB"`. Optional `os_type` (`"iOS"` or `"ANDROID"`) when MOBILE.
- Fields intentionally omitted from payloads: `frequency_cap_max_impressions`, `frequency_cap_time_period`, `shareable`. Hardcoded: `pacing_type` (`"STANDARD"`). `profile_properties: { profile_id: string }` is required on creatives (E2652 if absent, E2006 if null) — orchestrator auto-fetches via `GET /api/snapchat/profiles`; returns early with errors if unresolvable.
- Batch API response order is not guaranteed — orchestrator matches by `name` with positional-index fallback (`find(r => r.name === x) ?? results[i]`). Both layers required.
- **Stats API (`/adsquads/{id}/stats`):** `granularity=DAY` returns `timeseries_stats[0].timeseries_stat.timeseries[]` — NOT `total_stats` (which is only used for `granularity=TOTAL`). The `spend` field in `timeseries_stats` is already in **micro-dollars** (do NOT multiply by 1,000,000). Times must be at midnight in the ad account's timezone (`America/Los_Angeles`): offset `-07:00` (PDT, summer) or `-08:00` (PST, winter). `end_time` must be midnight of the day AFTER the last desired date (exclusive). Country breakdown (`report_dimension=country`) is not used — stats are totals only. Valid `fields`: `impressions`, `swipes`, `spend`, `video_views`.
