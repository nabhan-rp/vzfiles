-- Dedicated Cloudflare D1 Schema for VZ Files (files.vz.gay / file.vz.gay)
-- Safe to run standalone on a fresh D1 database without legacy portal tables.

CREATE TABLE IF NOT EXISTS user_vaults (
  sub TEXT PRIMARY KEY,
  profiles_json TEXT NOT NULL DEFAULT '[]',
  active_profile_id TEXT DEFAULT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_vaults_updated_at
  ON user_vaults (updated_at);

CREATE TABLE IF NOT EXISTS user_transfer_history (
  sub TEXT NOT NULL,
  hash TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  url TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'file',
  is_anonymous INTEGER NOT NULL DEFAULT 1,
  profile_id TEXT DEFAULT NULL,
  profile_label TEXT NOT NULL DEFAULT '',
  path TEXT DEFAULT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (sub, hash)
);

CREATE INDEX IF NOT EXISTS idx_user_transfer_history_sub_created
  ON user_transfer_history (sub, created_at DESC);
