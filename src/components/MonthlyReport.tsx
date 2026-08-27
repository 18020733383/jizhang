import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  FileText,
  PiggyBank,
  ReceiptText,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useStore, type Transaction } from '../store/useStore';
import { cn } from '../lib/utils';
import {
  buildMonthlyReport,
  formatMonthKey,
  getLocalMonthKey,
  shiftMonthKey,
  type MonthlyReportChange,
} from '../lib/monthlyReport';
import { exportElementToPdf } from '../lib/monthlyReportPdf';

interface MonthlyReportProps {
  userTrustLevel?: number;
}

const cardClass =
  'monthly-report-card rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900';

function formatAmount(amount: number, maximumFractionDigits = 2): string {
  return amount.toLocaleString('zh-CN', {
    maximumFractionDigits,
    minimumFractionDigits: 2,
  });
}

function formatSignedAmount(amount: number): string {
  return `${amount > 0 ? '+' : amount < 0 ? '-' : ''}${formatAmount(Math.abs(amount))}`;
}

function formatPercent(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return '—';
  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

function SummaryCard({
  icon,
  label,
  value,
  caption,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  caption: string;
  tone: 'blue' | 'emerald' | 'rose' | 'violet' | 'amber';
}) {
  const toneClass = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
  }[tone];

  return (
    <div className={cn(cardClass, 'relative overflow-hidden p-5')}>
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gray-50 dark:bg-slate-800/70" />
      <div className="relative">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">{label}</p>
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', toneClass)}>{icon}</span>
        </div>
        <p className="text-2xl font-bold tracking-tight text-gray-900 dark:text-slate-100">{value}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">{caption}</p>
      </div>
    </div>
  );
}

function ChangePill({ change, lowerIsBetter = false }: { change: MonthlyReportChange; lowerIsBetter?: boolean }) {
  const isFlat = Math.abs(change.amount) < 0.005;
  const isPositive = change.amount > 0;
  const isGood = lowerIsBetter ? !isPositive : isPositive;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
        isFlat
          ? 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400'
          : isGood
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
      )}
    >
      {isFlat ? '持平' : isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {isFlat ? '' : formatPercent(change.percent)}
    </span>
  );
}

function getPoolName(poolId: string | undefined, pools: { id: string; name: string }[]): string {
  return pools.find((pool) => pool.id === poolId)?.name ?? '未指定资金池';
}

function getTransactionMeta(transaction: Transaction, pools: { id: string; name: string }[]): string {
  if (transaction.type === 'expense') return getPoolName(transaction.poolId, pools);
  if (transaction.type === 'transfer') {
    return `${getPoolName(transaction.fromPoolId, pools)} → ${getPoolName(transaction.toPoolId, pools)}`;
  }
  if (transaction.type === 'income') {
    const names = (transaction.allocations ?? []).map((allocation) => getPoolName(allocation.poolId, pools));
    return names.length > 0 ? `分配至 ${names.join('、')}` : '收入';
  }
  return '拦截池';
}

function getTransactionTypeLabel(type: Transaction['type']): string {
  return type === 'income' ? '收入' : type === 'expense' ? '支出' : type === 'transfer' ? '转账' : '拦截';
}

function getTransactionTypeClass(type: Transaction['type']): string {
  return type === 'income'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
    : type === 'expense'
      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
      : type === 'intercept'
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
        : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300';
}

