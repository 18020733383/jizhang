import React from 'react';
import { cn } from '../lib/utils';

interface Props {
  /** 投入金额（整条代表 100%） */
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
 * 堆叠进度条：绿=投入（余额+本月支出），红=本月支出
 * 投入1000，花200 -> 红20% + 绿80%（剩余）
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

  const invested = balance + spentMonth;
  const spentPct = Math.min(100, Math.max(0, (spentMonth / budget) * 100));
  const remainingPct = Math.max(0, 100 - spentPct);
  const overBudget = spentMonth > budget || (invested < 0 && spentMonth > 0);

  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        className={cn(
          'relative w-full rounded-full overflow-hidden flex',
          compact ? 'h-2' : 'h-3',
          variant === 'dark' ? 'bg-slate-700' : 'bg-slate-200 dark:bg-slate-600'
        )}
      >
        {/* 红：本月支出占投入比例 */}
        <div
          className={cn(
            'h-full rounded-l-full transition-[width] duration-500 ease-out',
            overBudget ? 'bg-rose-600' : 'bg-rose-500'
          )}
          style={{
            width: `${spentPct}%`,
            borderRadius: spentPct >= 99.5 ? '9999px' : undefined,
          }}
        />
        {/* 绿：剩余（投入-支出）占投入比例 */}
        <div
          className="h-full bg-emerald-500 transition-[width] duration-500 ease-out"
          style={{
            width: `${remainingPct}%`,
            borderRadius: remainingPct >= 99.5 ? '9999px' : undefined,
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
            <span className="inline-block w-2 h-2 rounded-sm bg-rose-500 align-middle mr-1" />
            本月支出 {spentMonth.toFixed(2)} · {spentPct.toFixed(0)}%
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 align-middle mr-1" />
            剩余 {(budget - spentMonth).toFixed(2)} · {remainingPct.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}
