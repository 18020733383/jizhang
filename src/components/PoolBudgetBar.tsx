import React, { useState } from 'react';
import { cn } from '../lib/utils';

interface Props {
  budget: number;
  allocated: number;
  spentMonth: number;
  compact?: boolean;
  variant?: 'light' | 'dark';
  className?: string;
}

/**
 * 进度条逻辑：
 * - 预算(budget) = 条长度100%
 * - 已分配(allocated) = 累计分配到该池的钱 = 绿色
 * - 已用掉(spentMonth) = 红色（叠在绿色上）
 * - 剩余已分配 = allocated - spentMonth = 绿色剩余部分
 * - 剩余未分配 = budget - allocated = 灰色
 * 
 * 如果没有累计分配(allocated=0)，显示为空
 */
export default function PoolBudgetBar({
  budget,
  allocated,
  spentMonth,
  compact,
  variant = 'light',
  className,
}: Props) {
  const [isHovered, setIsHovered] = useState(false);

  if (budget <= 0) return null;

  const usedMoney = Math.min(allocated, spentMonth);
  const usedPct = (usedMoney / budget) * 100;
  const allocatedRemaining = Math.max(0, allocated - spentMonth);
  const allocatedRemainingPct = Math.max(0, (allocatedRemaining / budget) * 100);
  const unallocatedPct = Math.max(0, ((budget - allocated) / budget) * 100);
  const overBudget = spentMonth > allocated;

  // 计算显示百分比：已用 / 预算
  const displayPct = usedPct.toFixed(0);

  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        className="relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {!compact && !isHovered && (
          <div className={cn(
            'absolute -top-0.5 left-1/2 -translate-x-1/2 z-10 px-1.5 py-0.5 rounded text-[10px] font-medium',
            variant === 'dark' ? 'bg-slate-900 text-slate-200' : 'bg-white text-gray-700 shadow-sm'
          )}>
            {displayPct}%
          </div>
        )}
        <div
          className={cn(
            'relative w-full rounded-full overflow-hidden flex',
            compact ? 'h-2' : 'h-3',
            variant === 'dark' ? 'bg-slate-700' : 'bg-slate-200 dark:bg-slate-600'
          )}
        >
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
          <div
            className="h-full bg-emerald-500 transition-[width] duration-500 ease-out"
            style={{
              width: `${allocatedRemainingPct}%`,
              borderRadius: allocatedRemainingPct >= 99.5 ? '9999px' : undefined,
            }}
          />
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
      </div>
      {!compact && isHovered && (
        <div
          className={cn(
            'flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]',
            variant === 'dark' ? 'text-slate-400' : 'text-gray-500 dark:text-slate-400'
          )}
        >
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 align-middle mr-1" />
            已分配 {allocated.toFixed(2)}
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-rose-500 align-middle mr-1" />
            已用 {spentMonth.toFixed(2)}
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-emerald-400 align-middle mr-1" />
            剩已分 {(allocated - spentMonth).toFixed(2)}
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-slate-400 align-middle mr-1" />
            未分配 {(budget - allocated).toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}