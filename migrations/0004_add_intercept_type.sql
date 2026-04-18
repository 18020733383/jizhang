-- 修改 transactions 表，添加 intercept 类型支持
-- SQLite 不支持直接修改 CHECK 约束，需要重建表

-- 1. 创建新表（包含 intercept 类型）
CREATE TABLE IF NOT EXISTS transactions_new (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer', 'intercept')),
  amount REAL NOT NULL,
  original_amount REAL NOT NULL,
  currency TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  pool_id TEXT,
  from_pool_id TEXT,
  to_pool_id TEXT
);

-- 2. 复制旧数据
INSERT INTO transactions_new 
  (id, type, amount, original_amount, currency, date, note, pool_id, from_pool_id, to_pool_id)
SELECT 
  id, type, amount, original_amount, currency, date, note, pool_id, from_pool_id, to_pool_id
FROM transactions
WHERE 1=1
ON CONFLICT(id) DO NOTHING;

-- 3. 删除旧表
DROP TABLE IF EXISTS transactions;

-- 4. 重命名新表
ALTER TABLE transactions_new RENAME TO transactions;

-- 5. 重建索引
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);