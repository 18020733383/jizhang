import type { Pool, Transaction } from '../store/useStore.types';

export interface MonthlyReportSummary {
  income: number;
  expense: number;
  intercept: number;
  transferVolume: number;
  netCashFlow: number;
  savingsRate: number | null;
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

export interface MonthlyBehaviorCategory {
  id: string;
  name: string;
  color: string;
  amount: number;
  count: number;
  share: number;
}

export interface MonthlyReportPool {
  id: string;
  name: string;
  color: string;
  mode: Pool['mode'];
  monthlyExpense: number;
  monthlyShare: number;
  monthlyBudget: number;
  budgetPercent: number | null;
  categories: MonthlyBehaviorCategory[];
}

export interface MonthlyTrendPoint {
  monthKey: string;
  label: string;
  income: number;
  expense: number;
  intercept: number;
  netCashFlow: number;
  savingsRate: number | null;
  isSelected: boolean;
}

export interface MonthlyMerchant {
  name: string;
  amount: number;
  count: number;
  average: number;
}

export interface DailyExpensePoint {
  dateKey: string;
  day: number;
  amount: number;
  count: number;
  topItems: Array<{ name: string; amount: number }>;
}

export interface ExpenseBand {
  count: number;
  amount: number;
}

export interface MonthlyInsight {
  tone: 'rose' | 'amber' | 'indigo' | 'emerald' | 'slate';
  title: string;
  body: string;
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
    savingsRatePoints: number | null;
  };
  poolBreakdown: MonthlyReportPool[];
  behaviorCategories: MonthlyBehaviorCategory[];
  merchantsByAmount: MonthlyMerchant[];
  merchantsByCount: MonthlyMerchant[];
  dailyExpenses: DailyExpensePoint[];
  calendarStartOffset: number;
  dailyStats: {
    highest?: DailyExpensePoint;
    lowestNonZero?: DailyExpensePoint;
    zeroDays: number;
    averageExpenseDay: number;
  };
  extremes: {
    largestExpense?: Transaction;
    highestFrequencyMerchant?: MonthlyMerchant;
    highestAmountMerchant?: MonthlyMerchant;
    longestExpenseStreak: number;
    commonExpenseAmount?: { amount: number; count: number };
    upTo10: ExpenseBand;
    upTo20: ExpenseBand;
  };
  insights: MonthlyInsight[];
  recommendations: string[];
  trend: MonthlyTrendPoint[];
  month: {
    elapsedDays: number;
    daysInMonth: number;
    budget: number;
    budgetExpense: number;
    budgetPercent: number | null;
    reserveBalance: number;
    reserveTarget: number;
    reservePoolCount: number;
  };
  largestExpense?: Transaction;
  activePools: number;
  activeMonthsLast6: number;
}

type CategoryRule = { id: string; name: string; color: string; keywords: string[] };

const CATEGORY_RULES: CategoryRule[] = [
  { id: 'takeout', name: '外卖/快餐', color: '#f97316', keywords: ['肯德基', 'kfc', '麦当劳', '汉堡王', '德克士', '必胜客', '达美乐', '华莱士', '塔斯汀', '赛百味', '外卖', '饿了么', '美团外卖', '汉堡', '披萨', '快餐'] },
  { id: 'snack', name: '零食/甜品', color: '#ec4899', keywords: ['零食', '薯片', '饼干', '巧克力', '蛋糕', '甜品', '冰淇淋', '雪糕', '糖果', '小吃'] },
  { id: 'drink', name: '饮料/咖啡', color: '#06b6d4', keywords: ['蜜雪冰城', '瑞幸', '星巴克', '茶百道', '喜茶', '奶茶', '咖啡', '饮料', '可乐', '果茶', '矿泉水'] },
  { id: 'meal', name: '普通正餐', color: '#22c55e', keywords: ['食堂', '早餐', '午餐', '晚餐', '正餐', '餐厅', '火锅', '烧烤', '米饭', '盖饭', '吃饭'] },
  { id: 'ai-api', name: 'AI / API', color: '#8b5cf6', keywords: ['chatgpt', 'openai', 'claude', 'gemini', 'deepseek', 'cursor', 'poe', 'api', 'token', 'ai订阅', 'ai 订阅'] },
  { id: 'compute', name: '云算力', color: '#6366f1', keywords: ['autodl', 'runpod', 'vast.ai', '云算力', 'gpu', '服务器', '云主机', 'vps', '算力'] },
  { id: 'network', name: '网络服务', color: '#0ea5e9', keywords: ['vpn', '机场', '宽带', '域名', 'cloudflare', '网络服务', '流量包'] },
  { id: 'transport', name: '交通出行', color: '#14b8a6', keywords: ['滴滴', '打车', '地铁', '公交', '火车', '高铁', '机票', '加油', '停车', '交通'] },
  { id: 'daily', name: '日用品', color: '#eab308', keywords: ['日用品', '超市', '纸巾', '洗衣', '洗发', '牙膏', '清洁', '生活用品'] },
  { id: 'study', name: '学习/文具', color: '#a855f7', keywords: ['文具', '课程', '书籍', '买书', '打印', '本子', '钢笔', '学习'] },
  { id: 'entertainment', name: '娱乐', color: '#ef4444', keywords: ['steam', '游戏', '电影', '视频会员', '音乐会员', '漫画', '娱乐'] },
  { id: 'other', name: '其他消费', color: '#94a3b8', keywords: [] },
];

