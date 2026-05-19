ALTER TABLE bet_agreements ADD COLUMN agreement_type TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE bet_agreements ADD COLUMN share_count REAL NOT NULL DEFAULT 0;
ALTER TABLE bet_agreements ADD COLUMN share_price REAL NOT NULL DEFAULT 0;
