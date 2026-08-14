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

/** 目标月份收入分配到各资金池的金额（主货币） */
export function monthAllocatedByPoolId(
  transactions: Transaction[],
  month = currentBudgetMonth(),
): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'income' || !t.allocations || !isInMonth(t.date, month)) continue;
    for (const alloc of t.allocations) {
      map.set(alloc.poolId, (map.get(alloc.poolId) ?? 0) + alloc.amount);
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
