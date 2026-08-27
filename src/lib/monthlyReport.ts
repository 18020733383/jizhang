import type { Pool, Transaction } from '../store/useStore.types';

export interface MonthlyReportSummary {
  income: number;
  expense: number;
  intercept: number;
  transferVolume: number;
  netCashFlow: number;
  recordCount: number;
  expenseCount: number;
  averageExpense: number;
  activeDays: number;
  expenseDays: number;
}

export interface MonthlyReportChange {
  amount: number;
  percent: number | null;
}

export interface MonthlyReportPool {
  id: string;
  name: string;
  color: string;
  monthlyExpense: number;
  monthlyShare: number;
  monthlyBudget: number;
  budgetPercent: number | null;
}

export interface MonthlyTrendPoint {
  monthKey: string;
  label: string;
  income: number;
  expense: number;
  intercept: number;
  netCashFlow: number;
  isSelected: boolean;
}

export interface MonthlyReportData {
  monthKey: string;
  previousMonthKey: string;
  monthTransactions: Transaction[];
  summary: MonthlyReportSummary;
  previousSummary: MonthlyReportSummary;
  changes: {
    income: MonthlyReportChange;
    expense: MonthlyReportChange;
    netCashFlow: MonthlyReportChange;
  };
  poolBreakdown: MonthlyReportPool[];
  trend: MonthlyTrendPoint[];
  month: {
    elapsedDays: number;
    daysInMonth: number;
    budget: number;
    budgetPercent: number | null;
  };
  largestExpense?: Transaction;
  activePools: number;
  activeMonthsLast6: number;
}

const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

export function getLocalDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function getLocalMonthKey(date = new Date()): string {
  return getLocalDateKey(date).slice(0, 7);
}

/** Extract a calendar date without letting a UTC conversion shift a date-only value. */
export function getTransactionDateKey(value: string | Date): string {
  if (value instanceof Date) return getLocalDateKey(value);
  const match = String(value).match(DATE_KEY_PATTERN);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : getLocalDateKey(parsed);
}

export function getTransactionMonthKey(value: string | Date): string {
  return getTransactionDateKey(value).slice(0, 7);
}

export function parseMonthKey(monthKey: string): Date {
  const match = monthKey.match(MONTH_KEY_PATTERN);
  if (!match) return new Date(NaN);
  return new Date(Number(match[1]), Number(match[2]) - 1, 1, 12);
}

