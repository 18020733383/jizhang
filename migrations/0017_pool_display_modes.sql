-- 资金池展示模式：滚存型显示累计余额/总目标，清零型只显示月度预算控制。
ALTER TABLE pools ADD COLUMN pool_mode TEXT NOT NULL DEFAULT 'rollover'
  CHECK (pool_mode IN ('rollover', 'monthly'));

ALTER TABLE pools ADD COLUMN target_amount REAL NOT NULL DEFAULT 0;
