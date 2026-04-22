-- 添加对赌协议星标标记
ALTER TABLE bet_agreements ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0;