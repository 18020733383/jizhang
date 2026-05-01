-- API Token management for Open API
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_token ON api_tokens(token);