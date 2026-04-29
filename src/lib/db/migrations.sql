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

CREATE TABLE IF NOT EXISTS kingsroad_report (
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