export function shiftMonthKey(monthKey: string, amount: number): string {
  const date = parseMonthKey(monthKey);
  if (Number.isNaN(date.getTime())) return monthKey;
  date.setMonth(date.getMonth() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthKey(monthKey: string): string {
  const date = parseMonthKey(monthKey);
  if (Number.isNaN(date.getTime())) return monthKey;
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function formatTrendLabel(monthKey: string): string {
  const date = parseMonthKey(monthKey);
  if (Number.isNaN(date.getTime())) return monthKey;
  return `${date.getFullYear() === new Date().getFullYear() ? '' : `${date.getFullYear()}年`}${date.getMonth() + 1}月`;
}

function summarize(transactions: Transaction[]): MonthlyReportSummary {
  let income = 0;
  let expense = 0;
  let intercept = 0;
  let transferVolume = 0;
  let expenseCount = 0;
  const activeDays = new Set<string>();
  const expenseDays = new Set<string>();

  for (const transaction of transactions) {
    const dateKey = getTransactionDateKey(transaction.date);
    if (dateKey) activeDays.add(dateKey);
    if (transaction.type === 'income') income += transaction.amount;
    if (transaction.type === 'expense') {
      expense += transaction.amount;
      expenseCount += 1;
      if (dateKey) expenseDays.add(dateKey);
    }
    if (transaction.type === 'intercept') intercept += transaction.amount;
    if (transaction.type === 'transfer') transferVolume += transaction.amount;
  }

  return {
    income,
    expense,
    intercept,
    transferVolume,
    netCashFlow: income - expense,
    recordCount: transactions.length,
    expenseCount,
    averageExpense: expenseCount > 0 ? expense / expenseCount : 0,
    activeDays: activeDays.size,
    expenseDays: expenseDays.size,
  };
}

function getChange(current: number, previous: number): MonthlyReportChange {
  return {
    amount: current - previous,
    percent: previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100,
  };
}

function getDaysInMonth(monthKey: string): number {
  const date = parseMonthKey(monthKey);
  return Number.isNaN(date.getTime()) ? 0 : new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getElapsedDays(monthKey: string, daysInMonth: number): number {
  const currentMonthKey = getLocalMonthKey();
  if (monthKey < currentMonthKey) return daysInMonth;
  if (monthKey > currentMonthKey) return 0;
  return new Date().getDate();
}

function sortNewestFirst(a: Transaction, b: Transaction): number {
  return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
}

export function buildMonthlyReport(
  transactions: Transaction[],
  pools: Pool[],
  requestedMonthKey = getLocalMonthKey(),
): MonthlyReportData {
  const monthKey = MONTH_KEY_PATTERN.test(requestedMonthKey)
    ? requestedMonthKey
    : getLocalMonthKey();
  const previousMonthKey = shiftMonthKey(monthKey, -1);
  const monthTransactions = transactions
    .filter((transaction) => getTransactionMonthKey(transaction.date) === monthKey)
    .sort(sortNewestFirst);
  const previousTransactions = transactions.filter(
    (transaction) => getTransactionMonthKey(transaction.date) === previousMonthKey,
  );
  const summary = summarize(monthTransactions);
  const previousSummary = summarize(previousTransactions);

  const expenseByPool = new Map<string, number>();
  for (const transaction of monthTransactions) {
    if (transaction.type !== 'expense' || !transaction.poolId) continue;
    expenseByPool.set(
      transaction.poolId,
      (expenseByPool.get(transaction.poolId) ?? 0) + transaction.amount,
    );
  }

  const poolBreakdown = pools
    .map((pool) => {
      const monthlyExpense = expenseByPool.get(pool.id) ?? 0;
      return {
        id: pool.id,
        name: pool.name,
        color: pool.color,
        monthlyExpense,
        monthlyShare: summary.expense > 0 ? monthlyExpense / summary.expense : 0,
        monthlyBudget: pool.budget,
        budgetPercent: pool.budget > 0 ? (monthlyExpense / pool.budget) * 100 : null,
      };
    })
    .sort((a, b) => b.monthlyExpense - a.monthlyExpense || a.name.localeCompare(b.name, 'zh-CN'));

  const transactionsByMonth = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const transactionMonthKey = getTransactionMonthKey(transaction.date);
    const monthItems = transactionsByMonth.get(transactionMonthKey) ?? [];
    monthItems.push(transaction);
    transactionsByMonth.set(transactionMonthKey, monthItems);
  }

  const trend = Array.from({ length: 6 }, (_, index) => {
    const trendMonthKey = shiftMonthKey(monthKey, index - 5);
    const trendSummary = summarize(transactionsByMonth.get(trendMonthKey) ?? []);
    return {
      monthKey: trendMonthKey,
      label: formatTrendLabel(trendMonthKey),
      income: trendSummary.income,
      expense: trendSummary.expense,
      intercept: trendSummary.intercept,
      netCashFlow: trendSummary.netCashFlow,
      isSelected: trendMonthKey === monthKey,
    };
  });

  const daysInMonth = getDaysInMonth(monthKey);
  const monthBudget = pools.reduce((sum, pool) => sum + Math.max(0, pool.budget), 0);
  const largestExpense = monthTransactions
    .filter((transaction) => transaction.type === 'expense')
    .sort((a, b) => b.amount - a.amount)[0];

  return {
    monthKey,
    previousMonthKey,
    monthTransactions,
    summary,
    previousSummary,
    changes: {
      income: getChange(summary.income, previousSummary.income),
      expense: getChange(summary.expense, previousSummary.expense),
      netCashFlow: getChange(summary.netCashFlow, previousSummary.netCashFlow),
    },
    poolBreakdown,
    trend,
    month: {
      elapsedDays: getElapsedDays(monthKey, daysInMonth),
      daysInMonth,
      budget: monthBudget,
      budgetPercent: monthBudget > 0 ? (summary.expense / monthBudget) * 100 : null,
    },
    largestExpense,
    activePools: poolBreakdown.filter((pool) => pool.monthlyExpense > 0).length,
    activeMonthsLast6: trend.filter((item) => item.income > 0 || item.expense > 0 || item.intercept > 0).length,
  };
}
