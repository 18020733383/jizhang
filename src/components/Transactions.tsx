import React from 'react';
import { useStore } from '../store/useStore';
import { Trash2, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

export default function Transactions() {
  const { transactions, pools, deleteTransaction, baseCurrency } = useStore();

  const getPoolName = (id?: string) => pools.find(p => p.id === id)?.name || '未知';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in duration-300">
      <div className="p-6 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800">流水记录</h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-sm">
              <th className="px-6 py-4 font-medium">日期</th>
              <th className="px-6 py-4 font-medium">类型</th>
              <th className="px-6 py-4 font-medium">资金池</th>
              <th className="px-6 py-4 font-medium">备注</th>
              <th className="px-6 py-4 font-medium text-right">金额 ({baseCurrency})</th>
              <th className="px-6 py-4 font-medium text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  暂无记录
                </td>
              </tr>
            ) : (
              transactions.map(tx => (
                <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {format(new Date(tx.date), 'yyyy-MM-dd')}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium",
                      tx.type === 'income' ? "bg-emerald-100 text-emerald-700" :
                      tx.type === 'expense' ? "bg-rose-100 text-rose-700" :
                      "bg-blue-100 text-blue-700"
                    )}>
                      {tx.type === 'income' ? '收入' : tx.type === 'expense' ? '支出' : '转账'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {tx.type === 'expense' && getPoolName(tx.poolId)}
                    {tx.type === 'income' && tx.allocations && (
                      <div className="flex flex-col space-y-1">
                        {tx.allocations.map((a, i) => (
                          <span key={i} className="text-xs text-gray-500">
                            {getPoolName(a.poolId)} ({a.amount.toFixed(2)})
                          </span>
                        ))}
                      </div>
                    )}
                    {tx.type === 'transfer' && (
                      <div className="flex items-center space-x-1 text-gray-500">
                        <span>{getPoolName(tx.fromPoolId)}</span>
                        <ArrowRight size={14} />
                        <span>{getPoolName(tx.toPoolId)}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-[200px] truncate">
                    {tx.note || '-'}
                  </td>
                  <td className={cn(
                    "px-6 py-4 text-right font-medium",
                    tx.type === 'income' ? "text-emerald-600" :
                    tx.type === 'expense' ? "text-gray-900" :
                    "text-gray-600"
                  )}>
                    {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                    {tx.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    {tx.currency !== baseCurrency && (
                      <div className="text-xs text-gray-400 font-normal mt-0.5">
                        {tx.originalAmount.toFixed(2)} {tx.currency}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => {
                        if (confirm('确定要删除这条记录吗？相关资金池余额将自动恢复。')) {
                          void deleteTransaction(tx.id).catch((e) =>
                            alert(e instanceof Error ? e.message : String(e))
                          );
                        }
                      }}
                      className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors inline-flex"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
