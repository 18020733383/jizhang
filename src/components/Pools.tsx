import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Edit2, Trash2, Loader2, Lock, Eye, EyeOff, CreditCard, Link2 } from 'lucide-react';
import { useStore, Pool } from '../store/useStore';
import { cn } from '../lib/utils';
import { monthExpenseByPoolId, totalAllocatedByPoolId } from '../lib/poolBudget';
import PoolBudgetBar from './PoolBudgetBar';
import { apiGet, apiPost, apiPatch } from '../lib/api';

interface PoolsProps {
  userTrustLevel?: number;
}

interface PoolPrivacy {
  poolId: string;
  level: number;
}

export default function Pools({ userTrustLevel = 1 }: PoolsProps) {
  const { pools, transactions, addPool, updatePool, deletePool, baseCurrency } = useStore();
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Pool>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [privacyLevels, setPrivacyLevels] = useState<Record<string, number>>({});
  const [showPrivacySettings, setShowPrivacySettings] = useState(false);
  const [cardPoolLinks, setCardPoolLinks] = useState<Record<string, { cardNumber: string; cardHolder: string }>>({});

  const loadPrivacyLevels = async () => {
    try {
      const data = await apiGet<{ levels: Record<string, Record<string, number>> }>('/auth/privacy', true);
      setPrivacyLevels(data.levels?.pools || {});
    } catch (e) {
      console.error('Failed to load privacy levels:', e);
    }
  };

  const loadCardPoolLinks = async () => {
    try {
      const data = await apiGet<{ cards: Array<{ id: string; card_number: string; card_holder: string; pool_id: string | null }> }>('/cards');
      const links: Record<string, { cardNumber: string; cardHolder: string }> = {};
      for (const card of data.cards || []) {
        if (card.pool_id) {
          links[card.pool_id] = { cardNumber: card.card_number, cardHolder: card.card_holder };
        }
      }
      setCardPoolLinks(links);
    } catch (e) {
      console.error('Failed to load card links:', e);
    }
  };

  useEffect(() => {
    loadPrivacyLevels();
    loadCardPoolLinks();
  }, [userTrustLevel]);

  const getPoolPrivacyLevel = (poolId: string): number => {
    return privacyLevels[poolId] ?? 1;
  };

  const isPoolBlurred = (poolId: string): boolean => {
    if (userTrustLevel >= 3) return false;
    return userTrustLevel < getPoolPrivacyLevel(poolId);
  };

  const setPoolPrivacyLevel = async (poolId: string, level: number) => {
    if (userTrustLevel < 3) return;
    try {
      await apiPost('/auth/privacy', { itemType: 'pools', itemId: poolId, privacyLevel: level });
      setPrivacyLevels(prev => ({ ...prev, [poolId]: level }));
    } catch (e) {
      console.error('Failed to set privacy level:', e);
    }
  };

  const expenseThisMonth = useMemo(() => monthExpenseByPoolId(transactions), [transactions]);
  // 修正：allocated = 当前余额 + 本月支出（这样包含转账和初始余额）
  const allocatedByPool = useMemo(() => {
    const map = new Map<string, number>();
    for (const pool of pools) {
      const spent = expenseThisMonth.get(pool.id) ?? 0;
      map.set(pool.id, pool.balance + spent);
    }
    return map;
  }, [pools, expenseThisMonth]);

  const handleAdd = async () => {
    if (pending) return;
    setPending('add');
    try {
      await addPool({
        name: '新资金池',
        budget: 0,
        color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  };

  const handleSave = async (id: string) => {
    if (pending) return;
    setPending(id);
    try {
      await updatePool(id, editForm);
      setIsEditing(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">资金池管理</h3>
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
        {userTrustLevel >= 3 && (
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={pending !== null}
            className="flex items-center space-x-1 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-100 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {pending === 'add' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            <span>{pending === 'add' ? '添加中…' : '新建资金池'}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pools.map((pool) => {
          const spentMonth = expenseThisMonth.get(pool.id) ?? 0;
          const allocated = allocatedByPool.get(pool.id) ?? 0;

          return (
          <div 
            key={pool.id} 
            className={cn(
              "bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border transition-all relative",
              !!pool.isCardPool
                ? "border-purple-300 dark:border-purple-700 ring-1 ring-purple-200 dark:ring-purple-800"
                : isPoolBlurred(pool.id) 
                  ? "border-amber-200 dark:border-amber-800" 
                  : "border-gray-100 dark:border-slate-700"
            )}
          >
            {!!pool.isCardPool && (
              <div className="absolute -top-2.5 left-4 px-2 py-0.5 bg-purple-500 text-white text-[10px] font-semibold rounded-full flex items-center gap-1 uppercase tracking-wider z-10">
                <CreditCard size={10} />
                {cardPoolLinks[pool.id] ? `储蓄卡 · ${cardPoolLinks[pool.id].cardHolder}` : '储蓄卡池'}
              </div>
            )}
            {isPoolBlurred(pool.id) && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/80 to-transparent dark:via-slate-900/80 rounded-2xl z-10 flex items-center justify-center backdrop-blur-sm">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 bg-white/90 dark:bg-slate-800/90 px-4 py-2 rounded-full shadow-sm">
                  <Lock size={16} />
                  <span className="text-sm font-medium">隐私内容 - Lv{getPoolPrivacyLevel(pool.id)}</span>
                </div>
              </div>
            )}
            
            {isEditing === pool.id ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">名称</label>
                  <input
                    type="text"
                    value={editForm.name || ''}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">预算 ({baseCurrency})</label>
                  <input
                    type="number"
                    value={editForm.budget || 0}
                    onChange={e => setEditForm({ ...editForm, budget: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">颜色</label>
                  <input
                    type="color"
                    value={editForm.color || '#000000'}
                    onChange={e => setEditForm({ ...editForm, color: e.target.value })}
                    className="w-full h-10 p-1 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg cursor-pointer"
                  />
                </div>
                <div className="flex space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => void handleSave(pool.id)}
                    disabled={pending !== null}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-1"
                  >
                    {pending === pool.id ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        保存中…
                      </>
                    ) : (
                      '保存'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(null)}
                    disabled={pending !== null}
                    className="flex-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: pool.color + '20' }}>
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: pool.color }} />
                    </div>
                    <div>
                      <h4 className={cn(
                        "font-semibold text-lg",
                        isPoolBlurred(pool.id) ? "blur-sm" : "text-gray-900 dark:text-slate-100"
                      )}>
                        {pool.name}
                      </h4>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    {showPrivacySettings && userTrustLevel >= 3 && (
                      <select
                        value={getPoolPrivacyLevel(pool.id)}
                        onChange={(e) => setPoolPrivacyLevel(pool.id, Number(e.target.value))}
                        className={cn(
                          "px-2 py-1 rounded-lg text-xs font-medium border-0 cursor-pointer",
                          getPoolPrivacyLevel(pool.id) === 3 
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                            : getPoolPrivacyLevel(pool.id) === 2
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        )}
                      >
                        <option value={1}>Lv1 公开</option>
                        <option value={2}>Lv2 受限</option>
                        <option value={3}>Lv3 私密</option>
                      </select>
                    )}
                    {userTrustLevel >= 3 && (
                      <>
                        <button
                          onClick={() => {
                            setEditForm(pool);
                            setIsEditing(pool.id);
                          }}
                          className="p-2 text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/50"
                        >
                          <Edit2 size={16} />
                        </button>
                        {pools.length > 1 && (
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  '确定删除？若该池仍有余额，请先用「转账」清零；若存在关联流水或收入预设，服务器也会拒绝删除。'
                                )
                              ) {
                                void deletePool(pool.id).catch((e) =>
                                  alert(e instanceof Error ? e.message : String(e))
                                );
                              }
                            }}
                            className="p-2 text-gray-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">当前余额</p>
                    <p className={cn(
                      "text-2xl font-bold transition-all",
                      isPoolBlurred(pool.id) ? "blur-md" : pool.balance < 0 ? "text-rose-600 dark:text-rose-400" : "text-gray-900 dark:text-slate-100"
                    )}>
                      {isPoolBlurred(pool.id) ? '¥••••••' : pool.balance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  
                  {pool.budget > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400">
                        <span>预算 {pool.budget.toFixed(2)} {baseCurrency}</span>
                        <span>整条 = 预算额度</span>
                      </div>
                      <PoolBudgetBar
                        budget={pool.budget}
                        allocated={allocated}
                        spentMonth={spentMonth}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
        })}
      </div>
    </div>
  );
}
