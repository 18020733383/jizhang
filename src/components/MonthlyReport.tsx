import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  Flame,
  Gauge,
  History,
  Lightbulb,
  ListOrdered,
  PiggyBank,
  ReceiptText,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';
import {
  buildMonthlyReport,
  formatMonthKey,
  getLocalMonthKey,
  shiftMonthKey,
  type MonthlyInsight,
  type MonthlyReportChange,
} from '../lib/monthlyReport';
import { exportElementToPdf } from '../lib/monthlyReportPdf';

interface MonthlyReportProps {
  userTrustLevel?: number;
}

const cardClass = 'monthly-report-card rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900';

function formatAmount(amount: number, maximumFractionDigits = 2): string {
  return amount.toLocaleString('zh-CN', {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits === 0 ? 0 : Math.min(2, maximumFractionDigits),
  });
}

function formatSignedAmount(amount: number): string {
  return `${amount > 0 ? '+' : amount < 0 ? '-' : ''}${formatAmount(Math.abs(amount))}`;
}

function formatPercent(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return '—';
  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

function SummaryCard({ icon, label, value, caption, tone }: {
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
    <div className={cn(cardClass, 'relative overflow-hidden p-4')}>
      <div className="absolute -right-7 -top-7 h-20 w-20 rounded-full bg-slate-50 dark:bg-slate-800/70" />
      <div className="relative">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', toneClass)}>{icon}</span>
        </div>
        <p className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{value}</p>
        <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-500">{caption}</p>
      </div>
    </div>
  );
}

function ChangePill({ change, lowerIsBetter = false }: { change: MonthlyReportChange; lowerIsBetter?: boolean }) {
  const isFlat = Math.abs(change.amount) < 0.005;
  const isPositive = change.amount > 0;
  const isGood = lowerIsBetter ? !isPositive : isPositive;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium',
      isFlat ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
        : isGood ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
          : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
    )}>
      {isFlat ? '持平' : isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {isFlat ? '' : formatPercent(change.percent)}
    </span>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">{icon}</span>
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

function insightTone(tone: MonthlyInsight['tone']): string {
  return {
    rose: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/35 dark:text-rose-100',
    amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/35 dark:text-indigo-100',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-100',
    slate: 'border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100',
  }[tone];
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

export default function MonthlyReport({ userTrustLevel = 1 }: MonthlyReportProps) {
  const { pools, poolSnapshots, transactions, baseCurrency } = useStore();
  const [selectedMonth, setSelectedMonth] = useState(getLocalMonthKey());
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const currentMonth = getLocalMonthKey();
  const report = useMemo(
    () => buildMonthlyReport(transactions, pools, selectedMonth, poolSnapshots),
    [poolSnapshots, pools, selectedMonth, transactions],
  );

  const maxTrendAmount = Math.max(1, ...report.trend.flatMap((point) => [point.income, point.expense]));
  const activePoolBreakdown = report.poolBreakdown.filter((pool) => pool.monthlyExpense > 0).slice(0, 6);
  const maxCategoryAmount = Math.max(1, ...report.behaviorCategories.map((category) => category.amount));
  const maxDailyExpense = Math.max(1, ...report.dailyExpenses.map((day) => day.amount));
  const monthProgress = report.month.daysInMonth > 0 ? Math.min(100, (report.month.elapsedDays / report.month.daysInMonth) * 100) : 0;
  const monthStatus = report.monthKey === currentMonth ? `截至 ${report.month.elapsedDays} 日` : report.monthKey < currentMonth ? '该月已结束' : '尚未开始';
  const calendarCells = [...Array.from({ length: report.calendarStartOffset }, () => null), ...report.dailyExpenses];

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
      <div data-pdf-page="1" data-report-section="overview" className="space-y-6">
        <section className={cn(cardClass, 'monthly-report-hero overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-900 p-6 text-white shadow-lg lg:p-7')}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-blue-100 ring-1 ring-white/15">
                <CalendarDays size={16} /> Flow 记账 · 每月财报
              </div>
              <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">{report.monthKey}</h1>
              <p className="mt-2 text-sm text-blue-100/80">{formatMonthKey(report.monthKey)} · 钱从哪来、花到哪去，以及下个月怎么办。</p>
            </div>
            <div data-pdf-exclude className="monthly-report-toolbar flex flex-wrap items-center gap-2">
              <button type="button" aria-label="前一月" onClick={() => setSelectedMonth((month) => shiftMonthKey(month, -1))} className="rounded-xl border border-white/15 bg-white/10 p-2.5 transition hover:bg-white/20"><ChevronLeft size={18} /></button>
              <input aria-label="选择财报月份" type="month" value={report.monthKey} onChange={(event) => setSelectedMonth(event.target.value)} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none [color-scheme:dark]" />
              <button type="button" aria-label="后一月" disabled={report.monthKey >= currentMonth} onClick={() => setSelectedMonth((month) => shiftMonthKey(month, 1))} className="rounded-xl border border-white/15 bg-white/10 p-2.5 transition hover:bg-white/20 disabled:opacity-40"><ChevronRight size={18} /></button>
              <button type="button" onClick={() => setSelectedMonth(currentMonth)} disabled={report.monthKey === currentMonth} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm font-medium transition hover:bg-white/20 disabled:opacity-40">本月</button>
              <button type="button" onClick={() => void handleExportPdf()} disabled={isExporting} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-900 shadow-sm transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-70">
                <Download size={17} />{isExporting ? '生成两页报告…' : '导出两页 PDF'}
              </button>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-blue-100/70">
            <span>统计口径：可见流水</span><span>金额单位：{baseCurrency}</span><span>正文仅保留统计与洞察</span>
          </div>
        </section>

        {userTrustLevel < 3 && (
          <div data-pdf-exclude className="monthly-report-card flex items-start gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <ReceiptText className="mt-0.5 shrink-0" size={17} />
            <p>当前报表遵循你的隐私权限；受保护流水不会进入金额、分类、排行或 PDF。</p>
          </div>
        )}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard icon={<ArrowDownRight size={17} />} label="本月收入" value={`+${formatAmount(report.summary.income)}`} caption={`${report.summary.recordCount} 笔可见记录`} tone="emerald" />
          <SummaryCard icon={<ArrowUpRight size={17} />} label="本月支出" value={`-${formatAmount(report.summary.expense)}`} caption={`${report.summary.expenseCount} 笔 · 均笔 ${formatAmount(report.summary.averageExpense)}`} tone="rose" />
          <SummaryCard icon={<CircleDollarSign size={17} />} label="净现金流" value={formatSignedAmount(report.summary.netCashFlow)} caption="收入减支出，转账不计入" tone={report.summary.netCashFlow >= 0 ? 'blue' : 'rose'} />
          <SummaryCard icon={<PiggyBank size={17} />} label="结余率" value={report.summary.savingsRate === null ? '—' : `${report.summary.savingsRate.toFixed(1)}%`} caption={report.changes.savingsRatePoints === null ? '收入为 0 时不计算' : `环比 ${report.changes.savingsRatePoints >= 0 ? '+' : ''}${report.changes.savingsRatePoints.toFixed(1)} 个百分点`} tone={report.summary.netCashFlow >= 0 ? 'violet' : 'rose'} />
          <SummaryCard icon={<Gauge size={17} />} label="月度预算执行" value={report.month.budgetPercent === null ? '—' : `${report.month.budgetPercent.toFixed(1)}%`} caption={`${formatAmount(report.month.budgetExpense)} / ${formatAmount(report.month.budget)} · 仅清零型`} tone={(report.month.budgetPercent ?? 0) > 100 ? 'rose' : 'amber'} />
        </section>

        <section className={cn(cardClass, 'p-5')}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">环比变化</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{report.monthKey} vs {report.previousMonthKey}</p></div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400"><ArrowRight size={13} />同口径比较</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { label: '收入', current: report.summary.income, change: report.changes.income, lowerIsBetter: false, tone: 'text-emerald-600 dark:text-emerald-300' },
              { label: '支出', current: report.summary.expense, change: report.changes.expense, lowerIsBetter: true, tone: 'text-rose-600 dark:text-rose-300' },
              { label: '净现金流', current: report.summary.netCashFlow, change: report.changes.netCashFlow, lowerIsBetter: false, tone: 'text-blue-600 dark:text-blue-300' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-slate-50 p-3.5 dark:bg-slate-800/70">
                <div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs text-slate-500 dark:text-slate-400">{item.label}</span><ChangePill change={item.change} lowerIsBetter={item.lowerIsBetter} /></div>
                <p className={cn('text-lg font-bold', item.tone)}>{item.label === '支出' ? '-' : item.current > 0 ? '+' : item.current < 0 ? '-' : ''}{formatAmount(Math.abs(item.current))}</p>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">较上月 {formatSignedAmount(item.change.amount)} {baseCurrency}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
          <div className={cn(cardClass, 'p-5')}>
            <SectionTitle icon={<TrendingUp size={17} />} title="近 6 个月走势" subtitle="收入、支出与每月结余率" />
            <div className="flex h-48 items-end gap-2 sm:gap-4">
              {report.trend.map((point) => {
                const incomeHeight = point.income > 0 ? Math.max(7, (point.income / maxTrendAmount) * 100) : 3;
                const expenseHeight = point.expense > 0 ? Math.max(7, (point.expense / maxTrendAmount) * 100) : 3;
                return (
                  <div key={point.monthKey} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                    <span className={cn('text-[10px] font-medium', (point.savingsRate ?? 0) >= 0 ? 'text-violet-600 dark:text-violet-300' : 'text-rose-500')}>{point.savingsRate === null ? '—' : `${point.savingsRate.toFixed(0)}%`}</span>
                    <div className="flex h-32 w-full items-end justify-center gap-1" title={`${point.label} 收入 ${formatAmount(point.income)} / 支出 ${formatAmount(point.expense)} / 结余率 ${point.savingsRate?.toFixed(1) ?? '—'}%`}>
                      <div className={cn('w-2.5 rounded-t-md bg-emerald-400 sm:w-4', point.isSelected && 'bg-emerald-600 ring-2 ring-emerald-200')} style={{ height: `${incomeHeight}%` }} />
                      <div className={cn('w-2.5 rounded-t-md bg-rose-400 sm:w-4', point.isSelected && 'bg-rose-600 ring-2 ring-rose-200')} style={{ height: `${expenseHeight}%` }} />
                    </div>
                    <span className={cn('text-[10px] text-slate-400', point.isSelected && 'font-semibold text-blue-600')}>{point.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" />收入</span><span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-rose-500" />支出</span><span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-violet-500" />顶部数字为结余率</span>
            </div>
          </div>

          <div className={cn(cardClass, 'p-5')}>
            <SectionTitle icon={<Gauge size={17} />} title="预算与资产池" subtitle={`${monthStatus} · ${report.month.elapsedDays}/${report.month.daysInMonth} 天`} />
            <div className="mb-4 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500" style={{ width: `${monthProgress}%` }} /></div>
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70">
              <div className="flex items-center justify-between text-xs text-slate-500"><span>清零型月度预算</span><span className={cn('font-semibold', (report.month.budgetPercent ?? 0) > 100 ? 'text-rose-600' : 'text-indigo-600')}>{report.month.budgetPercent === null ? '—' : `${report.month.budgetPercent.toFixed(1)}%`}</span></div>
              <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{formatAmount(report.month.budgetExpense)} <span className="text-xs font-normal text-slate-400">/ {formatAmount(report.month.budget)}</span></p>
            </div>
            <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
              <p className="text-xs text-indigo-600 dark:text-indigo-300">滚存资产池 · {report.month.reservePoolCount} 个</p>
              <p className="mt-1 text-lg font-bold text-indigo-950 dark:text-indigo-100">{formatAmount(report.month.reserveBalance)} <span className="text-xs font-normal text-indigo-400">/ 目标 {formatAmount(report.month.reserveTarget)}</span></p>
              <p className="mt-1 text-[10px] text-indigo-500/70">独立展示，不进入本月预算执行率</p>
            </div>
          </div>
        </section>

        <section className={cn(cardClass, 'p-5')}>
          <SectionTitle
            icon={<History size={17} />}
            title="近 6 月资金池配额变化"
            subtitle="只统计清零型月度预算；滚存池以“—”表示当月存在"
          />
          <div className="overflow-x-auto pb-1">
            <div className="min-w-[760px]" style={{ display: 'grid', gridTemplateColumns: 'minmax(10rem, 1.35fr) repeat(6, minmax(5.5rem, 1fr))' }}>
              <div className="border-b border-slate-100 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700">资金池 / 月配额（仅清零型）</div>
              {report.poolBudgetHistory.monthKeys.map((monthKey, index) => (
                <div key={monthKey} className="border-b border-slate-100 px-2 pb-2 text-center dark:border-slate-700">
                  <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{report.poolBudgetHistory.labels[index]}</p>
                  {report.poolBudgetHistory.backfilledMonthKeys.includes(monthKey) && <span className="mt-1 inline-flex rounded-full bg-amber-50 px-1.5 py-0.5 text-[8px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">回填</span>}
                </div>
              ))}

              {report.poolBudgetHistory.series.slice(0, 7).flatMap((series) => [
                <div key={`${series.poolId}-name`} className="flex min-w-0 items-center gap-2 border-b border-slate-100 px-2 py-2.5 dark:border-slate-800">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: series.color }} />
                  <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{series.name}</span>
                </div>,
                ...series.cells.map((cell, index) => {
                  const previous = index > 0 ? series.cells[index - 1] : undefined;
                  const isMonthly = cell.mode === 'monthly';
                  const delta = isMonthly && previous?.mode === 'monthly' ? cell.budget - previous.budget : 0;
                  return (
                    <div key={`${series.poolId}-${cell.monthKey}`} title={isMonthly ? `${series.name} ${cell.monthKey}\n月配额 ${formatAmount(cell.budget)}` : `${series.name} ${cell.monthKey}\n滚存池，不计入月配额`} className="border-b border-slate-100 px-2 py-2 text-center dark:border-slate-800">
                      <p className={cn('text-xs font-semibold', isMonthly ? 'text-slate-800 dark:text-slate-100' : 'text-slate-300 dark:text-slate-600')}>
                        {isMonthly ? formatAmount(cell.budget, 0) : '—'}
                      </p>
                      {isMonthly && <p className={cn('mt-0.5 text-[8px]', delta > 0 ? 'text-rose-500' : delta < 0 ? 'text-emerald-600' : 'text-slate-400')}>
                        {delta === 0 ? '清零' : `${delta > 0 ? '↑' : '↓'}${formatAmount(Math.abs(delta), 0)}`}
                      </p>}
                    </div>
                  );
                }),
              ])}

              <div className="rounded-bl-xl bg-slate-50 px-2 py-2.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">清零型配额合计</div>
              {report.poolBudgetHistory.totals.map((total, index) => (
                <div key={`${report.poolBudgetHistory.monthKeys[index]}-total`} className="bg-slate-50 px-2 py-2.5 text-center text-xs font-bold text-indigo-700 dark:bg-slate-800 dark:text-indigo-300">{formatAmount(total, 0)}</div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-[10px] text-slate-400 dark:text-slate-500">历史回填只代表“用当前配置补齐旧月份”，不是对过去配置的猜测；从本月起将保存真实月度快照。</p>
        </section>
      </div>

      <div data-pdf-page="2" data-report-section="behavior" className="space-y-6">
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className={cn(cardClass, 'p-5')}>
            <SectionTitle icon={<Wallet size={17} />} title="资金池支出分布" subtitle="财务分类，并显示每个池里的主要行为分类" />
            {activePoolBreakdown.length === 0 ? <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:bg-slate-800">该月没有资金池支出</div> : (
              <div className="space-y-4">
                {activePoolBreakdown.map((pool) => (
                  <div key={pool.id}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                      <div className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: pool.color }} /><span className="truncate font-medium text-slate-800 dark:text-slate-200">{pool.name}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] text-slate-500 dark:bg-slate-800">{pool.mode === 'monthly' ? '清零型' : '滚存型'}</span></div>
                      <span className="shrink-0 font-semibold text-slate-900 dark:text-slate-100">{formatAmount(pool.monthlyExpense)} <span className="font-normal text-slate-400">{Math.round(pool.monthlyShare * 100)}%</span></span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full" style={{ backgroundColor: pool.color, width: `${Math.max(3, pool.monthlyShare * 100)}%` }} /></div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">{pool.categories.slice(0, 3).map((category) => <span key={category.id} className="rounded-full bg-slate-50 px-2 py-0.5 text-[9px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{category.name} {formatAmount(category.amount, 0)}</span>)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={cn(cardClass, 'p-5')}>
            <SectionTitle icon={<Target size={17} />} title="钱具体花哪了" subtitle="依据备注关键词自动归类，属于行为分类而非资金池" />
            {report.behaviorCategories.length === 0 ? <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:bg-slate-800">暂无可分类支出</div> : (
              <div className="space-y-3">
                {report.behaviorCategories.slice(0, 8).map((category) => (
                  <div key={category.id}>
                    <div className="mb-1 flex items-center justify-between text-xs"><span className="font-medium text-slate-700 dark:text-slate-200">{category.name} <span className="font-normal text-slate-400">· {category.count} 笔</span></span><span className="font-semibold text-slate-900 dark:text-white">{formatAmount(category.amount)} · {(category.share * 100).toFixed(1)}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full" style={{ backgroundColor: category.color, width: `${Math.max(3, (category.amount / maxCategoryAmount) * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[10px] text-slate-400">当前为内置关键词初步分类；未命中的备注归入“其他消费”。</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)]">
          <div className={cn(cardClass, 'p-5')}>
            <SectionTitle icon={<CalendarDays size={17} />} title="消费日历热力图" subtitle="颜色越深，当日支出越高；悬浮可查看当日主要消费" />
            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="grid grid-cols-7 gap-1.5">
              {calendarCells.map((day, index) => day === null ? <span key={`empty-${index}`} /> : (() => {
                const intensity = day.amount > 0 ? Math.sqrt(day.amount / maxDailyExpense) : 0;
                const tooltip = [`${day.dateKey}`, `支出 ${formatAmount(day.amount)} ${baseCurrency}`, `${day.count} 笔消费`, ...day.topItems.map((item) => `${item.name} ${formatAmount(item.amount)}`)].join('\n');
                return <div key={day.dateKey} title={tooltip} aria-label={tooltip} className={cn('flex aspect-square items-center justify-center rounded-lg text-[10px] font-medium ring-1 ring-inset', day.amount === 0 ? 'bg-slate-50 text-slate-400 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700' : intensity > 0.58 ? 'text-white ring-indigo-600/20' : 'text-indigo-950 ring-indigo-300/30')} style={day.amount > 0 ? { backgroundColor: `rgba(79, 70, 229, ${0.16 + intensity * 0.78})` } : undefined}>{day.day}</div>;
              })())}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800"><p className="text-[9px] text-slate-400">最高消费日</p><p className="mt-1 text-xs font-semibold text-slate-800 dark:text-white">{report.dailyStats.highest ? `${report.dailyStats.highest.day} 日 · ${formatAmount(report.dailyStats.highest.amount)}` : '暂无'}</p></div>
              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800"><p className="text-[9px] text-slate-400">最低非零日</p><p className="mt-1 text-xs font-semibold text-slate-800 dark:text-white">{report.dailyStats.lowestNonZero ? `${report.dailyStats.lowestNonZero.day} 日 · ${formatAmount(report.dailyStats.lowestNonZero.amount)}` : '暂无'}</p></div>
              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800"><p className="text-[9px] text-slate-400">零消费日</p><p className="mt-1 text-xs font-semibold text-slate-800 dark:text-white">{report.dailyStats.zeroDays} 天</p></div>
              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800"><p className="text-[9px] text-slate-400">消费日均值</p><p className="mt-1 text-xs font-semibold text-slate-800 dark:text-white">{formatAmount(report.dailyStats.averageExpenseDay)}</p></div>
            </div>
          </div>

          <div className={cn(cardClass, 'p-5')}>
            <SectionTitle icon={<ListOrdered size={17} />} title="高频与高额排行" subtitle="同一个备注实体的次数、总金额与平均客单" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">按总金额 TOP 5</p><div className="space-y-2">{report.merchantsByAmount.slice(0, 5).map((merchant, index) => <div key={merchant.name} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-700">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-slate-800 dark:text-white">{merchant.name}</p><p className="text-[9px] text-slate-400">{merchant.count} 次 · 均笔 {formatAmount(merchant.average)}</p></div><span className="text-xs font-semibold text-slate-900 dark:text-white">{formatAmount(merchant.amount)}</span></div>)}</div></div>
              <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">按出现次数 TOP 3</p><div className="flex flex-wrap gap-2">{report.merchantsByCount.slice(0, 3).map((merchant) => <span key={merchant.name} className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"><strong>{merchant.name}</strong> · {merchant.count} 次</span>)}</div></div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(19rem,0.75fr)_minmax(0,1.25fr)]">
          <div className={cn(cardClass, 'p-5')}>
            <SectionTitle icon={<Award size={17} />} title="本月之最与累计效应" subtitle="不止看最大一笔，也看频率、连续性和小额泄漏" />
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: '最大单笔', value: report.extremes.largestExpense ? formatAmount(report.extremes.largestExpense.amount) : '暂无', detail: report.extremes.largestExpense?.note || '—' },
                { label: '最烧钱的一天', value: report.dailyStats.highest ? `${report.dailyStats.highest.day} 日` : '暂无', detail: report.dailyStats.highest ? formatAmount(report.dailyStats.highest.amount) : '—' },
                { label: '最高频实体', value: report.extremes.highestFrequencyMerchant?.name || '暂无', detail: report.extremes.highestFrequencyMerchant ? `${report.extremes.highestFrequencyMerchant.count} 次` : '—' },
                { label: '连续消费', value: `${report.extremes.longestExpenseStreak} 天`, detail: '最长有支出连续天数' },
                { label: '最常见金额', value: report.extremes.commonExpenseAmount ? formatAmount(report.extremes.commonExpenseAmount.amount) : '暂无', detail: report.extremes.commonExpenseAmount ? `${report.extremes.commonExpenseAmount.count} 次` : '—' },
                { label: '≤20 元累计', value: `${report.extremes.upTo20.count} 笔`, detail: `${formatAmount(report.extremes.upTo20.amount)} · 其中 ≤10 元 ${report.extremes.upTo10.count} 笔` },
              ].map((item) => <div key={item.label} className="min-w-0 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800"><p className="text-[9px] text-slate-400">{item.label}</p><p className="mt-1 truncate text-sm font-bold text-slate-900 dark:text-white">{item.value}</p><p className="mt-0.5 truncate text-[9px] text-slate-400">{item.detail}</p></div>)}
            </div>
          </div>

          <div className={cn(cardClass, 'p-5')}>
            <SectionTitle icon={<Lightbulb size={17} />} title="本月洞察与下月动作" subtitle="规则根据预算、分类、重复消费和现金流自动挑选重点" />
            <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-2">
                {report.insights.map((insight, index) => <div key={`${insight.title}-${index}`} className={cn('rounded-2xl border p-3', insightTone(insight.tone))}><div className="flex gap-2"><span className="mt-0.5 text-[10px] font-bold">{String(index + 1).padStart(2, '0')}</span><div><p className="text-xs font-semibold">{insight.title}</p><p className="mt-1 text-[10px] leading-4 opacity-75">{insight.body}</p></div></div></div>)}
              </div>
              <div className="rounded-2xl bg-slate-950 p-4 text-white dark:bg-indigo-950">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-indigo-200"><Flame size={14} />下月建议</div>
                <ol className="space-y-3">{report.recommendations.map((recommendation, index) => <li key={recommendation} className="flex gap-2 text-[10px] leading-4 text-slate-200"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold">{index + 1}</span><span>{recommendation}</span></li>)}</ol>
              </div>
            </div>
          </div>
        </section>

        <div data-pdf-exclude className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          <Sparkles className="mt-0.5 shrink-0 text-indigo-500" size={16} />
          <p>月报不再展示完整流水。需要追溯时请前往「流水记录」使用搜索与统计；PDF 固定为两页统计摘要。</p>
        </div>
      </div>
    </div>
  );
}
