-- 绩效池额度来源。条目本身不计入收入，只有完成对赌协议后才视为兑现。
CREATE TABLE IF NOT EXISTS performance_entries (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  entry_date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_performance_entries_date
  ON performance_entries(entry_date DESC, created_at DESC);

ALTER TABLE bet_agreements
  ADD COLUMN performance_budget REAL NOT NULL DEFAULT 0;

ALTER TABLE bet_agreements
  ADD COLUMN performance_redeemed_at TEXT;

ALTER TABLE bet_agreements
  ADD COLUMN performance_transaction_id TEXT;

ALTER TABLE bet_agreements
  ADD COLUMN performance_pool_id TEXT;
