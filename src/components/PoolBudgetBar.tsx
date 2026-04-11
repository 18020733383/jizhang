import React from 'react';
import { cn } from '../lib/utils';

interface Props {
  /** 预算上限（整条代表 100%） */
  budget: number;
  /** 池内当前余额，即已分配到本池的资金 */
  balance: number;
  /** 本月在该池上的支出（主货币） */
  spentMonth: number;
  /** 可选：紧凑模式 */
  compact?: boolean;
  /** 深色背景上的文字 */
  variant?: 'light' | 'dark';
  className?: string;
}

/**
 * 单条进度：轨道=预算；绿=余额占预算比例；红=本月支出占预算比例（叠在绿上，同一条）。
 * 绿未满 = 预算额度尚未被余额占满；红铺满 ≈ 本月支出达到/超过预算（透支风险）。
 */
export default function PoolBudgetBar({
  budget,
  balance,
  spentMonth,
  compact,
  variant = 'light',
  className,
}: Props) {
  if (budget <= 0) return null;

  const greenPct = Math.min(100, Math.max(0, (balance / budget) * 100));
  const redPct = Math.min(100, Math.max(0, (spentMonth / budget) * 100));
  const overBurn = spentMonth >= budget || (balance < 0 && spentMonth > 0);

  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        className={cn(
          'relative w-full rounded-full overflow-hidden',
          compact ? 'h-2' : 'h-3',
          variant === 'dark' ? 'bg-slate-700' : 'bg-slate-200 dark:bg-slate-600'
        )}
      >
        {/* 绿：已分配到本池的资金（余额）相对预算 */}
        <div
          className="absolute left-0 top-0 bottom-0 z-[1] rounded-l-full bg-emerald-500 transition-[width] duration-500 ease-out"
          style={{
            width: `${greenPct}%`,
            borderRadius: greenPct >= 99.5 ? '9999px' : undefined,
          }}
        />
        {/* 红：本月在本池上的支出相对预算（叠在上层） */}
        <div
          className={cn(
            'absolute left-0 top-0 bottom-0 z-[2] rounded-l-full transition-[width] duration-500 ease-out',
            overBurn ? 'bg-rose-600' : 'bg-rose-500/80'
          )}
          style={{
            width: `${redPct}%`,
            borderRadius: redPct >= 99.5 ? '9999px' : undefined,
          }}
        />
      </div>
      {!compact && (
        <div
          className={cn(
            'flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]',
            variant === 'dark' ? 'text-slate-400' : 'text-gray-500 dark:text-slate-400'
          )}
        >
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 align-middle mr-1" />
            已分配（余额）{balance.toFixed(2)} · {greenPct.toFixed(0)}%
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-rose-500 align-middle mr-1" />
            本月支出 {spentMonth.toFixed(2)} · {redPct.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}
