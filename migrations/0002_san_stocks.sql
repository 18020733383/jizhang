-- SAN值股市 — 焦虑来源股票表

-- 焦虑"股份"（像股票一样追踪焦虑来源）
CREATE TABLE IF NOT EXISTS san_stocks (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,                    -- 焦虑来源名称，如"工作压力"、"房贷"、"催婚"
  code TEXT NOT NULL UNIQUE,             -- 股票代码，如"WORK"、"LOAN"、"MARR"
  description TEXT NOT NULL DEFAULT '',  -- 描述
  base_value REAL NOT NULL DEFAULT 100,  -- 基准SAN值（初始值）
  current_value REAL NOT NULL DEFAULT 100, -- 当前SAN值
  color TEXT NOT NULL DEFAULT '#ef4444', -- 股票颜色
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- SAN值历史记录（像股价走势一样）
CREATE TABLE IF NOT EXISTS san_history (
  id TEXT PRIMARY KEY NOT NULL,
  stock_id TEXT NOT NULL,
  value REAL NOT NULL,                   -- 当时的SAN值
  note TEXT NOT NULL DEFAULT '',         -- 记录说明
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (stock_id) REFERENCES san_stocks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_san_history_stock_date ON san_history(stock_id, recorded_at DESC);
