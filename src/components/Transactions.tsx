import React, { useState, useMemo, useEffect } from 'react';
import { useStore, Transaction } from '../store/useStore';
import { Trash2, ArrowRight, Pencil, ChevronLeft, ChevronRight, Filter, Lock, Search, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { cn, maskText } from '../lib/utils';
import TransactionEditModal from './TransactionEditModal';
import WechatImportModal from './WechatImportModal';
import CustomSelect from './CustomSelect';
import { apiGet, apiPost } from '../lib/api';
import { getTransactionDateKey } from '../lib/monthlyReport';

const ITEMS_PER_PAGE = 20;

function formatTransactionDate(value: string): string {
  const dateKey = getTransactionDateKey(value);
  if (dateKey) return dateKey;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, 'yyyy-MM-dd');
}

function formatSummaryAmount(amount: number): string {
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TransactionSummaryCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-4 py-3 dark:bg-slate-800/70">
      <p className="text-xs text-gray-500 dark:text-slate-400">{label}</p>
      <p className={cn('mt-1 text-base font-semibold', tone)}>{value}</p>
    </div>
  );
}

interface TransactionsProps {
  userTrustLevel?: number;
}

export default function Transactions({ userTrustLevel = 1 }: TransactionsProps) {
  const { transactions, pools, deleteTransaction, baseCurrency } = useStore();
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [showWechatImport, setShowWechatImport] = useState(false);
  const [showPrivacySettings, setShowPrivacySettings] = useState(false);
  const [privacyLevels, setPrivacyLevels] = useState<Record<string, number>>({});
  
  // 筛选状态
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer' | 'intercept'>('all');
  const [filterPool, setFilterPool] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const getPoolName = (id?: string) => pools.find(p => p.id === id)?.name || '未知';

  const loadPrivacyLevels = async () => {
    try {
      const data = await apiGet<{ levels: Record<string, Record<string, number>> }>('/auth/privacy', true);
      setPrivacyLevels(data.levels?.transactions || {});
    } catch (e) {
      console.error('Failed to load privacy levels:', e);
    }
  };

  useEffect(() => {
    loadPrivacyLevels();
  }, [userTrustLevel]);

  const getTransactionPrivacyLevel = (txId: string): number => {
    return privacyLevels[txId] ?? 1;
  };

  const isTransactionBlurred = (txId: string): boolean => {
    if (userTrustLevel >= 3) return false;
    return userTrustLevel < getTransactionPrivacyLevel(txId);
  };

  const setTransactionPrivacyLevel = async (txId: string, level: number) => {
    if (userTrustLevel < 3) return;
    try {
      await apiPost('/auth/privacy', { itemType: 'transactions', itemId: txId, privacyLevel: level });
      setPrivacyLevels(prev => ({ ...prev, [txId]: level }));
    } catch (e) {
      console.error('Failed to set privacy level:', e);
      alert(e instanceof Error ? e.message : '隐私等级保存失败');
    }
  };

  // 搜索与筛选后的交易 - 不过滤隐私项，只在 UI 上模糊处理
  const filteredTransactions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('zh-CN');
    return transactions.filter(tx => {
      // 类型筛选
      if (filterType !== 'all' && tx.type !== filterType) {
        return false;
      }
      // 资金池筛选
      if (filterPool !== 'all') {
        const matchesPool = tx.type === 'expense'
          ? tx.poolId === filterPool
          : tx.type === 'transfer'
            ? tx.fromPoolId === filterPool || tx.toPoolId === filterPool
            : tx.type === 'income'
              ? (tx.allocations ?? []).some(a => a.poolId === filterPool)
              : false;
        if (!matchesPool) return false;
      }
      if (normalizedQuery) {
        const poolNames = [
          tx.poolId,
          tx.fromPoolId,
          tx.toPoolId,
          ...(tx.allocations ?? []).map(allocation => allocation.poolId),
        ]
          .filter(Boolean)
          .map(id => getPoolName(id));
        const searchText = [
          tx.note,
          tx.type,
          tx.type === 'income' ? '收入' : tx.type === 'expense' ? '支出' : tx.type === 'transfer' ? '转账' : '拦截',
          formatTransactionDate(tx.date),
          tx.amount.toFixed(2),
          tx.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }),
          tx.originalAmount.toFixed(2),
          tx.originalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }),
          tx.currency,
          ...poolNames,
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('zh-CN');
        if (!searchText.includes(normalizedQuery)) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, filterType, filterPool, searchQuery, pools]);

  const transactionStats = useMemo(() => {
    const visibleTransactions = filteredTransactions.filter(tx => !isTransactionBlurred(tx.id));
    return visibleTransactions.reduce((stats, tx) => {
      if (tx.type === 'income') stats.income += tx.amount;
      if (tx.type === 'expense') {
        stats.expense += tx.amount;
        stats.expenseCount += 1;
      }
      if (tx.type === 'intercept') stats.intercept += tx.amount;
      if (tx.type === 'transfer') stats.transferVolume += tx.amount;
      return stats;
    }, {
      income: 0,
      expense: 0,
      intercept: 0,
      transferVolume: 0,
      expenseCount: 0,
      visibleCount: visibleTransactions.length,
    });
  }, [filteredTransactions, privacyLevels, userTrustLevel]);

  const hiddenFilteredCount = filteredTransactions.length - transactionStats.visibleCount;

  // 分页
  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTransactions.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTransactions, currentPage]);

  // 重置页码当筛选变化
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterType, filterPool, searchQuery]);

  const typeOptions = [
    { value: 'all', label: '全部类型' },
    { value: 'income', label: '收入' },
    { value: 'expense', label: '支出' },
    { value: 'transfer', label: '转账' },
    { value: 'intercept', label: '拦截' },
  ];

  return (
    <>
    {editing && (
      <TransactionEditModal
        key={editing.id}
        transaction={editing}
        onClose={() => setEditing(null)}
      />
    )}
    {showWechatImport && (
      <WechatImportModal onClose={() => setShowWechatImport(false)} />
    )}
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden animate-in fade-in duration-300">
      <div className="p-6 border-b border-gray-100 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">流水记录</h3>
            <button
              type="button"
              onClick={() => setShowWechatImport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40 transition-colors"
              title="从微信账单 Excel 导入"
            >
              <Upload size={16} />
              导入账单
            </button>
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
          
          {/* 筛选器 */}
          <div className="flex flex-wrap items-center gap-3">
            {/* 搜索 */}
            <label className="relative min-w-[220px] flex-1 sm:flex-none">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
              <input
                type="search"
                aria-label="搜索流水"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索备注、资金池、日期或金额"
                className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-blue-500"
              />
            </label>

            {/* 类型筛选 */}
            <CustomSelect
              value={filterType}
              onChange={(v) => setFilterType(v as typeof filterType)}
              options={typeOptions}
              icon={<Filter size={16} />}
              className="min-w-[140px]"
            />
            
            {/* 资金池筛选 */}
            <CustomSelect
              value={filterPool}
              onChange={setFilterPool}
              options={[
                { value: 'all', label: '全部资金池' },
                ...pools.map(p => ({ value: p.id, label: p.name, color: p.color }))
              ]}
              icon={true}
              iconColor={filterPool !== 'all' ? pools.find(p => p.id === filterPool)?.color : '#94a3b8'}
            />

            {/* 清除按钮 - 美化版 */}
            {(searchQuery || filterType !== 'all' || filterPool !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterType('all');
                  setFilterPool('all');
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl",
                  "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400",
                  "hover:bg-gray-200 dark:hover:bg-slate-700",
                  "transition-all duration-200"
                )}
              >
                <span className="text-xs">✕</span>
                清除
              </button>
            )}
          </div>
        </div>
        
        {/* 统计信息 */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-slate-400">
          <span>共 {filteredTransactions.length} 条记录</span>
          {filteredTransactions.length !== transactions.length && (
            <span className="text-gray-400">（筛选自 {transactions.length} 条）</span>
          )}
          {hiddenFilteredCount > 0 && (
            <span className="text-amber-600 dark:text-amber-400">{hiddenFilteredCount} 条受权限保护，未计入统计</span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <TransactionSummaryCard
            label="收入合计"
            value={`+${formatSummaryAmount(transactionStats.income)} ${baseCurrency}`}
            tone="text-emerald-600 dark:text-emerald-300"
          />
          <TransactionSummaryCard
            label="支出合计"
            value={`${transactionStats.expense > 0 ? '-' : ''}${formatSummaryAmount(transactionStats.expense)} ${baseCurrency}`}
            tone="text-rose-600 dark:text-rose-300"
          />
          <TransactionSummaryCard
            label="净现金流"
            value={`${transactionStats.income - transactionStats.expense >= 0 ? '+' : '-'}${formatSummaryAmount(Math.abs(transactionStats.income - transactionStats.expense))} ${baseCurrency}`}
            tone={transactionStats.income - transactionStats.expense >= 0 ? 'text-blue-600 dark:text-blue-300' : 'text-rose-600 dark:text-rose-300'}
          />
          <TransactionSummaryCard
            label="拦截合计"
            value={`+${formatSummaryAmount(transactionStats.intercept)} ${baseCurrency}`}
            tone="text-indigo-600 dark:text-indigo-300"
          />
          <TransactionSummaryCard
            label="转账合计"
            value={`${formatSummaryAmount(transactionStats.transferVolume)} ${baseCurrency}`}
            tone="text-gray-700 dark:text-slate-200"
          />
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-800/80 text-gray-500 dark:text-slate-400 text-sm">
              <th className="px-6 py-4 font-medium">日期</th>
              <th className="px-6 py-4 font-medium">类型</th>
              <th className="px-6 py-4 font-medium">资金池</th>
              <th className="px-6 py-4 font-medium">备注</th>
              <th className="px-6 py-4 font-medium text-right">金额 ({baseCurrency})</th>
              <th className="px-6 py-4 font-medium text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {paginatedTransactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-slate-400">
                  {filteredTransactions.length === 0 ? '暂无记录' : '没有符合筛选条件的记录'}
                </td>
              </tr>
            ) : (
              paginatedTransactions.map(tx => {
                const blurred = isTransactionBlurred(tx.id);
                return (
                <tr key={tx.id} className={cn(
                  "hover:bg-gray-50/50 dark:hover:bg-slate-800/50 transition-colors relative",
                  blurred && "blur-[2px] select-none"
                )}>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300">
                    {blurred ? maskText(formatTransactionDate(tx.date), 10) : formatTransactionDate(tx.date)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium",
                      tx.type === 'income' ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300" :
                      tx.type === 'expense' ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300" :
                      tx.type === 'intercept' ? "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300" :
                      "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                    )}>
                      {tx.type === 'income' ? '收入' : tx.type === 'expense' ? '支出' : tx.type === 'intercept' ? '拦截' : '转账'}
                    </span>
                  </td>
                  <td className={cn("px-6 py-4 text-sm", blurred ? "text-gray-400" : "text-gray-700 dark:text-slate-200")}>
                    {blurred ? maskText(tx.poolId ? getPoolName(tx.poolId) : '-', 4) : (tx.type === 'expense' && getPoolName(tx.poolId))}
                    {blurred ? '' : (tx.type === 'income' && tx.allocations && (
                      <div className="flex flex-col space-y-1">
                        {tx.allocations.map((a, i) => (
                          <span key={i} className="text-xs text-gray-500 dark:text-slate-400">
                            {getPoolName(a.poolId)} ({a.amount.toFixed(2)})
                          </span>
                        ))}
                      </div>
                    ))}
                    {blurred ? '' : (tx.type === 'transfer' && (
                      <div className="flex items-center space-x-1 text-gray-500 dark:text-slate-400">
                        <span>{getPoolName(tx.fromPoolId)}</span>
                        <ArrowRight size={14} />
                        <span>{getPoolName(tx.toPoolId)}</span>
                      </div>
                    ))}
                    {tx.type === 'intercept' && '-'}
                  </td>
                  <td className={cn("px-6 py-4 text-sm max-w-[200px] truncate", blurred && "blur-[2px]")}>
                    {blurred ? maskText(tx.note || '-', 4) : (tx.note || '-')}
                  </td>
                  <td className={cn(
                    "px-6 py-4 text-right font-medium",
                    blurred && "blur-[2px]",
                    tx.type === 'income' ? "text-emerald-600 dark:text-emerald-400" :
                    tx.type === 'intercept' ? "text-blue-600 dark:text-blue-400" :
                    tx.type === 'expense' ? "text-gray-900 dark:text-slate-100" :
                    "text-gray-600 dark:text-slate-300"
                  )}>
                    {tx.type === 'income' ? '+' : tx.type === 'intercept' ? '+' : tx.type === 'expense' ? '-' : ''}
                    {blurred ? maskText(tx.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }), 4) : tx.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    {blurred ? '' : (tx.currency !== baseCurrency && (
                      <div className="text-xs text-gray-400 dark:text-slate-500 font-normal mt-0.5">
                        {tx.originalAmount.toFixed(2)} {tx.currency}
                      </div>
                    ))}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="inline-flex items-center gap-0.5">
                      {showPrivacySettings && userTrustLevel >= 3 && (
                        <select
                          value={getTransactionPrivacyLevel(tx.id)}
                          onChange={(e) => setTransactionPrivacyLevel(tx.id, Number(e.target.value))}
                          className={cn(
                            "px-2 py-1 rounded-lg text-xs font-medium border-0 cursor-pointer",
                            getTransactionPrivacyLevel(tx.id) === 3 
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                              : getTransactionPrivacyLevel(tx.id) === 2
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          )}
                        >
                          <option value={1}>Lv1</option>
                          <option value={2}>Lv2</option>
                          <option value={3}>Lv3</option>
                        </select>
                      )}
                      {userTrustLevel >= 3 && !blurred && (
                        <>
                          <button
                            type="button"
                            title="编辑"
                            onClick={() => setEditing(tx)}
                            className="p-2 text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors inline-flex"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            title="删除"
                            onClick={() => {
                              if (confirm('确定要删除这条记录吗？相关资金池余额将自动恢复。')) {
                                void deleteTransaction(tx.id).catch((e) =>
                                  alert(e instanceof Error ? e.message : String(e))
                                );
                              }
                            }}
                            className="p-2 text-gray-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors inline-flex"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <div className="text-sm text-gray-500 dark:text-slate-400">
            第 {currentPage} / {totalPages} 页
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={cn(
                      "w-8 h-8 rounded-lg text-sm font-medium transition-colors",
                      currentPage === pageNum
                        ? "bg-blue-600 text-white"
                        : "hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
