-- Add sort_order column to bet_agreements for manual ordering
ALTER TABLE bet_agreements ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;