CREATE TABLE IF NOT EXISTS snapchat_ad_squad_stats (
  ad_squad_id   TEXT        NOT NULL,
  ad_account_id TEXT        NOT NULL,
  stat_date     DATE        NOT NULL,
  country_code  TEXT        NOT NULL DEFAULT '',
  impressions   BIGINT      NOT NULL DEFAULT 0,
  swipes        BIGINT      NOT NULL DEFAULT 0,
  spend_micro   BIGINT      NOT NULL DEFAULT 0,
  video_views   BIGINT      NOT NULL DEFAULT 0,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ad_squad_id, stat_date, country_code)
);

CREATE TABLE IF NOT EXISTS visymo_report (
  record_date               DATE           NOT NULL,
  custom_channel_name       TEXT           NOT NULL,
  country_code              TEXT           NOT NULL DEFAULT '',
  domain_name               TEXT           NOT NULL DEFAULT '',
  ad_requests               BIGINT         NOT NULL DEFAULT 0,
  clicks                    BIGINT         NOT NULL DEFAULT 0,
  earnings_eur              NUMERIC(14, 4) NOT NULL DEFAULT 0,
  page_views                BIGINT         NOT NULL DEFAULT 0,
  individual_ad_impressions BIGINT         NOT NULL DEFAULT 0,
  matched_ad_requests       BIGINT         NOT NULL DEFAULT 0,
  funnel_clicks             BIGINT         NOT NULL DEFAULT 0,
  funnel_impressions        BIGINT         NOT NULL DEFAULT 0,
  fetched_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  PRIMARY KEY (record_date, custom_channel_name, country_code, domain_name)
);

CREATE TABLE IF NOT EXISTS report_sync_log (
  source        TEXT        NOT NULL,
  sync_date     DATE        NOT NULL,
  ad_account_id TEXT        NOT NULL DEFAULT '',
  last_synced   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (source, sync_date, ad_account_id)
);

