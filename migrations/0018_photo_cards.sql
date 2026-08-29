-- 30 天生活照片卡：元数据保存在 D1，图片文件保存在 Backblaze B2。
CREATE TABLE IF NOT EXISTS photo_cards (
  id TEXT PRIMARY KEY NOT NULL,
  day_number INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  opened_on TEXT NOT NULL,
  front_text TEXT NOT NULL DEFAULT '',
  back_text TEXT NOT NULL DEFAULT '',
  front_image_key TEXT,
  front_image_id TEXT,
  front_content_type TEXT,
  back_image_key TEXT,
  back_image_id TEXT,
  back_content_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_cards_day_number ON photo_cards(day_number);
CREATE INDEX IF NOT EXISTS idx_photo_cards_opened_on ON photo_cards(opened_on DESC);
