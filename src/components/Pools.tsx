import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Edit2, Trash2, Loader2, Lock, X, Activity, Zap, Waves, ShieldAlert, CalendarDays, TrendingDown } from 'lucide-react';
import { useStore, Pool, Transaction } from '../store/useStore';
import { useThemeStore } from '../store/useThemeStore';
import { cn, maskText } from '../lib/utils';
import { currentBudgetMonth, monthAllocatedByPoolId, monthExpenseByPoolId } from '../lib/poolBudget';
import { apiGet, apiPost, apiPatch } from '../lib/api';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays, differenceInCalendarDays, differenceInCalendarWeeks, format, getDay, isAfter, isBefore, isSameDay, isWithinInterval, startOfDay, startOfWeek, subDays } from 'date-fns';

interface PoolsProps {
  userTrustLevel?: number;
}

const weekLabels = ['一', '二', '三', '四', '五', '六', '日'];

function getWeekdayIndex(date: Date) {
  return (getDay(date) + 6) % 7;
}

function getHeatColor(level: number, dark: boolean) {
  const light = ['bg-gray-100', 'bg-rose-100', 'bg-rose-200', 'bg-rose-400', 'bg-rose-600'];
  const darkScale = ['bg-slate-800', 'bg-rose-950/70', 'bg-rose-900', 'bg-rose-700', 'bg-rose-500'];
  return (dark ? darkScale : light)[level];
}

function formatBudgetMonth(month: string) {
  const [year, monthNumber] = month.split('-');
  return `${year}年${Number(monthNumber)}月`;
}

