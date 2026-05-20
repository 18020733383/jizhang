CREATE TABLE IF NOT EXISTS writing_articles (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS writing_cards (
  id TEXT PRIMARY KEY NOT NULL,
  card_number TEXT UNIQUE NOT NULL,
  qr_hash TEXT UNIQUE NOT NULL,
  article_id TEXT NOT NULL,
  title TEXT NOT NULL,
  front_image TEXT,
  back_image TEXT,
  issue_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  qr_locked INTEGER NOT NULL DEFAULT 0,
  printed INTEGER NOT NULL DEFAULT 0,
  printed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (article_id) REFERENCES writing_articles(id)
);

CREATE INDEX IF NOT EXISTS idx_writing_cards_hash ON writing_cards(qr_hash);
CREATE INDEX IF NOT EXISTS idx_writing_cards_article ON writing_cards(article_id);
