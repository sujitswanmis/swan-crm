-- Additive table for storing Firebase Cloud Messaging (FCM) push tokens per employee device
CREATE TABLE IF NOT EXISTS user_push_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  company TEXT NOT NULL DEFAULT 'TNT00001',
  platform TEXT NOT NULL DEFAULT 'android',
  fcm_token TEXT NOT NULL,
  app_version_code INTEGER,
  device_model TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fcm_token)
);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_active
  ON user_push_tokens (user_id, is_active);
