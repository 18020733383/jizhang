-- 添加目标金额和当前金额字段用于进度追踪
ALTER TABLE bet_agreements ADD COLUMN target_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE bet_agreements ADD COLUMN current_amount REAL NOT NULL DEFAULT 0;
