import type { Allocation, IncomeAllocationPreset } from '../store/useStore.types';

/**
 * 将预设比例应用到当前资金池列表：去掉已删除池子后，若比例总和非 100% 则按比例缩放。
 */
export function presetPercentsToIncomeAllocations(
  preset: IncomeAllocationPreset,
  validPoolIds: string[]
): Allocation[] {
  const set = new Set(validPoolIds);
  let rows = preset.allocations
    .filter((a) => set.has(a.poolId))
    .map((a) => ({ poolId: a.poolId, amount: a.percent }));

  if (validPoolIds.length === 0) return [];

  if (rows.length === 0) {
    return [{ poolId: validPoolIds[0], amount: 100 }];
  }

  const sum = rows.reduce((s, r) => s + r.amount, 0);
  if (sum <= 0) {
    return [{ poolId: rows[0].poolId, amount: 100 }];
  }
  if (Math.abs(sum - 100) < 0.01) return rows;
  return rows.map((r) => ({
    poolId: r.poolId,
    amount: (r.amount / sum) * 100,
  }));
}