const MERCHANT_ALIASES: Array<{ name: string; keywords: string[] }> = [
  { name: '肯德基', keywords: ['肯德基', 'kfc'] },
  { name: '麦当劳', keywords: ['麦当劳', 'mcdonald'] },
  { name: '蜜雪冰城', keywords: ['蜜雪冰城'] },
  { name: '瑞幸咖啡', keywords: ['瑞幸', 'luckin'] },
  { name: '饿了么', keywords: ['饿了么'] },
  { name: '美团外卖', keywords: ['美团外卖'] },
  { name: 'ChatGPT', keywords: ['chatgpt', 'openai'] },
  { name: 'Claude', keywords: ['claude'] },
  { name: 'DeepSeek', keywords: ['deepseek'] },
  { name: 'AutoDL', keywords: ['autodl'] },
  { name: 'API 充值', keywords: ['api充值', 'api 充值', 'api'] },
];

const MERCHANT_STOP_WORDS = new Set([
  '支出', '消费', '付款', '购买', '买了', '充值', '续费', '订阅', '月费', '费用', '服务',
  '今天', '今日', '早餐', '午餐', '晚餐', '外卖', '零食', '饮料', '其他', '一笔', '一次',
]);

const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

export function getLocalDateKey(date = new Date()): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
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
  return Number.isNaN(date.getTime()) ? monthKey : `${date.getFullYear()}年${date.getMonth() + 1}月`;
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
  const netCashFlow = income - expense;
  return {
    income,
    expense,
    intercept,
    transferVolume,
    netCashFlow,
    savingsRate: income > 0 ? (netCashFlow / income) * 100 : null,
    recordCount: transactions.length,
    expenseCount,
    averageExpense: expenseCount > 0 ? expense / expenseCount : 0,
    activeDays: activeDays.size,
    expenseDays: expenseDays.size,
  };
}

