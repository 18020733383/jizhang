-- 修改 bet_agreements 表，移除体重相关字段
-- 如果表已存在旧字段，先删除它们

-- SQLite 不支持直接删除列，需要重建表
-- 1. 创建新表
CREATE TABLE IF NOT EXISTS bet_agreements_new (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reward REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  completed_at TEXT,
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. 从旧表迁移数据（如果有的话）
INSERT INTO bet_agreements_new 
  (id, title, start_date, end_date, reward, status, completed_at, note, created_at)
SELECT 
  id, 
  title, 
  start_date, 
  end_date, 
  reward, 
  status, 
  completed_at, 
  note, 
  created_at
FROM bet_agreements
WHERE 1=1
ON CONFLICT(id) DO NOTHING;

-- 3. 删除旧表
DROP TABLE IF EXISTS bet_agreements;

-- 4. 重命名新表
ALTER TABLE bet_agreements_new RENAME TO bet_agreements;

-- 5. 创建索引
CREATE INDEX IF NOT EXISTS idx_bet_status ON bet_agreements(status);
CREATE INDEX IF NOT EXISTS idx_bet_dates ON bet_agreements(start_date, end_date);