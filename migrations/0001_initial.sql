-- Flow 记账 — D1 (SQLite) 初始表结构，供后续 Worker 同步 API 使用
-- 当前前端仍使用 localStorage；上线 API 后按此表读写。

CREATE TABLE IF NOT EXISTS pools (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,
  budget REAL NOT NULL DEFAULT 0,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount REAL NOT NULL,
  original_amount REAL NOT NULL,
  currency TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  pool_id TEXT,
  from_pool_id TEXT,
  to_pool_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);

CREATE TABLE IF NOT EXISTS transaction_allocations (
  transaction_id TEXT NOT NULL,
  pool_id TEXT NOT NULL,
  amount REAL NOT NULL,
  PRIMARY KEY (transaction_id, pool_id),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS income_presets (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS income_preset_rows (
  preset_id TEXT NOT NULL,
  pool_id TEXT NOT NULL,
  percent REAL NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (preset_id, pool_id),
  FOREIGN KEY (preset_id) REFERENCES income_presets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