function getTransactionIcon(type: Transaction['type']): ReactNode {
  if (type === 'income') return <ArrowDownRight size={16} />;
  if (type === 'expense') return <ArrowUpRight size={16} />;
  if (type === 'transfer') return <ArrowLeftRight size={16} />;
  return <Sparkles size={16} />;
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

export default function MonthlyReport({ userTrustLevel = 1 }: MonthlyReportProps) {
  const { pools, transactions, baseCurrency } = useStore();
  const [selectedMonth, setSelectedMonth] = useState(getLocalMonthKey());
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const currentMonth = getLocalMonthKey();

  const report = useMemo(
    () => buildMonthlyReport(transactions, pools, selectedMonth),
    [pools, selectedMonth, transactions],
  );

  const maxTrendAmount = Math.max(
    1,
    ...report.trend.flatMap((point) => [point.income, point.expense]),
  );
  const activePoolBreakdown = report.poolBreakdown.filter((pool) => pool.monthlyExpense > 0);
  const monthProgress = report.month.daysInMonth > 0
    ? Math.min(100, (report.month.elapsedDays / report.month.daysInMonth) * 100)
    : 0;
  const monthStatus = report.monthKey === currentMonth
    ? `截至 ${report.month.elapsedDays} 日`
    : report.monthKey < currentMonth
      ? '该月已结束'
      : '尚未开始';

  const handleExportPdf = async () => {
    if (!reportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      await waitForNextFrame();
      await exportElementToPdf(reportRef.current, `flow-monthly-report-${report.monthKey}.pdf`);
    } catch (error) {
      console.error('Failed to export monthly report PDF:', error);
      alert(error instanceof Error ? error.message : 'PDF 导出失败，请稍后重试');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div ref={reportRef} data-monthly-report className="monthly-report-page mx-auto max-w-6xl space-y-6 pb-8">
      <section className={cn(cardClass, 'monthly-report-hero overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-900 p-6 text-white shadow-lg lg:p-8')}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-blue-100 ring-1 ring-white/15">
              <CalendarDays size={16} />
              <span>Flow 记账 · 每月财报</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">{report.monthKey}</h1>
            <p className="mt-2 text-sm text-blue-100/80">{formatMonthKey(report.monthKey)} · 用一个月的流水，看清这一阶段的现金流。</p>
          </div>

          <div data-html2canvas-ignore="true" className="monthly-report-toolbar flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-label="前一月"
              onClick={() => setSelectedMonth((month) => shiftMonthKey(month, -1))}
              className="rounded-xl border border-white/15 bg-white/10 p-2.5 text-white transition hover:bg-white/20"
            >
              <ChevronLeft size={18} />
            </button>
            <input
              aria-label="选择财报月份"
              type="month"
              value={report.monthKey}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none [color-scheme:dark]"
            />
            <button
              type="button"
              aria-label="后一月"
              disabled={report.monthKey >= currentMonth}
              onClick={() => setSelectedMonth((month) => shiftMonthKey(month, 1))}
              className="rounded-xl border border-white/15 bg-white/10 p-2.5 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              onClick={() => setSelectedMonth(currentMonth)}
              disabled={report.monthKey === currentMonth}
              className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              本月
            </button>
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={isExporting}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-900 shadow-sm transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-70"
            >
              <Download size={17} />
              {isExporting ? '生成中…' : '导出 PDF'}
            </button>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-blue-100/70">
          <span>数据范围：整月所有流水</span>
          <span>金额单位：{baseCurrency}</span>
          <span>生成方式：浏览器本地生成</span>
        </div>
      </section>

      {userTrustLevel < 3 && (
        <div className="monthly-report-card flex items-start gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <FileText className="mt-0.5 shrink-0" size={17} />
          <p>当前报表遵循你的隐私权限。受保护流水会从金额汇总中隐藏，PDF 也会保持相同权限。</p>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          icon={<ArrowDownRight size={18} />}
          label="该月收入"
          value={`+${formatAmount(report.summary.income)}`}
          caption={`${report.summary.recordCount} 笔记录中的收入`}
          tone="emerald"
        />
        <SummaryCard
          icon={<ArrowUpRight size={18} />}
          label="该月支出"
          value={`-${formatAmount(report.summary.expense)}`}
          caption={`${report.summary.expenseCount} 笔支出 · 均笔 ${formatAmount(report.summary.averageExpense)}`}
          tone="rose"
        />
        <SummaryCard
          icon={<CircleDollarSign size={18} />}
          label="净现金流"
          value={formatSignedAmount(report.summary.netCashFlow)}
          caption="收入减支出，转账不计入"
          tone={report.summary.netCashFlow >= 0 ? 'blue' : 'rose'}
        />
        <SummaryCard
          icon={<Sparkles size={18} />}
          label="该月拦截"
          value={`+${formatAmount(report.summary.intercept)}`}
          caption="忍住消费或优惠省下的金额"
          tone="violet"
        />
        <SummaryCard
          icon={<ReceiptText size={18} />}
          label="流水笔数"
          value={`${report.summary.recordCount} 笔`}
          caption={`转账 ${formatAmount(report.summary.transferVolume)} ${baseCurrency}`}
          tone="amber"
        />
      </section>

      <section className={cn(cardClass, 'p-6')}>
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">和上月比一比</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">对比 {report.previousMonthKey} 的可见流水</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1.5 text-xs text-gray-500 dark:bg-slate-800 dark:text-slate-400">
            <ArrowRight size={13} />
            同口径比较
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { label: '收入', current: report.summary.income, change: report.changes.income, lowerIsBetter: false, tone: 'emerald' },
            { label: '支出', current: report.summary.expense, change: report.changes.expense, lowerIsBetter: true, tone: 'rose' },
            { label: '净现金流', current: report.summary.netCashFlow, change: report.changes.netCashFlow, lowerIsBetter: false, tone: 'blue' },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-gray-50 p-4 dark:bg-slate-800/70">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm text-gray-500 dark:text-slate-400">{item.label}</span>
                <ChangePill change={item.change} lowerIsBetter={item.lowerIsBetter} />
              </div>
              <p className={cn(
                'text-xl font-bold',
                item.tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-300' : item.tone === 'rose' ? 'text-rose-600 dark:text-rose-300' : 'text-blue-600 dark:text-blue-300',
              )}>
                {item.label === '支出' ? '-' : item.current > 0 ? '+' : item.current < 0 ? '-' : ''}
                {formatAmount(Math.abs(item.current))}
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
                较上月 {formatSignedAmount(item.change.amount)} {baseCurrency}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section data-report-section="trend" className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
        <div className={cn(cardClass, 'p-6')}>
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">近 6 个月走势</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">选中月份前的 5 个月与当月收支变化</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />收入</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" />支出</span>
            </div>
          </div>
          <div className="flex h-52 items-end gap-2 sm:gap-4">
            {report.trend.map((point) => {
              const incomeHeight = point.income > 0 ? Math.max(7, (point.income / maxTrendAmount) * 100) : 3;
              const expenseHeight = point.expense > 0 ? Math.max(7, (point.expense / maxTrendAmount) * 100) : 3;
              return (
                <div key={point.monthKey} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <div className="flex h-40 w-full items-end justify-center gap-1" title={`${point.label} 收入 ${formatAmount(point.income)} / 支出 ${formatAmount(point.expense)}`}>
                    <div className={cn('w-2.5 rounded-t-md bg-emerald-400 transition-all sm:w-4', point.isSelected && 'bg-emerald-600 ring-2 ring-emerald-200 dark:ring-emerald-900')} style={{ height: `${incomeHeight}%` }} />
                    <div className={cn('w-2.5 rounded-t-md bg-rose-400 transition-all sm:w-4', point.isSelected && 'bg-rose-600 ring-2 ring-rose-200 dark:ring-rose-900')} style={{ height: `${expenseHeight}%` }} />
                  </div>
                  <span className={cn('text-[11px] text-gray-400 dark:text-slate-500', point.isSelected && 'font-semibold text-blue-600 dark:text-blue-300')}>{point.label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap gap-4 border-t border-gray-100 pt-4 text-xs text-gray-500 dark:border-slate-700 dark:text-slate-400">
            <span>近 6 个月有流水：{report.activeMonthsLast6} 个月</span>
            <span>该月支出天数：{report.summary.expenseDays} 天</span>
          </div>
        </div>

        <div className={cn(cardClass, 'p-6')}>
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300"><PiggyBank size={19} /></span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">该月简报</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">几个值得留意的数字</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <span className="text-sm text-gray-500 dark:text-slate-400">最大一笔支出</span>
              <span className="text-right text-sm font-semibold text-gray-900 dark:text-slate-100">
                {report.largestExpense
                  ? userTrustLevel < 3 && report.largestExpense.amount === 0
                    ? '受保护'
                    : `-${formatAmount(report.largestExpense.amount)}`
                  : '暂无'}
                {report.largestExpense && !(userTrustLevel < 3 && report.largestExpense.amount === 0) && <span className="mt-1 block max-w-40 truncate text-xs font-normal text-gray-400 dark:text-slate-500">{report.largestExpense.note || '未填写备注'}</span>}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-500 dark:text-slate-400">活跃资金池</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{report.activePools} 个</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-500 dark:text-slate-400">支出天数</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{report.summary.expenseDays} 天</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-500 dark:text-slate-400">转账流量</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{formatAmount(report.summary.transferVolume)} {baseCurrency}</span>
            </div>
            <div className="rounded-2xl bg-indigo-50 p-4 text-sm text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
              {report.summary.recordCount === 0
                ? '这个月还没有流水，给未来的自己留下一份清晰记录吧。'
                : report.summary.netCashFlow >= 0
                  ? `这个月保持了正向现金流，结余 ${formatAmount(report.summary.netCashFlow)} ${baseCurrency}。`
                  : `这个月支出超过收入 ${formatAmount(Math.abs(report.summary.netCashFlow))} ${baseCurrency}，可以看看下方的资金池分布。`}
            </div>
          </div>
        </div>
      </section>

      <section data-report-section="pool-month" className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
        <div className={cn(cardClass, 'p-6')}>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">资金池支出分布</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">该月支出按资金池拆分</p>
            </div>
            <Wallet size={20} className="text-gray-300 dark:text-slate-600" />
          </div>
          {activePoolBreakdown.length === 0 ? (
            <div className="rounded-2xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-500 dark:bg-slate-800/70 dark:text-slate-400">该月没有资金池支出</div>
          ) : (
            <div className="space-y-5">
              {activePoolBreakdown.map((pool) => (
                <div key={pool.id}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: pool.color }} />
                      <span className="truncate font-medium text-gray-800 dark:text-slate-200">{pool.name}</span>
                    </div>
                    <span className="shrink-0 font-semibold text-gray-900 dark:text-slate-100">{formatAmount(pool.monthlyExpense)} <span className="font-normal text-gray-400">({Math.round(pool.monthlyShare * 100)}%)</span></span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                    <div className="h-full rounded-full transition-all" style={{ backgroundColor: pool.color, width: `${Math.max(4, pool.monthlyShare * 100)}%` }} />
                  </div>
                  {pool.budgetPercent !== null && (
                    <p className="mt-1.5 text-xs text-gray-400 dark:text-slate-500">该月已用预算 {pool.budgetPercent.toFixed(1)}% · 月预算 {formatAmount(pool.monthlyBudget)}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={cn(cardClass, 'p-6')}>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">月份进度</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{monthStatus}</p>
            </div>
            <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-300">{report.month.elapsedDays}/{report.month.daysInMonth}</span>
          </div>
          <div className="mb-5 h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500" style={{ width: `${monthProgress}%` }} />
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4"><span className="text-sm text-gray-500 dark:text-slate-400">该月收入</span><span className="font-semibold text-emerald-600 dark:text-emerald-300">+{formatAmount(report.summary.income)}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="text-sm text-gray-500 dark:text-slate-400">该月支出</span><span className="font-semibold text-rose-600 dark:text-rose-300">-{formatAmount(report.summary.expense)}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="text-sm text-gray-500 dark:text-slate-400">该月净现金流</span><span className="font-semibold text-gray-900 dark:text-slate-100">{formatSignedAmount(report.summary.netCashFlow)}</span></div>
            {report.month.budgetPercent !== null && (
              <div className="border-t border-gray-100 pt-4 dark:border-slate-700"><div className="flex items-center justify-between gap-4 text-sm"><span className="text-gray-500 dark:text-slate-400">总预算使用率</span><span className={cn('font-semibold', report.month.budgetPercent > 100 ? 'text-rose-600 dark:text-rose-300' : 'text-indigo-600 dark:text-indigo-300')}>{report.month.budgetPercent.toFixed(1)}%</span></div><p className="mt-1 text-xs text-gray-400 dark:text-slate-500">预算合计 {formatAmount(report.month.budget)} {baseCurrency}</p></div>
            )}
          </div>
        </div>
      </section>

      <section data-report-section="details" className={cn(cardClass, 'overflow-hidden')}>
        <div className="flex flex-col gap-2 border-b border-gray-100 p-6 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">月份明细</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{report.monthKey} 共 {report.summary.recordCount} 笔流水</p>
          </div>
          <span className="inline-flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500"><FileText size={16} />PDF 会包含完整明细</span>
        </div>
        {report.monthTransactions.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <ReceiptText size={34} className="mx-auto mb-3 text-gray-300 dark:text-slate-600" />
            <p className="font-medium text-gray-600 dark:text-slate-300">这个月还没有流水</p>
            <p className="mt-1 text-sm text-gray-400 dark:text-slate-500">可以切换月份，或者点击右上角「记一笔」补充记录。</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {report.monthTransactions.map((transaction) => {
              const isMasked = userTrustLevel < 3 && transaction.amount === 0;
              const isPositive = transaction.type === 'income' || transaction.type === 'intercept';
              const amountLabel = isMasked
                ? '受保护'
                : `${isPositive ? '+' : transaction.type === 'expense' ? '-' : ''}${formatAmount(transaction.amount)}`;
              return (
                <div key={transaction.id} className="monthly-report-transaction-row grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-6 py-4 sm:grid-cols-[auto_minmax(8rem,0.8fr)_minmax(12rem,1.4fr)_auto] sm:gap-4">
                  <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', getTransactionTypeClass(transaction.type))}>{getTransactionIcon(transaction.type)}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', getTransactionTypeClass(transaction.type))}>{getTransactionTypeLabel(transaction.type)}</span>
                      <span className="text-xs text-gray-400 dark:text-slate-500">{transaction.date.slice(11, 16) || '全天'}</span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-gray-800 dark:text-slate-200">{isMasked ? '受保护流水' : transaction.note || '未填写备注'}</p>
                  </div>
                  <p className="hidden truncate text-sm text-gray-500 dark:text-slate-400 sm:block">{isMasked ? '当前权限不可见' : getTransactionMeta(transaction, pools)}</p>
                  <div className="text-right">
                    <p className={cn('text-sm font-semibold', transaction.type === 'income' ? 'text-emerald-600 dark:text-emerald-300' : transaction.type === 'expense' ? 'text-rose-600 dark:text-rose-300' : transaction.type === 'intercept' ? 'text-blue-600 dark:text-blue-300' : 'text-gray-700 dark:text-slate-200')}>{amountLabel}</p>
                    {!isMasked && transaction.currency !== baseCurrency && <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">{transaction.originalAmount.toFixed(2)} {transaction.currency}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
