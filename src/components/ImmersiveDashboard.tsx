import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { X, Maximize2, TrendingUp, TrendingDown } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { monthExpenseByPoolId, totalAllocatedByPoolId } from '../lib/poolBudget';
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

const HEADER_ACTION_HIDE_MS = 2200;

export default function ImmersiveDashboard({ onClose }: Props) {
  const { pools, transactions, baseCurrency } = useStore();
  const rootRef = useRef<HTMLDivElement>(null);
  const [fsHint, setFsHint] = useState(false);
  const [headerActionsVisible, setHeaderActionsVisible] = useState(true);
  const hideHeaderActionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHeaderActions = useCallback(() => {
    if (hideHeaderActionsTimer.current) {
      clearTimeout(hideHeaderActionsTimer.current);
      hideHeaderActionsTimer.current = null;
    }
    setHeaderActionsVisible(true);
  }, []);

  const scheduleHideHeaderActions = useCallback(() => {
    if (hideHeaderActionsTimer.current) clearTimeout(hideHeaderActionsTimer.current);
    hideHeaderActionsTimer.current = setTimeout(() => {
      setHeaderActionsVisible(false);
      hideHeaderActionsTimer.current = null;
    }, HEADER_ACTION_HIDE_MS);
  }, []);

  useEffect(
    () => () => {
      if (hideHeaderActionsTimer.current) clearTimeout(hideHeaderActionsTimer.current);
    },
    []
  );

  const { sync } = useStore();
  const { autoRefresh: autoRefreshEnabled, refreshInterval: intervalSec } = useSettingsStore();

  useEffect(() => {
    if (!autoRefreshEnabled || intervalSec <= 0) return;
    const id = setInterval(() => {
      sync().catch(console.error);
    }, intervalSec * 1000);
    return () => clearInterval(id);
  }, [autoRefreshEnabled, intervalSec, sync]);

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
  // 修正：allocated = 当前余额 + 本月支出（这样包含转账和初始余额）
  const allocatedByPool = useMemo(() => {
    const map = new Map<string, number>();
    for (const pool of pools) {
      const spent = expenseByPool.get(pool.id) ?? 0;
      map.set(pool.id, pool.balance + spent);
    }
    return map;
  }, [pools, expenseByPool]);

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
        name: p.name.length > 6 ? p.name.slice(0, 6) + '…' : p.name,
        本月支出: expenseByPool.get(p.id) ?? 0,
        full: p.name,
      })),
    [pools, expenseByPool]
  );

  const tickerItems = useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 50)
      .map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        note: t.note,
        poolId: t.poolId,
        date: t.date,
      }));
  }, [transactions]);

  const exit = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    onClose();
  };

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100"
    >
      <header
        className="flex items-center justify-between px-4 py-2.5 sm:px-5 border-b border-slate-700/80 bg-slate-900/50 backdrop-blur-md shrink-0"
        onMouseEnter={showHeaderActions}
        onMouseLeave={scheduleHideHeaderActions}
      >
        <div className="min-w-0 pr-3">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight bg-gradient-to-r from-cyan-200 to-indigo-300 bg-clip-text text-transparent">
            Flow 记账 · 数据大屏
          </h1>
          <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">
            {format(now, 'yyyy-MM-dd HH:mm')} · {baseCurrency}
            {fsHint ? ' · 未进入全屏时可点右上角「全屏」' : ''}
          </p>
          <div className="mt-1.5 max-w-md">
            <Ticker transactions={tickerItems} />
          </div>
        </div>
        <div
          className={cn(
            'flex items-center gap-2 shrink-0 transition-[opacity,transform] duration-500 ease-out',
            headerActionsVisible
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 translate-x-2 pointer-events-none'
          )}
        >
          <button
            type="button"
            onClick={() => rootRef.current?.requestFullscreen().catch(() => {})}
            onFocus={showHeaderActions}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm text-slate-300"
          >
            <Maximize2 size={16} />
            全屏
          </button>
          <button
            type="button"
            onClick={exit}
            onFocus={showHeaderActions}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white text-sm font-medium"
          >
            <X size={18} />
            退出
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col gap-2 sm:gap-3 p-2 sm:p-3 overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
          <KpiCard label="总资产" value={totalBalance} accent="from-cyan-500/20 to-cyan-500/5" compact />
          <KpiCard label="本月收入" value={monthIncome} prefix="+" accent="from-emerald-500/20 to-emerald-500/5" positive compact />
          <KpiCard label="本月支出" value={monthExpense} prefix="-" accent="from-rose-500/20 to-rose-500/5" compact />
          <KpiCard label="资金池数量" value={pools.length} integer accent="from-violet-500/20 to-violet-500/5" compact />
        </div>

        {/* 上：趋势 + 饼图；下：柱状 + 资金池 — 两行等高 (1fr/1fr)，占满剩余高度 */}
        <div className="flex-1 min-h-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:gap-3 overflow-hidden">
          <div className="min-h-0 grid grid-cols-1 xl:grid-cols-3 gap-2 sm:gap-3 overflow-hidden">
            <div className="xl:col-span-2 rounded-xl border border-slate-700/80 bg-slate-900/40 p-2 sm:p-3 flex flex-col min-h-0">
              <h3 className="text-xs sm:text-sm font-semibold text-slate-200 mb-1 shrink-0">近 30 天收支趋势</h3>
              <div className="flex-1 min-h-0 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart30} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
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
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 9 }} width={36} />
                  <Tooltip contentStyle={tooltipDark} />
                  <Area
                    type="monotone"
                    dataKey="income"
                    name="收入"
                    stroke="#34d399"
                    strokeWidth={2}
                    fill="url(#imIncome)"
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    name="支出"
                    stroke="#fb7185"
                    strokeWidth={2}
                    fill="url(#imExpense)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            </div>

          <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-2 sm:p-3 flex flex-col min-h-0">
            <h3 className="text-xs sm:text-sm font-semibold text-slate-200 mb-0.5 shrink-0">资金池余额占比</h3>
            <div className="flex-1 min-h-0">
              {pieData.length === 0 ? (
                <p className="text-xs text-slate-500 flex items-center justify-center h-full">暂无余额数据</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={72}
                      paddingAngle={2}
                    >
                      {pieData.map((e, i) => (
                        <Cell key={i} fill={e.color} stroke="#0f172a" strokeWidth={1} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipDark} formatter={(v: number) => Number(v).toFixed(2)} />
                    <Legend wrapperStyle={{ fontSize: 9, color: '#94a3b8' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

          {/* 本月各池支出 | 资金池预算 — 同一行（大屏），缩窄高度 */}
          <div className="min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3 overflow-hidden">
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-2 sm:p-3 flex flex-col min-h-0">
              <h3 className="text-xs sm:text-sm font-semibold text-slate-200 mb-1 shrink-0">本月各池支出</h3>
              <div className="flex-1 min-h-0 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barPoolExpense} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                    <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 9 }} width={32} />
                    <Tooltip contentStyle={tooltipDark} />
                    <Bar dataKey="本月支出" fill="#818cf8" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-2 sm:p-3 flex flex-col min-h-0">
              <h3 className="text-xs sm:text-sm font-semibold text-slate-200 mb-1 shrink-0">
                资金池 · 预算 <span className="text-slate-500 font-normal">（红=已用 · 绿=剩已分 · 灰=未分）</span>
              </h3>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-1.5 content-start">
                {pools.map((pool) => {
                  const spent = expenseByPool.get(pool.id) ?? 0;
                  const allocated = allocatedByPool.get(pool.id) ?? 0;
                  return (
                    <div
                      key={pool.id}
                      className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-2 space-y-1.5"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: pool.color }} />
                        <span className="font-medium text-slate-200 text-xs truncate">{pool.name}</span>
                      </div>
                      <div className="flex justify-between gap-1 text-[10px] text-slate-400">
                        {pool.balance > 0 && <span className="truncate">余 {pool.balance.toFixed(0)}</span>}
                        <span className="shrink-0">预 {pool.budget.toFixed(0)}</span>
                      </div>
                      {pool.budget > 0 ? (
                        <PoolBudgetBar
                          budget={pool.budget}
                          allocated={allocated}
                          spentMonth={spent}
                          compact
                          variant="dark"
                        />
                      ) : (
                        <p className="text-[10px] text-slate-500">未设预算</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Ticker({
  transactions,
}: {
  transactions: { id: string; type: string; amount: number; note: string; poolId?: string; date: string }[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollPos, setScrollPos] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (containerWidth === 0) return;
    const id = setInterval(() => {
      setScrollPos((p) => {
        const maxScroll = containerWidth;
        const newPos = p + 1;
        if (newPos >= maxScroll) {
          return 0;
        }
        return newPos;
      });
    }, 50);
    return () => clearInterval(id);
  }, [containerWidth]);

  if (transactions.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="h-8 shrink-0 overflow-hidden bg-slate-900/60 border-y border-slate-700/50"
    >
      <div
        className="flex items-center h-full whitespace-nowrap"
        style={{ transform: `translateX(-${scrollPos}px)` }}
      >
        {transactions.map((t) => {
          const isIncome = t.type === 'income';
          return (
            <span
              key={t.id}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1 mx-2 rounded-full text-xs font-medium',
                isIncome
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/20 text-rose-300'
              )}
            >
              {isIncome ? (
                <TrendingUp size={12} className="text-emerald-400" />
              ) : (
                <TrendingDown size={12} className="text-rose-400" />
              )}
              <span>
                {isIncome ? '+' : '-'}
                {t.amount.toFixed(0)}
              </span>
              {t.note && <span className="text-slate-400">·{t.note}</span>}
            </span>
          );
        })}
        {transactions.map((t) => {
          const isIncome = t.type === 'income';
          return (
            <span
              key={`dup-${t.id}`}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1 mx-2 rounded-full text-xs font-medium',
                isIncome
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/20 text-rose-300'
              )}
            >
              {isIncome ? (
                <TrendingUp size={12} className="text-emerald-400" />
              ) : (
                <TrendingDown size={12} className="text-rose-400" />
              )}
              <span>
                {isIncome ? '+' : '-'}
                {t.amount.toFixed(0)}
              </span>
              {t.note && <span className="text-slate-400">·{t.note}</span>}
            </span>
          );
        })}
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
      <p className={cn('text-slate-400 mb-1', compact ? 'text-[10px] sm:text-xs' : 'text-sm mb-2')}>
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