function formatMoney(amount: number) {
  return amount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getPoolDelta(tx: Transaction, poolId: string) {
  if (tx.type === 'income') {
    return tx.allocations?.filter(a => a.poolId === poolId).reduce((sum, a) => sum + a.amount, 0) ?? 0;
  }
  if (tx.type === 'expense' && tx.poolId === poolId) return -tx.amount;
  if (tx.type === 'transfer') {
    return (tx.toPoolId === poolId ? tx.amount : 0) - (tx.fromPoolId === poolId ? tx.amount : 0);
  }
  return 0;
}

function getPoolExpense(tx: Transaction, poolId: string) {
  return tx.type === 'expense' && tx.poolId === poolId ? tx.amount : 0;
}

function buildPoolStats(pool: Pool, transactions: Transaction[]) {
  const today = startOfDay(new Date());
  const related = transactions
    .map(tx => ({ tx, delta: getPoolDelta(tx, pool.id), expense: getPoolExpense(tx, pool.id), date: startOfDay(new Date(tx.date)) }))
    .filter(item => item.delta !== 0 || item.expense > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const firstDate = related[0]?.date ?? null;
  const totalDelta = related.reduce((sum, item) => sum + item.delta, 0);
  let running = pool.balance - totalDelta;
  let breakthroughs = 0;
  let lastBalance = running;
  const historyStart = subDays(today, 59);
  const chartData: Array<{ date: string; balance: number; expense: number }> = [];

  for (let day = firstDate ?? historyStart; !isAfter(day, today); day = addDays(day, 1)) {
    const dayItems = related.filter(item => isSameDay(item.date, day));
    const dayDelta = dayItems.reduce((sum, item) => sum + item.delta, 0);
    const dayExpense = dayItems.reduce((sum, item) => sum + item.expense, 0);
    running += dayDelta;
    if (lastBalance >= 0 && running < 0) breakthroughs += 1;
    lastBalance = running;

    if (!isBefore(day, historyStart)) {
      chartData.push({
        date: format(day, 'MM-dd'),
        balance: Number(running.toFixed(2)),
        expense: Number(dayExpense.toFixed(2)),
      });
    }
  }

  if (!chartData.length) {
    for (let day = historyStart; !isAfter(day, today); day = addDays(day, 1)) {
      chartData.push({ date: format(day, 'MM-dd'), balance: pool.balance, expense: 0 });
    }
  }

  const last30 = related.filter(item => item.expense > 0 && !isBefore(item.date, subDays(today, 29)));
  const last7 = related.filter(item => item.expense > 0 && !isBefore(item.date, subDays(today, 6)));
  const totalExpense30 = last30.reduce((sum, item) => sum + item.expense, 0);
  const totalExpense7 = last7.reduce((sum, item) => sum + item.expense, 0);
  const activeDays = new Set(related.filter(item => item.expense > 0).map(item => format(item.date, 'yyyy-MM-dd'))).size;
  const lifetimeExpense = related.reduce((sum, item) => sum + item.expense, 0);
  const ageDays = firstDate ? Math.max(1, differenceInCalendarDays(today, firstDate) + 1) : 0;
  const projectedRunway = totalExpense30 > 0 ? Math.floor(pool.balance / (totalExpense30 / 30)) : null;

  const heatStart = startOfWeek(subDays(today, 83), { weekStartsOn: 1 });
  const heatEnd = today;
  const dailyExpense = new Map<string, number>();
  for (const item of related) {
    if (item.expense <= 0 || !isWithinInterval(item.date, { start: heatStart, end: heatEnd })) continue;
    const key = format(item.date, 'yyyy-MM-dd');
    dailyExpense.set(key, (dailyExpense.get(key) ?? 0) + item.expense);
  }
  const maxHeat = Math.max(0, ...dailyExpense.values());
  const heatDays = [];
  for (let day = heatStart; !isAfter(day, heatEnd); day = addDays(day, 1)) {
    const key = format(day, 'yyyy-MM-dd');
    const amount = dailyExpense.get(key) ?? 0;
    heatDays.push({
      key,
      date: day,
      amount,
      level: amount <= 0 || maxHeat <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((amount / maxHeat) * 4))),
      week: differenceInCalendarWeeks(day, heatStart, { weekStartsOn: 1 }),
      weekday: getWeekdayIndex(day),
    });
  }

  return {
    firstDate,
    relatedCount: related.length,
    activeDays,
    lifetimeExpense,
    dcExpense: totalExpense30 / 30,
    spendingPower: totalExpense7 / 7,
    breakthroughs,
    projectedRunway,
    ageDays,
    chartData,
    heatDays,
    heatWeekCount: differenceInCalendarWeeks(heatEnd, heatStart, { weekStartsOn: 1 }) + 1,
    heatTotal: Array.from(dailyExpense.values()).reduce((sum, amount) => sum + amount, 0),
    heatPeak: maxHeat,
  };
}

