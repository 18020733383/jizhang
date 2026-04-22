import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { apiGet } from '../lib/api';
import { Lock } from 'lucide-react';

interface InterceptProps {
  userTrustLevel?: number;
}

export default function Intercept({ userTrustLevel = 1 }: InterceptProps) {
  const { transactions, interceptTotal, baseCurrency } = useStore();
  const [txPrivacyLevels, setTxPrivacyLevels] = useState<Record<string, number>>({});
  const [showPrivacySettings, setShowPrivacySettings] = useState(false);

  const loadPrivacyLevels = async () => {
    try {
      const data = await apiGet<{ levels: Record<string, Record<string, number>> }>('/auth/privacy', true);
      setTxPrivacyLevels(data.levels?.transactions || {});
    } catch (e) {
      console.error('Failed to load privacy levels:', e);
    }
  };

  useEffect(() => {
    loadPrivacyLevels();
  }, [userTrustLevel]);

  const getTxPrivacyLevel = (txId: string): number => {
    return txPrivacyLevels[txId] ?? 1;
  };

  const isTxBlurred = (txId: string): boolean => {
    if (userTrustLevel >= 3) return false;
    return userTrustLevel < getTxPrivacyLevel(txId);
  };

  const setTxPrivacyLevel = async (txId: string, level: number) => {
    if (userTrustLevel < 3) return;
    try {
      await fetch(`/api/auth/privacy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': localStorage.getItem('userId') || '' },
        body: JSON.stringify({ itemType: 'transactions', itemId: txId, privacyLevel: level }),
      });
      setTxPrivacyLevels(prev => ({ ...prev, [txId]: level }));
    } catch (e) {
      console.error('Failed to set privacy level:', e);
    }
  };

  const visibleInterceptTx = transactions
    .filter(t => t.type === 'intercept')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const visibleTotal = visibleInterceptTx
    .filter(t => !isTxBlurred(t.id))
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="max-w-2xl space-y-6 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">拦截池</h3>
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
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
          当你忍住了不消费，或找到优惠省钱时，记录下来。时间长了能看到省钱的成果。
        </p>
        
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-2">可见累计拦截金额</p>
          <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">
            {visibleTotal.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">{baseCurrency}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
        <h4 className="text-md font-semibold text-gray-800 dark:text-slate-100 mb-4">拦截记录</h4>
        {visibleInterceptTx.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-slate-400 py-8">
            暂无拦截记录。点击「记一笔」添加拦截记录。
          </p>
        ) : (
          <div className="space-y-3">
            {visibleInterceptTx.map(tx => {
              const blurred = isTxBlurred(tx.id);
              return (
                <div
                  key={tx.id}
                  className={cn(
                    "flex items-center justify-between py-3 border-b border-gray-100 dark:border-slate-700 last:border-0 relative",
                    blurred && "blur-[2px]"
                  )}
                >
                  {blurred && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-900/50 z-10">
                      <Lock size={16} className="text-amber-500" />
                    </div>
                  )}
                  {showPrivacySettings && userTrustLevel >= 3 && (
                    <select
                      value={getTxPrivacyLevel(tx.id)}
                      onChange={(e) => setTxPrivacyLevel(tx.id, Number(e.target.value))}
                      className={cn(
                        "absolute left-0 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg text-xs font-medium border-0 cursor-pointer z-20",
                        getTxPrivacyLevel(tx.id) === 3 
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                          : getTxPrivacyLevel(tx.id) === 2
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      )}
                    >
                      <option value={1}>Lv1</option>
                      <option value={2}>Lv2</option>
                      <option value={3}>Lv3</option>
                    </select>
                  )}
                  <div className="flex items-center gap-3 ml-12">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 text-xs font-medium">拦截</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-slate-100">{blurred ? '****' : (tx.note || '拦截')}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">{blurred ? '****-**-**' : format(new Date(tx.date), 'yyyy-MM-dd')}</p>
                    </div>
                  </div>
                  <p className="font-medium text-blue-600 dark:text-blue-400">
                    {blurred ? '****' : `+${tx.amount.toFixed(2)}`}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}