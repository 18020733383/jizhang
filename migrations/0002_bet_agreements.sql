-- 对赌协议表
CREATE TABLE IF NOT EXISTS bet_agreements (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  target_weight REAL NOT NULL,
  start_weight REAL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reward REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- active, completed, failed
  completed_at TEXT,
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bet_status ON bet_agreements(status);
CREATE INDEX IF NOT EXISTS idx_bet_dates ON bet_agreements(start_date, end_date);