export default function Pools({ userTrustLevel = 1 }: PoolsProps) {
  const { pools, transactions, addPool, updatePool, deletePool, baseCurrency } = useStore();
  const chartDark = useThemeStore((s) => s.theme === 'dark');
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Pool>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [privacyLevels, setPrivacyLevels] = useState<Record<string, number>>({});
  const [showPrivacySettings, setShowPrivacySettings] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const selectedPool = pools.find(pool => pool.id === selectedPoolId) ?? null;
  const selectedPoolStats = useMemo(
    () => selectedPool ? buildPoolStats(selectedPool, transactions) : null,
    [selectedPool, transactions]
  );
  const tooltipStyle = chartDark
    ? {
        borderRadius: 12,
        border: '1px solid #475569',
        backgroundColor: '#1e293b',
        color: '#f1f5f9',
      }
    : { borderRadius: '12px', border: 'none', boxShadow: '0 4px 14px rgb(15 23 42 / 0.12)' };

  const loadPrivacyLevels = async () => {
    try {
      const data = await apiGet<{ levels: Record<string, Record<string, number>> }>('/auth/privacy', true);
      setPrivacyLevels(data.levels?.pools || {});
    } catch (e) {
      console.error('Failed to load privacy levels:', e);
    }
  };

  useEffect(() => {
    loadPrivacyLevels();
  }, [userTrustLevel]);

  const getPoolPrivacyLevel = (poolId: string): number => {
    return privacyLevels[poolId] ?? 1;
  };

  const isPoolBlurred = (poolId: string): boolean => {
    if (userTrustLevel >= 3) return false;
    return userTrustLevel < getPoolPrivacyLevel(poolId);
  };

  const setPoolPrivacyLevel = async (poolId: string, level: number) => {
    if (userTrustLevel < 3) return;
    try {
      await apiPost('/auth/privacy', { itemType: 'pools', itemId: poolId, privacyLevel: level });
      setPrivacyLevels(prev => ({ ...prev, [poolId]: level }));
    } catch (e) {
      console.error('Failed to set privacy level:', e);
      alert(e instanceof Error ? e.message : '隐私等级保存失败');
    }
  };

  const [budgetMonth, setBudgetMonth] = useState(() => currentBudgetMonth());
  const expenseThisMonth = useMemo(() => monthExpenseByPoolId(transactions, budgetMonth), [transactions, budgetMonth]);
  const allocatedThisMonth = useMemo(() => monthAllocatedByPoolId(transactions, budgetMonth), [transactions, budgetMonth]);

  const handleAdd = async () => {
    if (pending) return;
    setPending('add');
    try {
      await addPool({
        name: '新资金池',
        budget: 0,
        mode: 'rollover',
        targetAmount: 0,
        color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  };

  const handleSave = async (id: string) => {
    if (pending) return;
    setPending(id);
    try {
      await updatePool(id, editForm);
      setIsEditing(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">资金池管理</h3>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
            <CalendarDays size={14} />
            <span>预算月份</span>
            <input
              type="month"
              value={budgetMonth}
              onChange={(e) => setBudgetMonth(e.target.value || currentBudgetMonth())}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            />
          </label>
          {userTrustLevel >= 3 && (
            <button
              onClick={() => setShowPrivacySettings(!showPrivacySettings)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                showPrivacySettings 
                  ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800"
              )}
              title="隐私设置"
            >
              <Lock size={18} />
            </button>
          )}
        </div>
        {userTrustLevel >= 3 && (
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={pending !== null}
            className="flex items-center space-x-1 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-100 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {pending === 'add' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            <span>{pending === 'add' ? '添加中…' : '新建资金池'}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pools.map((pool) => {
          const spentMonth = expenseThisMonth.get(pool.id) ?? 0;
          const allocated = allocatedThisMonth.get(pool.id) ?? 0;
          const safeBudget = Math.max(0, pool.budget);
          const usedWithinBudget = Math.min(safeBudget, Math.max(0, spentMonth));
          const allocatedRemaining = Math.max(0, allocated - spentMonth);
          const visibleAllocatedRemaining = Math.min(
            Math.max(0, safeBudget - usedWithinBudget),
            allocatedRemaining
          );
          const unallocated = Math.max(0, safeBudget - Math.max(spentMonth, allocated));
          const usedBudgetPercent = safeBudget > 0 ? (spentMonth / safeBudget) * 100 : 0;

          return (
          <div 
            key={pool.id} 
            role="button"
            tabIndex={0}
            onClick={() => !isPoolBlurred(pool.id) && setSelectedPoolId(pool.id)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !isPoolBlurred(pool.id)) {
                e.preventDefault();
                setSelectedPoolId(pool.id);
              }
            }}
            className={cn(
              "bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border transition-all relative outline-none",
              !isPoolBlurred(pool.id) && "cursor-pointer hover:-translate-y-1 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-blue-500",
              selectedPoolId === pool.id && "ring-2 ring-blue-400 dark:ring-blue-500",
              isPoolBlurred(pool.id)
                ? "border-amber-200 dark:border-amber-800"
                : "border-gray-100 dark:border-slate-700"
            )}
          >
            {isPoolBlurred(pool.id) && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/80 to-transparent dark:via-slate-900/80 rounded-2xl z-10 flex items-center justify-center backdrop-blur-sm">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 bg-white/90 dark:bg-slate-800/90 px-4 py-2 rounded-full shadow-sm">
                  <Lock size={16} />
                  <span className="text-sm font-medium">隐私内容 - Lv{getPoolPrivacyLevel(pool.id)}</span>
                </div>
              </div>
            )}
            
            {isEditing === pool.id ? (
              <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">名称</label>
                  <input
                    type="text"
                    value={editForm.name || ''}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">资金池类型</label>
                  <select
                    value={editForm.mode ?? 'rollover'}
                    onChange={e => setEditForm({ ...editForm, mode: e.target.value as Pool['mode'] })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="rollover">滚存型 · 累计余额 + 月预算</option>
                    <option value="monthly">清零型 · 只看月预算</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">每月预算上限 ({baseCurrency})</label>
                  <input
                    type="number"
                    value={editForm.budget || 0}
                    onChange={e => setEditForm({ ...editForm, budget: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {(editForm.mode ?? 'rollover') === 'rollover' && (
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">滚存总目标 ({baseCurrency})</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.targetAmount || 0}
                      onChange={e => setEditForm({ ...editForm, targetAmount: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-500">填 0 表示暂不设置总目标。</p>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">颜色</label>
                  <input
                    type="color"
                    value={editForm.color || '#000000'}
                    onChange={e => setEditForm({ ...editForm, color: e.target.value })}
                    className="w-full h-10 p-1 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg cursor-pointer"
                  />
                </div>
                <div className="flex space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => void handleSave(pool.id)}
                    disabled={pending !== null}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-1"
                  >
                    {pending === pool.id ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        保存中…
                      </>
                    ) : (
                      '保存'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(null)}
                    disabled={pending !== null}
                    className="flex-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: pool.color + '20' }}>
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: pool.color }} />
                    </div>
                    <div>
                      <h4 className={cn(
                        "font-semibold text-lg",
                        isPoolBlurred(pool.id) ? "blur-sm" : "text-gray-900 dark:text-slate-100"
                      )}>
                        {isPoolBlurred(pool.id) ? maskText(pool.name, 4) : pool.name}
                      </h4>
                      {!isPoolBlurred(pool.id) && (
                        <span className={cn(
                          'mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                          pool.mode === 'monthly'
                            ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                            : 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300'
                        )}>
                          {pool.mode === 'monthly' ? '清零型' : '滚存型'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    {showPrivacySettings && userTrustLevel >= 3 && (
                      <select
                        value={getPoolPrivacyLevel(pool.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setPoolPrivacyLevel(pool.id, Number(e.target.value))}
                        className={cn(
                          "px-2 py-1 rounded-lg text-xs font-medium border-0 cursor-pointer",
                          getPoolPrivacyLevel(pool.id) === 3 
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                            : getPoolPrivacyLevel(pool.id) === 2
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        )}
                      >
                        <option value={1}>Lv1 公开</option>
                        <option value={2}>Lv2 受限</option>
                        <option value={3}>Lv3 私密</option>
                      </select>
                    )}
                    {userTrustLevel >= 3 && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditForm(pool);
                            setIsEditing(pool.id);
                          }}
                          className="p-2 text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/50"
                        >
                          <Edit2 size={16} />
                        </button>
                        {pools.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                confirm(
                                  '确定删除？若该池仍有余额，请先用「转账」清零；若存在关联流水或收入预设，服务器也会拒绝删除。'
                                )
                              ) {
                                void deletePool(pool.id).catch((e) =>
                                  alert(e instanceof Error ? e.message : String(e))
                                );
                              }
                            }}
                            className="p-2 text-gray-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {pool.mode !== 'monthly' && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm text-gray-500 dark:text-slate-400">池子总余额</p>
                        {pool.targetAmount > 0 && !isPoolBlurred(pool.id) && (
                          <span className="text-xs text-gray-400 dark:text-slate-500">总目标 {formatMoney(pool.targetAmount)} {baseCurrency}</span>
                        )}
                      </div>
                      <p className={cn(
                        "text-2xl font-bold transition-all",
                        isPoolBlurred(pool.id) ? "blur-md" : pool.balance < 0 ? "text-rose-600 dark:text-rose-400" : "text-gray-900 dark:text-slate-100"
                      )}>
                        {isPoolBlurred(pool.id) ? '¥••••••' : `${formatMoney(pool.balance)} ${baseCurrency}`}
                      </p>
                      {pool.targetAmount > 0 && !isPoolBlurred(pool.id) && (
                        <div className="space-y-1">
                          <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
                            <div
                              className="h-full rounded-full transition-[width] duration-500"
                              style={{
                                width: `${Math.min(100, Math.max(0, (pool.balance / pool.targetAmount) * 100))}%`,
                                backgroundColor: pool.color,
                              }}
                            />
                          </div>
                          <p className="text-right text-[11px] text-gray-400 dark:text-slate-500">
                            总目标进度 {Math.max(0, (pool.balance / pool.targetAmount) * 100).toFixed(1)}%
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {!isPoolBlurred(pool.id) && (
                    <div className={cn(
                      'space-y-3 border-t border-gray-100 pt-4 dark:border-slate-700',
                      pool.mode === 'monthly' && 'border-t-0 pt-0'
                    )}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-700 dark:text-slate-200">本月预算控制 ({formatBudgetMonth(budgetMonth)})</p>
                        {pool.budget > 0 && (
                          <span className="text-[11px] text-gray-400 dark:text-slate-500">上限 {formatMoney(pool.budget)}</span>
                        )}
                      </div>
                      {safeBudget > 0 ? (
                        <>
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400">
                              <span>本月预算使用进度</span>
                              <span className="font-semibold text-gray-700 dark:text-slate-200">{Math.max(0, usedBudgetPercent).toFixed(2)}%</span>
                            </div>
                            <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                              <div
                                className="h-full bg-rose-500 transition-[width] duration-500"
                                style={{ width: `${(usedWithinBudget / safeBudget) * 100}%` }}
                              />
                              <div
                                className="h-full bg-emerald-500 transition-[width] duration-500"
                                style={{ width: `${(visibleAllocatedRemaining / safeBudget) * 100}%` }}
                              />
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-400 dark:text-slate-500">
                              <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-rose-500" />已用</span>
                              <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-500" />已拨入未用</span>
                              <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-gray-300 dark:bg-slate-600" />未拨入</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                            <div className="rounded-xl bg-rose-50 px-2 py-2 dark:bg-rose-950/40">
                              <p className="text-[10px] text-rose-500 dark:text-rose-300">已用</p>
                              <p className="mt-0.5 text-xs font-semibold text-rose-700 dark:text-rose-200">{formatMoney(spentMonth)}</p>
                            </div>
                            <div className="rounded-xl bg-blue-50 px-2 py-2 dark:bg-blue-950/40">
                              <p className="text-[10px] text-blue-500 dark:text-blue-300">本月拨入</p>
                              <p className="mt-0.5 text-xs font-semibold text-blue-700 dark:text-blue-200">{formatMoney(allocated)}</p>
                            </div>
                            <div className="rounded-xl bg-emerald-50 px-2 py-2 dark:bg-emerald-950/40">
                              <p className="text-[10px] text-emerald-500 dark:text-emerald-300">已拨入未用</p>
                              <p className="mt-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-200">{formatMoney(allocatedRemaining)}</p>
                            </div>
                            <div className="rounded-xl bg-gray-100 px-2 py-2 dark:bg-slate-800">
                              <p className="text-[10px] text-gray-500 dark:text-slate-400">未拨入</p>
                              <p className="mt-0.5 text-xs font-semibold text-gray-700 dark:text-slate-200">{formatMoney(unallocated)}</p>
                            </div>
                          </div>
                          {spentMonth > allocated && (
                            <p className="text-xs text-rose-500 dark:text-rose-400">已超出本月拨入 {formatMoney(spentMonth - allocated)} {baseCurrency}</p>
                          )}
                        </>
                      ) : (
                        <div className="rounded-xl bg-gray-50 px-3 py-3 text-xs text-gray-500 dark:bg-slate-800/70 dark:text-slate-400">
                          尚未设置每月预算上限，设置后才能按“已用 / 已拨入未用 / 未拨入”显示进度。
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
        })}
      </div>

      {selectedPool && selectedPoolStats && !isPoolBlurred(selectedPool.id) && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div
            className="relative p-6 sm:p-8 overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${selectedPool.color}22, transparent 45%), linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,0))`,
            }}
          >
            <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full blur-2xl opacity-30" style={{ backgroundColor: selectedPool.color }} />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="h-4 w-4 rounded-full shadow-sm" style={{ backgroundColor: selectedPool.color }} />
                  <p className="text-sm font-medium text-gray-500 dark:text-slate-400">资金池详情</p>
                </div>
                <h3 className="mt-2 text-2xl font-bold text-gray-950 dark:text-slate-50">{selectedPool.name}</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
                  {selectedPoolStats.firstDate
                    ? `最早关联流水 ${format(selectedPoolStats.firstDate, 'yyyy-MM-dd')}，已观测 ${selectedPoolStats.ageDays} 天`
                    : '暂无关联流水，先以当前余额作为静态基线'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPoolId(null)}
                className="self-start rounded-full p-2 text-gray-400 hover:bg-white/70 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors"
                aria-label="关闭资金池详情"
              >
                <X size={18} />
              </button>
            </div>

            <div className="relative mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="rounded-2xl bg-white/80 dark:bg-slate-950/50 border border-white/70 dark:border-slate-700 p-4">
                <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 text-xs">
                  <Activity size={14} />
                  当前余额
                </div>
                <p className={cn("mt-2 text-2xl font-bold", selectedPool.balance < 0 ? "text-rose-600 dark:text-rose-400" : "text-gray-950 dark:text-slate-50")}>
                  {selectedPool.balance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} {baseCurrency}
                </p>
              </div>
              <div className="rounded-2xl bg-white/80 dark:bg-slate-950/50 border border-white/70 dark:border-slate-700 p-4">
                <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 text-xs">
                  <Waves size={14} />
                  直流分量
                </div>
                <p className="mt-2 text-2xl font-bold text-gray-950 dark:text-slate-50">
                  {selectedPoolStats.dcExpense.toLocaleString('zh-CN', { maximumFractionDigits: 1 })}/日
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">近 30 天日均花费</p>
              </div>
              <div className="rounded-2xl bg-white/80 dark:bg-slate-950/50 border border-white/70 dark:border-slate-700 p-4">
                <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 text-xs">
                  <Zap size={14} />
                  消费功率
                </div>
                <p className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-300">
                  {selectedPoolStats.spendingPower.toLocaleString('zh-CN', { maximumFractionDigits: 1 })}/日
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">近 7 天消耗强度</p>
              </div>
              <div className="rounded-2xl bg-white/80 dark:bg-slate-950/50 border border-white/70 dark:border-slate-700 p-4">
                <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 text-xs">
                  <ShieldAlert size={14} />
                  被击穿次数
                </div>
                <p className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-300">{selectedPoolStats.breakthroughs}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">余额从非负跌破 0 的次数</p>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8 grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)] gap-6">
            <div className="space-y-6">
              <div className="rounded-2xl border border-gray-100 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-slate-100">历史资金波形</h4>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">最近 60 天余额曲线，柱形为每日消费</p>
                  </div>
                  <TrendingDown size={18} className="text-gray-400" />
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selectedPoolStats.chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="poolBalanceWave" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={selectedPool.color} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={selectedPool.color} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartDark ? '#334155' : '#eef2f7'} />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: chartDark ? '#94a3b8' : '#94a3b8', fontSize: 11 }} minTickGap={18} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: chartDark ? '#94a3b8' : '#94a3b8', fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="balance" name="余额" stroke={selectedPool.color} strokeWidth={3} fill="url(#poolBalanceWave)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-slate-100">消费脉冲</h4>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">最近 60 天每日从该池流出的金额</p>
                  </div>
                  <Zap size={18} className="text-amber-400" />
                </div>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedPoolStats.chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartDark ? '#334155' : '#eef2f7'} />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: chartDark ? '#94a3b8' : '#94a3b8', fontSize: 11 }} minTickGap={18} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: chartDark ? '#94a3b8' : '#94a3b8', fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="expense" name="消费" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-gray-100 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-slate-100">消费热图</h4>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">最近 12 周，该资金池的消费密度</p>
                  </div>
                  <CalendarDays size={18} className="text-gray-400" />
                </div>
                <div className="overflow-x-auto pb-2">
                  <div className="inline-grid grid-cols-[24px_auto] gap-2 min-w-max">
                    <div className="grid grid-rows-7 gap-1.5 text-[10px] text-gray-400 dark:text-slate-500">
                      {weekLabels.map((label) => (
                        <div key={label} className="h-3.5 leading-3.5 text-right">{label}</div>
                      ))}
                    </div>
                    <div
                      className="grid grid-flow-col grid-rows-7 gap-1.5"
                      style={{ gridTemplateColumns: `repeat(${selectedPoolStats.heatWeekCount}, minmax(0, 0.875rem))` }}
                    >
                      {selectedPoolStats.heatDays.map((day) => (
                        <div
                          key={day.key}
                          title={`${format(day.date, 'yyyy-MM-dd')} 消费 ${day.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} ${baseCurrency}`}
                          className={`h-3.5 w-3.5 rounded-[3px] ring-1 ring-black/5 dark:ring-white/5 ${getHeatColor(day.level, chartDark)}`}
                          style={{ gridColumn: day.week + 1, gridRow: day.weekday + 1 }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-end gap-2 text-xs text-gray-400 dark:text-slate-500">
                  <span>少</span>
                  {[0, 1, 2, 3, 4].map((level) => (
                    <span key={level} className={`h-3 w-3 rounded-[3px] ${getHeatColor(level, chartDark)}`} />
                  ))}
                  <span>多</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-gray-50 dark:bg-slate-800 p-4">
                  <p className="text-xs text-gray-500 dark:text-slate-400">生命周期消费</p>
                  <p className="mt-2 text-xl font-bold text-gray-900 dark:text-slate-100">
                    {selectedPoolStats.lifetimeExpense.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="rounded-2xl bg-gray-50 dark:bg-slate-800 p-4">
                  <p className="text-xs text-gray-500 dark:text-slate-400">消费活跃天</p>
                  <p className="mt-2 text-xl font-bold text-gray-900 dark:text-slate-100">{selectedPoolStats.activeDays}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 dark:bg-slate-800 p-4">
                  <p className="text-xs text-gray-500 dark:text-slate-400">热图区间支出</p>
                  <p className="mt-2 text-xl font-bold text-rose-600 dark:text-rose-300">
                    {selectedPoolStats.heatTotal.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="rounded-2xl bg-gray-50 dark:bg-slate-800 p-4">
                  <p className="text-xs text-gray-500 dark:text-slate-400">单日峰值</p>
                  <p className="mt-2 text-xl font-bold text-gray-900 dark:text-slate-100">
                    {selectedPoolStats.heatPeak.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 p-4 text-sm text-gray-600 dark:text-slate-300">
                <p className="font-medium text-gray-900 dark:text-slate-100 mb-2">小结</p>
                <p>
                  {selectedPoolStats.projectedRunway === null
                    ? '近 30 天没有明显消费，当前资金池处于低功耗/休眠状态。'
                    : `按近 30 天直流分量估算，当前余额约可支撑 ${Math.max(0, selectedPoolStats.projectedRunway)} 天。`}
                </p>
                <p className="mt-2">
                  共关联 {selectedPoolStats.relatedCount} 条资金变化，预算为 {selectedPool.budget.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} {baseCurrency}。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
