import { startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import type { Transaction } from '../store/useStore.types';

/** 本月各资金池支出合计（主货币），仅统计 type=expense 且日期在本月内 */
export function monthExpenseByPoolId(transactions: Transaction[]): Map<string, number> {
  const now = new Date();
  const start = startOfMonth(now);
  const end = endOfMonth(now);
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'expense' || !t.poolId) continue;
    const d = new Date(t.date);
    if (!isWithinInterval(d, { start, end })) continue;
    map.set(t.poolId, (map.get(t.poolId) ?? 0) + t.amount);
  }
  return map;
}

/** 累计分配到各资金池的金额（主货币），仅统计 type=income 且 allocations 包含该 poolId */
export function totalAllocatedByPoolId(transactions: Transaction[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'income' || !t.allocations) continue;
    for (const alloc of t.allocations) {
      map.set(alloc.poolId, (map.get(alloc.poolId) ?? 0) + alloc.amount);
    }
  }
  return map;
}
