CREATE TABLE IF NOT EXISTS writing_progress_logs (
  id TEXT PRIMARY KEY NOT NULL,
  draft_id TEXT,
  card_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0,
  event_type TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_writing_progress_created ON writing_progress_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_writing_progress_draft ON writing_progress_logs(draft_id);
CREATE INDEX IF NOT EXISTS idx_writing_progress_card ON writing_progress_logs(card_id);
