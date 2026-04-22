-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  trust_level INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 用户隐私设置表
CREATE TABLE IF NOT EXISTS user_privacy (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  privacy_level INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_privacy_user ON user_privacy(user_id);
CREATE INDEX IF NOT EXISTS idx_privacy_item ON user_privacy(item_type, item_id);

-- 插入默认管理员 (密码: admin123)
-- SHA-256 hash of "admin123"
INSERT OR IGNORE INTO users (id, username, password_hash, trust_level) VALUES 
  ('admin', 'admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 3);
