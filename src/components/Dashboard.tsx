import React, { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useThemeStore } from '../store/useThemeStore';
import { monthExpenseByPoolId, totalAllocatedByPoolId } from '../lib/poolBudget';
import PoolBudgetBar from './PoolBudgetBar';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { format, subDays, isSameDay, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

export default function Dashboard() {
  const { pools, transactions, baseCurrency, interceptTotal } = useStore();
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
  const allocatedByPool = useMemo(() => totalAllocatedByPoolId(transactions), [transactions]);

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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
