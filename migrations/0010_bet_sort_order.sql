-- Add sort_order column to bet_agreements
ALTER TABLE bet_agreements ADD COLUMN sort_order INTEGER DEFAULT NULL;