import React from 'react';
import { cn } from '../lib/utils';

interface Props {
  budget: number;
  balance: number;
  spentMonth: number;
  compact?: boolean;
  variant?: 'light' | 'dark';
  className?: string;
}

/**
 * 进度条逻辑：
 * - 预算(budget) = 条长度100%
 * - 已分配(balance) = 绿色
 * - 已用掉(spentMonth) = 红色（叠在绿色上）
 * - 剩余已分配 = balance - spentMonth = 绿色剩余部分
 * - 剩余未分配 = budget - balance = 灰色
 * 
 * 如果没有实际余额(balance=0)，显示为空
 */
export default function PoolBudgetBar({
  budget,
  balance,
  spentMonth,
  compact,
  variant = 'light',
  className,
}: Props) {
  if (budget <= 0 || balance <= 0) return null;

  const usedMoney = Math.min(balance, spentMonth);
  const usedPct = (usedMoney / budget) * 100;
  const allocatedRemaining = balance - spentMonth;
  const allocatedRemainingPct = Math.max(0, (allocatedRemaining / budget) * 100);
  const unallocatedPct = Math.max(0, ((budget - balance) / budget) * 100);
  const overBudget = spentMonth > balance;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        className={cn(
          'relative w-full rounded-full overflow-hidden flex',
          compact ? 'h-2' : 'h-3',
          variant === 'dark' ? 'bg-slate-700' : 'bg-slate-200 dark:bg-slate-600'
        )}
      >
        {/* 红色：已用掉 */}
        <div
          className={cn(
            'h-full rounded-l-full transition-[width] duration-500 ease-out',
            overBudget ? 'bg-rose-600' : 'bg-rose-500'
          )}
          style={{
            width: `${usedPct}%`,
            borderRadius: usedPct >= 99.5 ? '9999px' : undefined,
          }}
        />
        {/* 绿色：剩余已分配 */}
        <div
          className="h-full bg-emerald-500 transition-[width] duration-500 ease-out"
          style={{
            width: `${allocatedRemainingPct}%`,
            borderRadius: allocatedRemainingPct >= 99.5 ? '9999px' : undefined,
          }}
        />
        {/* 灰色：未分配 */}
        <div
          className={cn(
            'h-full transition-[width] duration-500 ease-out',
            variant === 'dark' ? 'bg-slate-600' : 'bg-slate-300 dark:bg-slate-500'
          )}
          style={{
            width: `${unallocatedPct}%`,
            borderRadius: unallocatedPct >= 99.5 ? '9999px' : undefined,
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
            已分配 {balance.toFixed(2)}
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-rose-500 align-middle mr-1" />
            已用 {spentMonth.toFixed(2)}
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-emerald-400 align-middle mr-1" />
            剩已分 {(balance - spentMonth).toFixed(2)}
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-slate-400 align-middle mr-1" />
            未分配 {(budget - balance).toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}