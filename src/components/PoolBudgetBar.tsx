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

  const safeBudget = Math.max(0, budget);
  const usedMoney = Math.max(spentMonth, 0);
  const allocatedRemaining = Math.max(0, allocated - spentMonth);
  const representedMoney = Math.max(usedMoney, Math.max(allocated, 0));
  const unallocated = Math.max(0, budget - representedMoney);
  const usedPct = Math.min(100, (usedMoney / safeBudget) * 100);
  const allocatedRemainingPct = Math.min(100 - usedPct, (allocatedRemaining / safeBudget) * 100);
  const unallocatedPct = Math.min(100 - usedPct - allocatedRemainingPct, (unallocated / safeBudget) * 100);
  const overAllocation = Math.max(0, spentMonth - allocated);
  const overBudget = Math.max(0, spentMonth - budget);
  const displayPct = Math.round(Math.max(0, (spentMonth / safeBudget) * 100));

  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        className="relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {!compact && (
          <div
            className={cn(
              'absolute -top-0.5 left-1/2 -translate-x-1/2 z-10 text-sm font-black tracking-wider transition-all duration-300 ease-out',
              isHovered ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0',
              displayPct < 30 ? 'text-emerald-500 dark:text-emerald-400' :
              displayPct < 70 ? 'text-amber-500 dark:text-amber-400' :
              'text-rose-500 dark:text-rose-400'
            )}
            style={{
              textShadow: variant === 'dark'
                ? '0 0 12px rgba(0,0,0,0.9), 0 3px 6px rgba(0,0,0,0.6)'
                : '0 0 10px rgba(255,255,255,0.9), 0 2px 4px rgba(0,0,0,0.25)',
            }}
          >
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
          <div className="h-full bg-rose-500 transition-[width] duration-500 ease-out" style={{ width: `${usedPct}%` }} />
          <div className="h-full bg-emerald-500 transition-[width] duration-500 ease-out" style={{ width: `${allocatedRemainingPct}%` }} />
          <div
            className={cn(
              'h-full transition-[width] duration-500 ease-out',
              variant === 'dark' ? 'bg-slate-600' : 'bg-slate-300 dark:bg-slate-500'
            )}
            style={{ width: `${unallocatedPct}%` }}
          />
        </div>
      </div>

      <div className={cn('overflow-hidden transition-all duration-300 ease-out', !compact && isHovered ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0')}>
        <div className={cn('flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] pt-1', variant === 'dark' ? 'text-slate-400' : 'text-gray-500 dark:text-slate-400')}>
          <span><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 align-middle mr-1" />分配 {allocated.toFixed(2)}</span>
          <span><span className="inline-block w-2 h-2 rounded-sm bg-rose-500 align-middle mr-1" />支出 {spentMonth.toFixed(2)}</span>
          <span>未用分配 {allocatedRemaining.toFixed(2)}</span>
          <span>未分配 {unallocated.toFixed(2)}</span>
          {overAllocation > 0 && <span className="text-amber-500">超分配 {overAllocation.toFixed(2)}</span>}
          {overBudget > 0 && <span className="text-rose-500">超预算 {overBudget.toFixed(2)}</span>}
        </div>
      </div>
    </div>
  );
}
