import React, { useState } from 'react';
import { useStore, Transaction } from '../store/useStore';
import { Trash2, ArrowRight, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import TransactionEditModal from './TransactionEditModal';

export default function Transactions() {
  const { transactions, pools, deleteTransaction, baseCurrency } = useStore();
  const [editing, setEditing] = useState<Transaction | null>(null);

  const getPoolName = (id?: string) => pools.find(p => p.id === id)?.name || '未知';

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
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">流水记录</h3>
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
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-slate-400">
                  暂无记录
                </td>
              </tr>
            ) : (
              transactions.map(tx => (
                <tr key={tx.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300">
                    {format(new Date(tx.date), 'yyyy-MM-dd')}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium",
                      tx.type === 'income' ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300" :
                      tx.type === 'expense' ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300" :
                      "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                    )}>
                      {tx.type === 'income' ? '收入' : tx.type === 'expense' ? '支出' : '转账'}
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
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300 max-w-[200px] truncate">
                    {tx.note || '-'}
                  </td>
                  <td className={cn(
                    "px-6 py-4 text-right font-medium",
                    tx.type === 'income' ? "text-emerald-600 dark:text-emerald-400" :
                    tx.type === 'expense' ? "text-gray-900 dark:text-slate-100" :
                    "text-gray-600 dark:text-slate-300"
                  )}>
                    {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
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
    </div>
    </>
  );
}
