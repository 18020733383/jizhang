import type { Transaction } from '../store/useStore.types';

export function currentBudgetMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function transactionMonth(date: string): string | null {
  const match = date.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : null;
}

function isInMonth(date: string, month: string) {
  return transactionMonth(date) === month;
}

/** 目标月份各资金池支出合计（主货币） */
export function monthExpenseByPoolId(
  transactions: Transaction[],
  month = currentBudgetMonth(),
): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'expense' || !t.poolId || !isInMonth(t.date, month)) continue;
    map.set(t.poolId, (map.get(t.poolId) ?? 0) + t.amount);
  }
  return map;
}

/**
 * 目标月份各资金池净拨入金额（主货币）：收入分配 + 转入 - 转出。
 * 转账必须同时影响两端，避免同一笔资金在多个池子的月预算中重复占用。
 */
export function monthAllocatedByPoolId(
  transactions: Transaction[],
  month = currentBudgetMonth(),
): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (!isInMonth(t.date, month)) continue;
    if (t.type === 'income' && t.allocations) {
      for (const alloc of t.allocations) {
        map.set(alloc.poolId, (map.get(alloc.poolId) ?? 0) + alloc.amount);
      }
    } else if (t.type === 'transfer') {
      if (t.toPoolId) {
        map.set(t.toPoolId, (map.get(t.toPoolId) ?? 0) + t.amount);
      }
      if (t.fromPoolId) {
        map.set(t.fromPoolId, (map.get(t.fromPoolId) ?? 0) - t.amount);
      }
    }
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
