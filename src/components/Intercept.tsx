import React from 'react';
import { useStore } from '../store/useStore';
import { format } from 'date-fns';

export default function Intercept() {
  const { transactions, interceptTotal, baseCurrency } = useStore();

  const interceptTx = transactions
    .filter(t => t.type === 'intercept')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="max-w-2xl space-y-6 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-2">拦截池</h3>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
          当你忍住了不消费，或找到优惠省钱时，记录下来。时间长了能看到省钱的成果。
        </p>
        
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-2">累计拦截金额</p>
          <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">
            {interceptTotal.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">{baseCurrency}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
        <h4 className="text-md font-semibold text-gray-800 dark:text-slate-100 mb-4">拦截记录</h4>
        {interceptTx.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-slate-400 py-8">
            暂无拦截记录。点击「记一笔」添加拦截记录。
          </p>
        ) : (
          <div className="space-y-3">
            {interceptTx.map(tx => (
              <div
                key={tx.id}
                className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-slate-700 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                    <span className="text-blue-600 dark:text-blue-400 text-xs font-medium">拦截</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-slate-100">{tx.note || '拦截'}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">{format(new Date(tx.date), 'yyyy-MM-dd')}</p>
                  </div>
                </div>
                <p className="font-medium text-blue-600 dark:text-blue-400">
                  +{tx.amount.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}