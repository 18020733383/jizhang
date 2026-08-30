-- 资金池月度快照：保存每个月的配额、模式、目标和期末/最近余额。
-- 旧月份没有真实快照，因此用迁移时的当前资金池配置回填，并明确标记为 backfill。
CREATE TABLE IF NOT EXISTS pool_monthly_snapshots (
  month_key TEXT NOT NULL,
  pool_id TEXT NOT NULL,
  name TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,
  budget REAL NOT NULL DEFAULT 0,
  pool_mode TEXT NOT NULL DEFAULT 'rollover'
    CHECK (pool_mode IN ('rollover', 'monthly')),
  target_amount REAL NOT NULL DEFAULT 0,
  color TEXT NOT NULL,
  snapshot_source TEXT NOT NULL DEFAULT 'live'
    CHECK (snapshot_source IN ('backfill', 'live')),
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (month_key, pool_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_monthly_snapshots_pool
  ON pool_monthly_snapshots(pool_id, month_key DESC);

WITH RECURSIVE month_range(month_key) AS (
  SELECT COALESCE(
    (SELECT MIN(substr(date, 1, 7)) FROM transactions WHERE length(date) >= 7),
    strftime('%Y-%m', 'now')
  )
  UNION ALL
  SELECT strftime('%Y-%m', month_key || '-01', '+1 month')
  FROM month_range
  WHERE month_key < strftime('%Y-%m', 'now')
)
INSERT OR IGNORE INTO pool_monthly_snapshots (
  month_key,
  pool_id,
  name,
  balance,
  budget,
  pool_mode,
  target_amount,
  color,
  snapshot_source,
  captured_at
)
SELECT
  month_range.month_key,
  pools.id,
  pools.name,
  pools.balance,
  pools.budget,
  pools.pool_mode,
  pools.target_amount,
  pools.color,
  CASE
    WHEN month_range.month_key = strftime('%Y-%m', 'now') THEN 'live'
    ELSE 'backfill'
  END,
  CURRENT_TIMESTAMP
FROM month_range
CROSS JOIN pools;
