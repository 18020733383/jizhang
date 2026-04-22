-- 虚拟储蓄卡表
CREATE TABLE IF NOT EXISTS virtual_cards (
  id TEXT PRIMARY KEY NOT NULL,
  card_number TEXT UNIQUE NOT NULL,
  card_holder TEXT NOT NULL,
  denomination INTEGER NOT NULL,
  current_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'saving',
  front_image TEXT,
  back_image TEXT,
  issue_date TEXT NOT NULL,
  batch_id TEXT,
  printed INTEGER DEFAULT 0,
  printed_at TEXT,
  depleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cards_status ON virtual_cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_batch ON virtual_cards(batch_id);

-- 卡号生成规则: 6288 + 6位随机 + 4位序号 + 2位校验位 = 16位
-- 例如: 6288 123456 0001 23
