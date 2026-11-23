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
