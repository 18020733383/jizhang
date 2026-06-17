import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { useThemeStore } from '../store/useThemeStore';
import { monthExpenseByPoolId, totalAllocatedByPoolId } from '../lib/poolBudget';
import PoolBudgetBar from './PoolBudgetBar';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from 'recharts';
import {
  addDays,
  differenceInCalendarWeeks,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getDay,
  isSameDay,
  isWithinInterval,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from 'date-fns';

type HeatmapRange = 'year' | 'month' | 'week';

const heatmapRangeLabels: Record<HeatmapRange, string> = {
  year: '年',
  month: '月',
  week: '周',
};

const weekLabels = ['一', '二', '三', '四', '五', '六', '日'];

function getHeatmapRange(range: HeatmapRange, date: Date) {
  if (range === 'year') {
    return { start: startOfYear(date), end: endOfYear(date) };
  }
  if (range === 'month') {
    return { start: startOfMonth(date), end: endOfMonth(date) };
  }
  return {
    start: startOfWeek(date, { weekStartsOn: 1 }),
    end: endOfWeek(date, { weekStartsOn: 1 }),
  };
}

function getWeekdayIndex(date: Date) {
  return (getDay(date) + 6) % 7;
}

function getHeatColor(level: number, dark: boolean) {
  const light = ['bg-gray-100', 'bg-rose-100', 'bg-rose-200', 'bg-rose-400', 'bg-rose-600'];
  const darkScale = ['bg-slate-800', 'bg-rose-950/70', 'bg-rose-900', 'bg-rose-700', 'bg-rose-500'];
  return (dark ? darkScale : light)[level];
}

export default function Dashboard() {
  const { pools, transactions, baseCurrency, interceptTotal } = useStore();
  const [heatmapRange, setHeatmapRange] = useState<HeatmapRange>('month');
  const chartDark = useThemeStore((s) => s.theme === 'dark');
  const gridStroke = chartDark ? '#334155' : '#f3f4f6';
  const tickFill = chartDark ? '#94a3b8' : '#9ca3af';
  const cursorStroke = chartDark ? '#475569' : '#e5e7eb';
  const tooltipStyle = chartDark
    ? {
        borderRadius: 12,
        border: '1px solid #475569',
        backgroundColor: '#1e293b',
        color: '#f1f5f9',
      }
    : { borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' };

  const expenseByPool = useMemo(() => monthExpenseByPoolId(transactions), [transactions]);
  // 修正：allocated = 当前余额 + 本月支出（这样包含转账和初始余额）
  const allocatedByPool = useMemo(() => {
    const map = new Map<string, number>();
    for (const pool of pools) {
      const spent = expenseByPool.get(pool.id) ?? 0;
      // 已分配 = 当前余额 + 已支出（这样进度条能正确显示）
      map.set(pool.id, pool.balance + spent);
    }
    return map;
  }, [pools, expenseByPool]);

  const totalBalance = pools.reduce((sum, pool) => sum + pool.balance, 0);

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const monthTransactions = transactions.filter(t => 
    isWithinInterval(new Date(t.date), { start: monthStart, end: monthEnd })
  );

  const monthIncome = monthTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const monthExpense = monthTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const expensePulse = useMemo(() => {
    const days = [];
    let total = 0;
    let todayExpense = 0;

    for (let i = 29; i >= 0; i--) {
      const date = subDays(now, i);
      const expense = transactions
        .filter(t => t.type === 'expense' && isSameDay(new Date(t.date), date))
        .reduce((sum, t) => sum + t.amount, 0);
      total += expense;
      if (isSameDay(date, now)) todayExpense = expense;
      days.push({
        date: format(date, 'MM-dd'),
        expense,
        diff: 0,
      });
    }

    const average = total / 30;
    const data = days.map(day => ({
      ...day,
      diff: day.expense - average,
    }));

    return {
      data,
      todayExpense,
      average,
      todayDiff: todayExpense - average,
    };
  }, [transactions]);

  // Chart data for last 30 days
  const chartData = useMemo(() => {
    const data = [];
    for (let i = 29; i >= 0; i--) {
      const date = subDays(now, i);
      const dayTx = transactions.filter(t => isSameDay(new Date(t.date), date));
      
      data.push({
        date: format(date, 'MM-dd'),
        income: dayTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
        expense: dayTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
      });
    }
    return data;
  }, [transactions]);

  const heatmapData = useMemo(() => {
    const { start, end } = getHeatmapRange(heatmapRange, now);
    const gridStart = startOfWeek(start, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(end, { weekStartsOn: 1 });
    const dailyExpense = new Map<string, number>();

    for (const tx of transactions) {
      if (tx.type !== 'expense') continue;
      const txDate = new Date(tx.date);
      if (!isWithinInterval(txDate, { start, end })) continue;
      const key = format(txDate, 'yyyy-MM-dd');
      dailyExpense.set(key, (dailyExpense.get(key) ?? 0) + tx.amount);
    }

    const maxExpense = Math.max(0, ...dailyExpense.values());
    const days = [];
    for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
      const key = format(day, 'yyyy-MM-dd');
      const amount = dailyExpense.get(key) ?? 0;
      const inRange = isWithinInterval(day, { start, end });
      const level = !inRange || amount <= 0 || maxExpense <= 0
        ? 0
        : Math.min(4, Math.max(1, Math.ceil((amount / maxExpense) * 4)));

      days.push({
        key,
        date: day,
        amount,
        level,
        inRange,
        week: differenceInCalendarWeeks(day, gridStart, { weekStartsOn: 1 }),
        weekday: getWeekdayIndex(day),
      });
    }

    const total = Array.from(dailyExpense.values()).reduce((sum, amount) => sum + amount, 0);
    const activeDays = Array.from(dailyExpense.values()).filter(amount => amount > 0).length;
    return {
      start,
      end,
      days,
      total,
      activeDays,
      maxExpense,
      weekCount: differenceInCalendarWeeks(gridEnd, gridStart, { weekStartsOn: 1 }) + 1,
    };
  }, [transactions, heatmapRange]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 dark:bg-blue-950/40 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
          <div className="relative">
            <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">总资产 ({baseCurrency})</p>
            <h3 className="text-3xl font-bold text-gray-900 dark:text-slate-100">{totalBalance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</h3>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 dark:bg-emerald-950/40 rounded-full -mr-16 -mt-16" />
          <div className="relative">
            <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">本月收入</p>
            <h3 className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">+{monthIncome.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</h3>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 dark:bg-rose-950/40 rounded-full -mr-16 -mt-16" />
          <div className="relative">
            <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">本月支出</p>
            <h3 className="text-3xl font-bold text-rose-600 dark:text-rose-400">-{monthExpense.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</h3>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-amber-100 dark:border-amber-800 relative overflow-hidden">
          <div className={`absolute top-0 right-0 w-32 h-32 rounded-full -mr-16 -mt-16 ${expensePulse.todayDiff >= 0 ? 'bg-rose-50 dark:bg-rose-950/40' : 'bg-emerald-50 dark:bg-emerald-950/40'}`} />
          <div className="relative">
            <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Today vs 30d avg</p>
            <h3 className={`text-3xl font-bold ${expensePulse.todayDiff >= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {expensePulse.todayDiff >= 0 ? '+' : ''}{expensePulse.todayDiff.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </h3>
            <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
              Today {expensePulse.todayExpense.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} / Avg {expensePulse.average.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-blue-100 dark:border-blue-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 dark:bg-blue-950/40 rounded-full -mr-16 -mt-16" />
          <div className="relative">
            <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">拦截池</p>
            <h3 className="text-3xl font-bold text-blue-600 dark:text-blue-400">+{interceptTotal.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</h3>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-6">近30天收支趋势</h3>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: tickFill, fontSize: 12 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: tickFill, fontSize: 12 }} />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ stroke: cursorStroke, strokeWidth: 2, strokeDasharray: '4 4' }}
              />
              <Area type="monotone" dataKey="income" name="收入" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
              <Area type="monotone" dataKey="expense" name="支出" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorExpense)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Expense Pulse */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">Expense pulse</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              Daily expense minus the rolling 30-day average. Red is above average, green is below average.
            </p>
          </div>
          <div className={`rounded-2xl px-4 py-3 ${expensePulse.todayDiff >= 0 ? 'bg-rose-50 dark:bg-rose-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30'}`}>
            <p className="text-xs text-gray-500 dark:text-slate-400">Today delta</p>
            <p className={`text-2xl font-bold ${expensePulse.todayDiff >= 0 ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-600 dark:text-emerald-300'}`}>
              {expensePulse.todayDiff >= 0 ? '+' : ''}{expensePulse.todayDiff.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} {baseCurrency}
            </p>
          </div>
        </div>
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={expensePulse.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: tickFill, fontSize: 12 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: tickFill, fontSize: 12 }} />
              <defs>
                <linearGradient id="expensePulseStroke" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="46%" stopColor="#10b981" />
                  <stop offset="50%" stopColor="#f59e0b" />
                  <stop offset="54%" stopColor="#f43f5e" />
                  <stop offset="100%" stopColor="#f43f5e" />
                </linearGradient>
              </defs>
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ stroke: cursorStroke, strokeWidth: 2, strokeDasharray: '4 4' }}
                formatter={(value) => [Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2 }), Number(value) >= 0 ? 'above avg' : 'below avg']}
              />
              <ReferenceLine y={0} stroke={cursorStroke} strokeDasharray="5 5" />
              <Line type="monotone" dataKey="diff" name="vs 30d avg" stroke="url(#expensePulseStroke)" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Expense Heatmap */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">消费热图</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              {format(heatmapData.start, 'yyyy.MM.dd')} - {format(heatmapData.end, 'yyyy.MM.dd')}
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 p-1 self-start">
            {(Object.keys(heatmapRangeLabels) as HeatmapRange[]).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setHeatmapRange(range)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                  heatmapRange === range
                    ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-300 shadow-sm font-medium'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-100'
                }`}
              >
                {heatmapRangeLabels[range]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_9rem] gap-6 items-start">
          <div className="overflow-x-auto pb-2">
            <div className="inline-grid grid-cols-[24px_auto] gap-2 min-w-max">
              <div className="grid grid-rows-7 gap-1.5 text-[10px] text-gray-400 dark:text-slate-500">
                {weekLabels.map((label) => (
                  <div key={label} className="h-3.5 leading-3.5 text-right">{label}</div>
                ))}
              </div>
              <div
                className="grid grid-flow-col grid-rows-7 gap-1.5"
                style={{ gridTemplateColumns: `repeat(${heatmapData.weekCount}, minmax(0, 0.875rem))` }}
              >
                {heatmapData.days.map((day) => (
                  <div
                    key={day.key}
                    title={`${format(day.date, 'yyyy-MM-dd')} 支出 ${day.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} ${baseCurrency}`}
                    className={`h-3.5 w-3.5 rounded-[3px] ring-1 ring-black/5 dark:ring-white/5 ${
                      day.inRange ? getHeatColor(day.level, chartDark) : 'bg-transparent'
                    }`}
                    style={{ gridColumn: day.week + 1, gridRow: day.weekday + 1 }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1 xl:w-36">
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 p-3">
              <p className="text-xs text-rose-500 dark:text-rose-300">总支出</p>
              <p className="mt-1 text-lg font-bold text-rose-700 dark:text-rose-200">
                {heatmapData.total.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3">
              <p className="text-xs text-gray-500 dark:text-slate-400">消费天数</p>
              <p className="mt-1 text-lg font-bold text-gray-900 dark:text-slate-100">{heatmapData.activeDays}</p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3">
              <p className="text-xs text-gray-500 dark:text-slate-400">单日峰值</p>
              <p className="mt-1 text-lg font-bold text-gray-900 dark:text-slate-100">
                {heatmapData.maxExpense.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-4 text-xs text-gray-400 dark:text-slate-500">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span key={level} className={`h-3 w-3 rounded-[3px] ${getHeatColor(level, chartDark)}`} />
          ))}
          <span>多</span>
        </div>
      </div>

      {/* Pools Overview */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-4">资金池概览</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pools.map((pool) => {
            const spentMonth = expenseByPool.get(pool.id) ?? 0;
            const allocated = allocatedByPool.get(pool.id) ?? 0;
            const overBurn =
              pool.budget > 0 && (spentMonth >= pool.budget || pool.balance < 0);

            return (
              <div key={pool.id} className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-md dark:hover:shadow-slate-900/50 transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: pool.color }} />
                    <h4 className="font-medium text-gray-900 dark:text-slate-100">{pool.name}</h4>
                  </div>
                  {overBurn && (
                    <span className="px-2 py-1 bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 text-xs font-medium rounded-full">
                      预警
                    </span>
                  )}
                </div>

                <div className="mb-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">
                    {pool.balance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </p>
                  {pool.budget > 0 && (
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                      预算: {pool.budget.toLocaleString('zh-CN')} {baseCurrency}
                    </p>
                  )}
                </div>

                {pool.budget > 0 && (
                  <PoolBudgetBar
                    budget={pool.budget}
                    allocated={allocated}
                    spentMonth={spentMonth}
                    compact
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