function getChange(current: number, previous: number): MonthlyReportChange {
  return { amount: current - previous, percent: previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100 };
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

function getCategory(note: string): CategoryRule {
  const normalized = note.trim().toLowerCase();
  return CATEGORY_RULES.find((rule) => rule.keywords.some((keyword) => normalized.includes(keyword))) ?? CATEGORY_RULES[CATEGORY_RULES.length - 1];
}

function aggregateCategories(transactions: Transaction[], totalExpense: number): MonthlyBehaviorCategory[] {
  const totals = new Map<string, { amount: number; count: number }>();
  for (const transaction of transactions) {
    if (transaction.type !== 'expense' || transaction.amount <= 0) continue;
    const category = getCategory(transaction.note);
    const current = totals.get(category.id) ?? { amount: 0, count: 0 };
    current.amount += transaction.amount;
    current.count += 1;
    totals.set(category.id, current);
  }
  return CATEGORY_RULES.map((rule) => {
    const total = totals.get(rule.id) ?? { amount: 0, count: 0 };
    return { id: rule.id, name: rule.name, color: rule.color, amount: total.amount, count: total.count, share: totalExpense > 0 ? total.amount / totalExpense : 0 };
  }).filter((item) => item.count > 0).sort((a, b) => b.amount - a.amount || b.count - a.count);
}

function extractMerchant(note: string): string | null {
  const normalized = note.trim().toLowerCase();
  if (!normalized) return null;
  const alias = MERCHANT_ALIASES.find((item) => item.keywords.some((keyword) => normalized.includes(keyword)));
  if (alias) return alias.name;
  const tokens = note.trim().split(/[\s,，。.!！?？、/\\|:：;；()（）[\]【】_\-—+]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && token.length <= 24 && !/^\d+(?:\.\d+)?(?:元)?$/.test(token));
  return tokens.find((token) => !MERCHANT_STOP_WORDS.has(token.toLowerCase())) ?? null;
}

function aggregateMerchants(expenses: Transaction[]): MonthlyMerchant[] {
  const totals = new Map<string, { amount: number; count: number }>();
  for (const transaction of expenses) {
    const merchant = extractMerchant(transaction.note);
    if (!merchant) continue;
    const current = totals.get(merchant) ?? { amount: 0, count: 0 };
    current.amount += transaction.amount;
    current.count += 1;
    totals.set(merchant, current);
  }
  return [...totals.entries()].map(([name, value]) => ({ name, amount: value.amount, count: value.count, average: value.count > 0 ? value.amount / value.count : 0 }));
}

function buildDailyExpenses(monthKey: string, daysInMonth: number, expenses: Transaction[]): DailyExpensePoint[] {
  const grouped = new Map<string, Transaction[]>();
  for (const transaction of expenses) {
    const dateKey = getTransactionDateKey(transaction.date);
    const rows = grouped.get(dateKey) ?? [];
    rows.push(transaction);
    grouped.set(dateKey, rows);
  }
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const dateKey = `${monthKey}-${String(day).padStart(2, '0')}`;
    const rows = grouped.get(dateKey) ?? [];
    return {
      dateKey,
      day,
      amount: rows.reduce((sum, row) => sum + row.amount, 0),
      count: rows.length,
      topItems: [...rows].sort((a, b) => b.amount - a.amount).slice(0, 3).map((row) => ({ name: (extractMerchant(row.note) ?? row.note.trim()) || '未填写备注', amount: row.amount })),
    };
  });
}

