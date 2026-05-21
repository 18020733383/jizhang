ALTER TABLE writing_articles ADD COLUMN encrypted_content TEXT;
ALTER TABLE writing_articles ADD COLUMN content_iv TEXT;
ALTER TABLE writing_articles ADD COLUMN encryption_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE writing_cards ADD COLUMN qr_hash_version INTEGER NOT NULL DEFAULT 0;
