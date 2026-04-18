import React, { useState, useMemo } from 'react';
import { useStore, Transaction } from '../store/useStore';
import { Trash2, ArrowRight, Pencil, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import TransactionEditModal from './TransactionEditModal';

const ITEMS_PER_PAGE = 20;

export default function Transactions() {
  const { transactions, pools, deleteTransaction, baseCurrency } = useStore();
  const [editing, setEditing] = useState<Transaction | null>(null);
  
  // 筛选状态
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer' | 'intercept'>('all');
  const [filterPool, setFilterPool] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const getPoolName = (id?: string) => pools.find(p => p.id === id)?.name || '未知';

  // 筛选后的交易
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // 类型筛选
      if (filterType !== 'all' && tx.type !== filterType) {
        return false;
      }
      // 资金池筛选
      if (filterPool !== 'all') {
        if (tx.type === 'expense' && tx.poolId !== filterPool) return false;
        if (tx.type === 'transfer' && tx.fromPoolId !== filterPool && tx.toPoolId !== filterPool) return false;
        if (tx.type === 'income' && tx.allocations && !tx.allocations.some(a => a.poolId === filterPool)) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, filterType, filterPool]);

  // 分页
  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTransactions.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTransactions, currentPage]);

  // 重置页码当筛选变化
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterType, filterPool]);

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
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden animate-in fade-in duration-300">
      <div className="p-6 border-b border-gray-100 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">流水记录</h3>
          
          {/* 筛选器 - 美化版 */}
          <div className="flex flex-wrap items-center gap-3">
            {/* 类型筛选 - 自定义样式 */}
            <div className="relative group">
              <div className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all duration-300",
                "bg-white dark:bg-slate-800",
                "border-gray-200 dark:border-slate-700",
                "group-hover:border-blue-400 dark:group-hover:border-blue-500",
                "group-focus-within:border-blue-500 dark:group-focus-within:border-blue-400",
                "shadow-sm hover:shadow-md"
              )}>
                <Filter size={16} className="text-blue-500 dark:text-blue-400" />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as typeof filterType)}
                  className={cn(
                    "bg-transparent text-sm font-medium outline-none cursor-pointer",
                    "text-gray-700 dark:text-slate-200",
                    "min-w-[80px]",
                    // 自定义下拉框样式
                    "appearance-none",
                    "pr-6"
                  )}
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236B7280' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0 center',
                    backgroundSize: '16px'
                  }}
                >
                  {typeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* 资金池筛选 - 自定义样式 */}
            <div className="relative group">
              <div className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all duration-300",
                "bg-white dark:bg-slate-800",
                "border-gray-200 dark:border-slate-700",
                "group-hover:border-blue-400 dark:group-hover:border-blue-500",
                "group-focus-within:border-blue-500 dark:group-focus-within:border-blue-400",
                "shadow-sm hover:shadow-md"
              )}>
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ 
                    backgroundColor: filterPool !== 'all' 
                      ? pools.find(p => p.id === filterPool)?.color || '#94a3b8'
                      : '#94a3b8'
                  }}
                />
                <select
                  value={filterPool}
                  onChange={(e) => setFilterPool(e.target.value)}
                  className={cn(
                    "bg-transparent text-sm font-medium outline-none cursor-pointer",
                    "text-gray-700 dark:text-slate-200",
                    "min-w-[100px]",
                    // 自定义下拉框样式
                    "appearance-none",
                    "pr-6"
                  )}
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236B7280' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0 center',
                    backgroundSize: '16px'
                  }}
                >
                  <option value="all">全部资金池</option>
                  {pools.map(pool => (
                    <option key={pool.id} value={pool.id}>{pool.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 清除按钮 - 美化版 */}
            {(filterType !== 'all' || filterPool !== 'all') && (
              <button
                onClick={() => {
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
        <div className="flex items-center gap-4 mt-4 text-sm text-gray-500 dark:text-slate-400">
          <span>共 {filteredTransactions.length} 条记录</span>
          {filteredTransactions.length !== transactions.length && (
            <span className="text-gray-400">（筛选自 {transactions.length} 条）</span>
          )}
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
              paginatedTransactions.map(tx => (
                <tr key={tx.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300">
                    {format(new Date(tx.date), 'yyyy-MM-dd')}
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
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-slate-200">
                    {tx.type === 'expense' && getPoolName(tx.poolId)}
                    {tx.type === 'income' && tx.allocations && (
                      <div className="flex flex-col space-y-1">
                        {tx.allocations.map((a, i) => (
                          <span key={i} className="text-xs text-gray-500 dark:text-slate-400">
                            {getPoolName(a.poolId)} ({a.amount.toFixed(2)})
                          </span>
                        ))}
                      </div>
                    )}
                    {tx.type === 'transfer' && (
                      <div className="flex items-center space-x-1 text-gray-500 dark:text-slate-400">
                        <span>{getPoolName(tx.fromPoolId)}</span>
                        <ArrowRight size={14} />
                        <span>{getPoolName(tx.toPoolId)}</span>
                      </div>
                    )}
                    {tx.type === 'intercept' && '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300 max-w-[200px] truncate">
                    {tx.note || '-'}
                  </td>
                  <td className={cn(
                    "px-6 py-4 text-right font-medium",
                    tx.type === 'income' ? "text-emerald-600 dark:text-emerald-400" :
                    tx.type === 'intercept' ? "text-blue-600 dark:text-blue-400" :
                    tx.type === 'expense' ? "text-gray-900 dark:text-slate-100" :
                    "text-gray-600 dark:text-slate-300"
                  )}>
                    {tx.type === 'income' ? '+' : tx.type === 'intercept' ? '+' : tx.type === 'expense' ? '-' : ''}
                    {tx.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    {tx.currency !== baseCurrency && (
                      <div className="text-xs text-gray-400 dark:text-slate-500 font-normal mt-0.5">
                        {tx.originalAmount.toFixed(2)} {tx.currency}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="inline-flex items-center gap-0.5">
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
                    </div>
                  </td>
                </tr>
              ))
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