function getLongestStreak(days: DailyExpensePoint[]): number {
  let longest = 0;
  let current = 0;
  for (const day of days) {
    current = day.amount > 0 ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function getCommonExpenseAmount(expenses: Transaction[]): { amount: number; count: number } | undefined {
  const counts = new Map<number, number>();
  for (const transaction of expenses) {
    const amount = Math.round(transaction.amount * 100) / 100;
    counts.set(amount, (counts.get(amount) ?? 0) + 1);
  }
  return [...counts.entries()].map(([amount, count]) => ({ amount, count })).sort((a, b) => b.count - a.count || b.amount - a.amount)[0];
}

function getBand(expenses: Transaction[], limit: number): ExpenseBand {
  const matching = expenses.filter((transaction) => transaction.amount <= limit);
  return { count: matching.length, amount: matching.reduce((sum, transaction) => sum + transaction.amount, 0) };
}

function formatInsightAmount(amount: number): string {
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function createInsights(
  summary: MonthlyReportSummary,
  previousSummary: MonthlyReportSummary,
  pools: MonthlyReportPool[],
  categories: MonthlyBehaviorCategory[],
  merchantsByCount: MonthlyMerchant[],
  upTo20: ExpenseBand,
): MonthlyInsight[] {
  if (summary.recordCount === 0) return [{ tone: 'slate', title: '这个月还没有可分析的流水', body: '记录几笔收支后，这里会自动提炼预算、消费重复和现金流变化。' }];
  const insights: MonthlyInsight[] = [];
  const overspent = pools.filter((pool) => pool.mode === 'monthly' && (pool.budgetPercent ?? 0) > 100);
  if (overspent.length > 0) insights.push({ tone: 'rose', title: `${overspent.map((pool) => pool.name).join('、')}预算已超支`, body: overspent.map((pool) => `${pool.name} ${pool.budgetPercent?.toFixed(1)}%`).join('；') + '。顶部预算执行率只统计清零型月度池。' });
  const topCategory = categories[0];
  if (topCategory) insights.push({ tone: topCategory.share >= 0.4 ? 'amber' : 'indigo', title: `${topCategory.name}是本月最大行为支出`, body: `累计 ${formatInsightAmount(topCategory.amount)}，占支出 ${(topCategory.share * 100).toFixed(1)}%，共 ${topCategory.count} 笔。` });
  const frequentMerchant = merchantsByCount[0];
  if (frequentMerchant && frequentMerchant.count >= 2) insights.push({ tone: frequentMerchant.count >= 6 ? 'amber' : 'slate', title: `${frequentMerchant.name}重复出现 ${frequentMerchant.count} 次`, body: `累计 ${formatInsightAmount(frequentMerchant.amount)}，平均每次 ${formatInsightAmount(frequentMerchant.average)}。这是“高频小额”最值得复盘的入口。` });
  if (upTo20.count >= 3) insights.push({ tone: 'amber', title: `不超过 20 元的小额消费有 ${upTo20.count} 笔`, body: `这些“没多少钱”的流水合计 ${formatInsightAmount(upTo20.amount)}，适合按周设一个小额支出上限。` });
  if (previousSummary.expense > 0) {
    const expenseChange = ((summary.expense - previousSummary.expense) / previousSummary.expense) * 100;
    insights.push({ tone: expenseChange <= 0 ? 'emerald' : expenseChange >= 15 ? 'rose' : 'slate', title: `支出环比${expenseChange <= 0 ? '下降' : '上升'} ${Math.abs(expenseChange).toFixed(1)}%`, body: `本月支出 ${formatInsightAmount(summary.expense)}，上月 ${formatInsightAmount(previousSummary.expense)}。` });
  }
  insights.push({
    tone: summary.netCashFlow >= 0 ? 'emerald' : 'rose',
    title: summary.netCashFlow >= 0 ? '本月保持正现金流' : '本月现金流为负',
    body: summary.savingsRate === null ? `净现金流 ${formatInsightAmount(summary.netCashFlow)}，本月没有可用于计算结余率的收入。` : `净现金流 ${formatInsightAmount(summary.netCashFlow)}，结余率 ${summary.savingsRate.toFixed(1)}%。`,
  });
  return insights.slice(0, 5);
}

function createRecommendations(summary: MonthlyReportSummary, pools: MonthlyReportPool[], categories: MonthlyBehaviorCategory[], upTo20: ExpenseBand): string[] {
  const recommendations: string[] = [];
  const overspent = pools.filter((pool) => pool.mode === 'monthly' && (pool.budgetPercent ?? 0) > 100);
  if (overspent.length > 0) recommendations.push(`先处理 ${overspent.map((pool) => pool.name).join('、')}：下月在 80% 时提醒，避免月底才发现超支。`);
  const topCategory = categories[0];
  if (topCategory && topCategory.amount > 0) recommendations.push(`给“${topCategory.name}”设一个比本月低 10% 的观察目标，约为 ${formatInsightAmount(topCategory.amount * 0.9)}。`);
  if (upTo20.count >= 3) recommendations.push('把不超过 20 元的消费按周汇总；若每周查看一次，比逐笔克制更容易发现累计效应。');
  if (summary.savingsRate !== null && summary.savingsRate < 10) recommendations.push('下月优先把结余率抬到 10%，收入到账时先留出结余，再分配可花预算。');
  if (recommendations.length === 0) recommendations.push('当前预算与现金流较平稳，下月先保持同口径记录，继续观察行为分类是否稳定。');
  return recommendations.slice(0, 4);
}

export function buildMonthlyReport(transactions: Transaction[], pools: Pool[], requestedMonthKey = getLocalMonthKey()): MonthlyReportData {
  const monthKey = MONTH_KEY_PATTERN.test(requestedMonthKey) ? requestedMonthKey : getLocalMonthKey();
  const previousMonthKey = shiftMonthKey(monthKey, -1);
  const monthTransactions = transactions.filter((transaction) => getTransactionMonthKey(transaction.date) === monthKey).sort(sortNewestFirst);
  const previousTransactions = transactions.filter((transaction) => getTransactionMonthKey(transaction.date) === previousMonthKey);
  const expenses = monthTransactions.filter((transaction) => transaction.type === 'expense' && transaction.amount > 0);
  const summary = summarize(monthTransactions);
  const previousSummary = summarize(previousTransactions);
  const behaviorCategories = aggregateCategories(expenses, summary.expense);

  const expenseByPool = new Map<string, Transaction[]>();
  for (const transaction of expenses) {
    if (!transaction.poolId) continue;
    const rows = expenseByPool.get(transaction.poolId) ?? [];
    rows.push(transaction);
    expenseByPool.set(transaction.poolId, rows);
  }
  const poolBreakdown = pools.map((pool) => {
    const poolExpenses = expenseByPool.get(pool.id) ?? [];
    const monthlyExpense = poolExpenses.reduce((sum, transaction) => sum + transaction.amount, 0);
    return {
      id: pool.id,
      name: pool.name,
      color: pool.color,
      mode: pool.mode,
      monthlyExpense,
      monthlyShare: summary.expense > 0 ? monthlyExpense / summary.expense : 0,
      monthlyBudget: pool.budget,
      budgetPercent: pool.budget > 0 ? (monthlyExpense / pool.budget) * 100 : null,
      categories: aggregateCategories(poolExpenses, monthlyExpense),
    };
  }).sort((a, b) => b.monthlyExpense - a.monthlyExpense || a.name.localeCompare(b.name, 'zh-CN'));

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
    return { monthKey: trendMonthKey, label: formatTrendLabel(trendMonthKey), income: trendSummary.income, expense: trendSummary.expense, intercept: trendSummary.intercept, netCashFlow: trendSummary.netCashFlow, savingsRate: trendSummary.savingsRate, isSelected: trendMonthKey === monthKey };
  });

  const daysInMonth = getDaysInMonth(monthKey);
  const dailyExpenses = buildDailyExpenses(monthKey, daysInMonth, expenses);
  const nonZeroDays = dailyExpenses.filter((day) => day.amount > 0);
  const highest = [...nonZeroDays].sort((a, b) => b.amount - a.amount)[0];
  const lowestNonZero = [...nonZeroDays].sort((a, b) => a.amount - b.amount)[0];
  const monthDate = parseMonthKey(monthKey);
  const calendarStartOffset = Number.isNaN(monthDate.getTime()) ? 0 : (monthDate.getDay() + 6) % 7;
  const merchantRows = aggregateMerchants(expenses);
  const merchantsByAmount = [...merchantRows].sort((a, b) => b.amount - a.amount || b.count - a.count);
  const merchantsByCount = [...merchantRows].sort((a, b) => b.count - a.count || b.amount - a.amount);
  const upTo10 = getBand(expenses, 10);
  const upTo20 = getBand(expenses, 20);
  const monthlyPools = pools.filter((pool) => pool.mode === 'monthly');
  const monthlyPoolIds = new Set(monthlyPools.map((pool) => pool.id));
  const monthBudget = monthlyPools.reduce((sum, pool) => sum + Math.max(0, pool.budget), 0);
  const monthBudgetExpense = expenses.filter((transaction) => transaction.poolId && monthlyPoolIds.has(transaction.poolId)).reduce((sum, transaction) => sum + transaction.amount, 0);
  const rolloverPools = pools.filter((pool) => pool.mode === 'rollover');
  const largestExpense = [...expenses].sort((a, b) => b.amount - a.amount)[0];
  const insights = createInsights(summary, previousSummary, poolBreakdown, behaviorCategories, merchantsByCount, upTo20);

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
      savingsRatePoints: summary.savingsRate === null || previousSummary.savingsRate === null ? null : summary.savingsRate - previousSummary.savingsRate,
    },
    poolBreakdown,
    behaviorCategories,
    merchantsByAmount,
    merchantsByCount,
    dailyExpenses,
    calendarStartOffset,
    dailyStats: { highest, lowestNonZero, zeroDays: daysInMonth - nonZeroDays.length, averageExpenseDay: nonZeroDays.length > 0 ? summary.expense / nonZeroDays.length : 0 },
    extremes: {
      largestExpense,
      highestFrequencyMerchant: merchantsByCount[0],
      highestAmountMerchant: merchantsByAmount[0],
      longestExpenseStreak: getLongestStreak(dailyExpenses),
      commonExpenseAmount: getCommonExpenseAmount(expenses),
      upTo10,
      upTo20,
    },
    insights,
    recommendations: createRecommendations(summary, poolBreakdown, behaviorCategories, upTo20),
    trend,
    month: {
      elapsedDays: getElapsedDays(monthKey, daysInMonth),
      daysInMonth,
      budget: monthBudget,
      budgetExpense: monthBudgetExpense,
      budgetPercent: monthBudget > 0 ? (monthBudgetExpense / monthBudget) * 100 : null,
      reserveBalance: rolloverPools.reduce((sum, pool) => sum + Math.max(0, pool.balance), 0),
      reserveTarget: rolloverPools.reduce((sum, pool) => sum + Math.max(0, pool.targetAmount), 0),
      reservePoolCount: rolloverPools.length,
    },
    largestExpense,
    activePools: poolBreakdown.filter((pool) => pool.monthlyExpense > 0).length,
    activeMonthsLast6: trend.filter((item) => item.income > 0 || item.expense > 0 || item.intercept > 0).length,
  };
}
