import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, isSameDay, startOfMonth, endOfMonth, isWithinInterval, subDays } from 'date-fns';
import { X, Maximize2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { monthExpenseByPoolId } from '../lib/poolBudget';
import PoolBudgetBar from './PoolBudgetBar';
import { cn } from '../lib/utils';

interface Props {
  onClose: () => void;
}

const tooltipDark = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '12px',
  color: '#f1f5f9',
};

/** 图表卡片：占满父级高度，避免固定 px 高度导致整页溢出 */
function ChartPanel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex min-h-0 flex-1 flex-col rounded-xl border border-slate-700/80 bg-slate-900/40 p-2 sm:p-3 lg:min-h-0',
        className
      )}
    >
      <h3 className="shrink-0 text-xs sm:text-sm font-semibold text-slate-300 mb-1 truncate">
        {title}
      </h3>
      <div className="relative min-h-0 flex-1 w-full">{children}</div>
    </section>
  );
}

export default function ImmersiveDashboard({ onClose }: Props) {
  const { pools, transactions, baseCurrency } = useStore();
  const rootRef = useRef<HTMLDivElement>(null);
  const [fsHint, setFsHint] = useState(false);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.requestFullscreen().catch(() => setFsHint(true));
  }, []);

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) onClose();
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [onClose]);

  const expenseByPool = useMemo(() => monthExpenseByPoolId(transactions), [transactions]);

  const now = useMemo(() => new Date(), []);

  const monthTransactions = useMemo(() => {
    const n = new Date();
    const start = startOfMonth(n);
    const end = endOfMonth(n);
    return transactions.filter((t) =>
      isWithinInterval(new Date(t.date), { start, end })
    );
  }, [transactions]);

  const monthIncome = monthTransactions
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthTransactions
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  const totalBalance = pools.reduce((sum, p) => sum + p.balance, 0);

  const chart30 = useMemo(() => {
    const data: { date: string; income: number; expense: number }[] = [];
    const n = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = subDays(n, i);
      const dayTx = transactions.filter((t) => isSameDay(new Date(t.date), date));
      data.push({
        date: format(date, 'MM-dd'),
        income: dayTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
        expense: dayTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      });
    }
    return data;
  }, [transactions]);

  const pieData = useMemo(() => {
    const rows = pools
      .filter((p) => p.balance > 0)
      .map((p) => ({
        name: p.name,
        value: p.balance,
        color: p.color,
      }));
    if (rows.length === 0 && pools.length > 0) {
      return pools.map((p) => ({
        name: p.name,
        value: Math.max(0.01, Math.abs(p.balance)),
        color: p.color,
      }));
    }
    return rows;
  }, [pools]);

  const barPoolExpense = useMemo(
    () =>
      pools.map((p) => ({
        name: p.name.length > 5 ? p.name.slice(0, 5) + '…' : p.name,
        本月支出: expenseByPool.get(p.id) ?? 0,
      })),
    [pools, expenseByPool]
  );

  const exit = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    onClose();
  };

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-700/80 bg-slate-900/50 px-3 py-2 backdrop-blur-md sm:px-5 sm:py-3">
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold tracking-tight bg-gradient-to-r from-cyan-200 to-indigo-300 bg-clip-text text-transparent sm:text-xl md:text-2xl">
            Flow 记账 · 数据大屏
          </h1>
          <p className="mt-0.5 truncate text-[10px] text-slate-500 sm:text-xs">
            {format(now, 'yyyy-MM-dd HH:mm')} · {baseCurrency}
            {fsHint ? ' · 可点「全屏」' : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => rootRef.current?.requestFullscreen().catch(() => {})}
            className="flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-700 sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2 sm:text-sm"
          >
            <Maximize2 size={14} className="sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">全屏</span>
          </button>
          <button
            type="button"
            onClick={exit}
            className="flex items-center gap-1 rounded-lg bg-rose-600/90 px-2 py-1.5 text-xs font-medium text-white hover:bg-rose-500 sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm"
          >
            <X size={16} />
            退出
          </button>
        </div>
      </header>

      {/* 主区：无纵向滚动，子块按比例分高 */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden px-2 pb-2 pt-2 sm:gap-2 sm:px-3 sm:pb-3 sm:pt-3">
        {/* KPI：压缩高度 */}
        <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-4">
          <KpiCard
            label="总资产"
            value={totalBalance}
            accent="from-cyan-500/20 to-cyan-500/5"
            compact
          />
          <KpiCard
            label="本月收入"
            value={monthIncome}
            prefix="+"
            accent="from-emerald-500/20 to-emerald-500/5"
            positive
            compact
          />
          <KpiCard
            label="本月支出"
            value={monthExpense}
            prefix="-"
            accent="from-rose-500/20 to-rose-500/5"
            compact
          />
          <KpiCard
            label="资金池数"
            value={pools.length}
            integer
            accent="from-violet-500/20 to-violet-500/5"
            compact
          />
        </div>

        {/* 四宫格：大屏 2×2；小屏纵向 flex 均分剩余高度 */}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden lg:grid lg:grid-cols-2 lg:grid-rows-2 lg:gap-2">
          <ChartPanel title="近 30 天收支趋势" className="flex-1 lg:min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart30} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="imIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="imExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fb7185" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#fb7185" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 9 }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 9 }} width={36} />
                <Tooltip contentStyle={tooltipDark} />
                <Area
                  type="monotone"
                  dataKey="income"
                  name="收入"
                  stroke="#34d399"
                  strokeWidth={1.5}
                  fill="url(#imIncome)"
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  name="支出"
                  stroke="#fb7185"
                  strokeWidth={1.5}
                  fill="url(#imExpense)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel title="资金池余额占比" className="flex-1 lg:min-h-0">
            {pieData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                暂无余额数据
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="32%"
                    outerRadius="58%"
                    paddingAngle={2}
                  >
                    {pieData.map((e, i) => (
                      <Cell key={i} fill={e.color} stroke="#0f172a" strokeWidth={1} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipDark} formatter={(v: number) => Number(v).toFixed(2)} />
                  <Legend
                    wrapperStyle={{ fontSize: 10, color: '#94a3b8' }}
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartPanel>

          <ChartPanel title="本月各池支出" className="flex-1 lg:min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barPoolExpense} margin={{ top: 4, right: 4, left: -18, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 9 }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={40}
                />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 9 }} width={36} />
                <Tooltip contentStyle={tooltipDark} />
                <Bar dataKey="本月支出" fill="#818cf8" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel title="资金池 · 预算（绿=余额 / 红=本月支出）" className="flex-1 overflow-hidden lg:min-h-0">
            <div className="h-full min-h-0 overflow-hidden">
            <div className="grid h-full min-h-0 auto-rows-min grid-cols-2 content-start gap-1 overflow-hidden sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {pools.map((pool) => {
                const spent = expenseByPool.get(pool.id) ?? 0;
                return (
                  <div
                    key={pool.id}
                    className="flex min-h-0 min-w-0 flex-col justify-center rounded-lg border border-slate-700/60 bg-slate-900/60 px-1.5 py-1 sm:px-2 sm:py-1.5"
                  >
                    <div className="flex min-w-0 items-center gap-1">
                      <div
                        className="h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5"
                        style={{ backgroundColor: pool.color }}
                      />
                      <span className="truncate text-[10px] font-medium text-slate-200 sm:text-xs">
                        {pool.name}
                      </span>
                    </div>
                    <div className="mt-0.5 flex justify-between gap-1 text-[9px] text-slate-500 sm:text-[10px]">
                      <span className="truncate">余{pool.balance.toFixed(0)}</span>
                      {pool.budget > 0 && <span className="shrink-0">预{pool.budget.toFixed(0)}</span>}
                    </div>
                    {pool.budget > 0 ? (
                      <div className="mt-0.5 min-h-0">
                        <PoolBudgetBar
                          budget={pool.budget}
                          balance={pool.balance}
                          spentMonth={spent}
                          compact
                          variant="dark"
                        />
                      </div>
                    ) : (
                      <p className="text-[9px] text-slate-600">无预算</p>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          </ChartPanel>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  prefix,
  integer,
  positive,
  accent,
  compact,
}: {
  label: string;
  value: number;
  prefix?: string;
  integer?: boolean;
  positive?: boolean;
  accent: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-700/60 bg-gradient-to-br',
        compact ? 'p-2 sm:p-3' : 'p-5',
        accent
      )}
    >
      <p className={cn('text-slate-400', compact ? 'mb-0.5 text-[10px] sm:text-xs' : 'mb-2 text-sm')}>
        {label}
      </p>
      <p
        className={cn(
          'font-bold tabular-nums tracking-tight',
          compact ? 'text-lg sm:text-2xl' : 'text-3xl',
          positive ? 'text-emerald-400' : 'text-slate-100'
        )}
      >
        {integer ? (
          value
        ) : (
          <>
            {prefix}
            {value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </>
        )}
      </p>
    </div>
  );
}