CREATE TABLE IF NOT EXISTS feed_provider_channels (
  id               TEXT        PRIMARY KEY,
  feed_provider_id TEXT        NOT NULL,
  channel_id       TEXT        NOT NULL,
  traffic_source   TEXT        NOT NULL DEFAULT 'Snap',
  status           TEXT        NOT NULL DEFAULT 'available',
  campaign_snap_id TEXT,
  in_use_since     TIMESTAMPTZ,
  cooldown_since   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE feed_provider_channels ADD COLUMN IF NOT EXISTS google_user_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS fpc_fp_status ON feed_provider_channels(feed_provider_id, status);
CREATE INDEX IF NOT EXISTS fpc_user ON feed_provider_channels(google_user_id);

ALTER TABLE visymo_report ADD COLUMN IF NOT EXISTS funnel_requests BIGINT NOT NULL DEFAULT 0;
ALTER TABLE snapchat_ad_squad_stats ADD COLUMN IF NOT EXISTS ad_squad_name TEXT NOT NULL DEFAULT '';
ALTER TABLE snapchat_ad_squad_stats ADD COLUMN IF NOT EXISTS conversion_purchases BIGINT NOT NULL DEFAULT 0;
ALTER TABLE snapchat_ad_squad_stats ADD COLUMN IF NOT EXISTS conversion_purchase_value BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS user_snapchat_tokens (
  google_user_id    TEXT        PRIMARY KEY,
  refresh_token_enc TEXT        NOT NULL,
  ad_account_ids    JSONB       NOT NULL DEFAULT '[]',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS predicto_report (
  record_date        DATE           NOT NULL,
  custom_channel_id  TEXT           NOT NULL,
  revenue_usd        NUMERIC(14, 4) NOT NULL DEFAULT 0,
  clicks             BIGINT         NOT NULL DEFAULT 0,
  funnel_clicks      BIGINT         NOT NULL DEFAULT 0,
  funnel_impressions BIGINT         NOT NULL DEFAULT 0,
  funnel_requests    BIGINT         NOT NULL DEFAULT 0,
  requests           BIGINT         NOT NULL DEFAULT 0,
  fetched_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  PRIMARY KEY (record_date, custom_channel_id)
);

ALTER TABLE feed_provider_channels ADD COLUMN IF NOT EXISTS ad_squad_snap_id TEXT;
ALTER TABLE predicto_report ADD COLUMN IF NOT EXISTS impressions BIGINT NOT NULL DEFAULT 0;

ALTER TABLE feed_provider_channels ADD COLUMN IF NOT EXISTS paused_since TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS fpc_ad_squad ON feed_provider_channels(ad_squad_snap_id)
  WHERE ad_squad_snap_id IS NOT NULL;

-- Per-traffic-source available-pool selection (assignChannel filters by source).
CREATE INDEX IF NOT EXISTS fpc_fp_status_source ON feed_provider_channels(feed_provider_id, status, traffic_source);

-- Meta (Facebook) token storage — long-lived tokens (~60 days), no refresh token.
-- access_token_enc is AES-256-GCM encrypted using TOKEN_ENCRYPTION_KEY, same as Snapchat
-- tokens. See src/lib/db/token-crypto.ts — rows written before the SEC-15 backfill are in
-- the legacy SESSION_SECRET-derived format and are distinguishable by the missing 'v2:' prefix.
CREATE TABLE IF NOT EXISTS user_meta_tokens (
  google_user_id   TEXT        PRIMARY KEY,
  meta_user_id     TEXT        NOT NULL DEFAULT '',
  access_token_enc TEXT        NOT NULL,
  ad_account_ids   JSONB       NOT NULL DEFAULT '[]',
  expires_at       BIGINT      NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meta_ad_set_stats (
  ad_set_id            TEXT        NOT NULL,
  ad_account_id        TEXT        NOT NULL,
  stat_date            DATE        NOT NULL,
  ad_set_name          TEXT        NOT NULL DEFAULT '',
  impressions          BIGINT      NOT NULL DEFAULT 0,
  clicks               BIGINT      NOT NULL DEFAULT 0,
  spend_cents          BIGINT      NOT NULL DEFAULT 0,
  purchases            BIGINT      NOT NULL DEFAULT 0,
  purchase_value_cents BIGINT      NOT NULL DEFAULT 0,
  -- Meta Insights reports spend and action values in the AD ACCOUNT's currency, not
  -- USD. Store which currency the row is denominated in and convert on read, so a
  -- row stays reinterpretable if the rate or the account's currency ever changes.
  -- Rows written before this column existed default to USD, which is what every
  -- account that has ever synced actually bills in.
  currency             TEXT        NOT NULL DEFAULT 'USD',
  fetched_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ad_set_id, stat_date)
);
ALTER TABLE meta_ad_set_stats ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';

-- User configuration store (SEC-8). Replaces the Vercel Blob JSON store at
-- metadata/{googleUserId}/{key}.json, which lived in a PUBLIC-read blob store with
-- addRandomSuffix:false — so the whole path was deterministic, and since
-- /api/auth/session hands googleUserId to the browser, the URL was effectively not
-- secret. Verified 2026-08-03: every key returned HTTP 200 with no session at all.
-- Holds feed-provider configs, presets (bids/budgets/ROAS floors), articles, pixels,
-- ad-account and page configs, the build log and the Silo asset index.
-- google_user_id is '__global__' for the one cross-user cache (Instagram PBIA lookups).
CREATE TABLE IF NOT EXISTS user_metadata (
  google_user_id TEXT        NOT NULL,
  key            TEXT        NOT NULL,
  data           JSONB       NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (google_user_id, key)
);

-- Predicto FB — same shape as predicto_report, but revenue generated by
-- Facebook (Meta) traffic. Joined to meta_ad_set_stats via feed_provider_channels.
CREATE TABLE IF NOT EXISTS predicto_fb_report (
  record_date        DATE           NOT NULL,
  custom_channel_id  TEXT           NOT NULL,
  revenue_usd        NUMERIC(14, 4) NOT NULL DEFAULT 0,
  clicks             BIGINT         NOT NULL DEFAULT 0,
  funnel_clicks      BIGINT         NOT NULL DEFAULT 0,
  funnel_impressions BIGINT         NOT NULL DEFAULT 0,
  funnel_requests    BIGINT         NOT NULL DEFAULT 0,
  requests           BIGINT         NOT NULL DEFAULT 0,
  impressions        BIGINT         NOT NULL DEFAULT 0,
  fetched_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  PRIMARY KEY (record_date, custom_channel_id)
);
