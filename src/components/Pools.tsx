import React, { useState, useMemo } from 'react';
import { useStore, Pool } from '../store/useStore';
import { Plus, Edit2, Trash2, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { monthExpenseByPoolId } from '../lib/poolBudget';
import PoolBudgetBar from './PoolBudgetBar';

export default function Pools() {
  const { pools, transactions, addPool, updatePool, deletePool, baseCurrency } = useStore();
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Pool>>({});
  const [pending, setPending] = useState<string | null>(null);

  const expenseThisMonth = useMemo(() => monthExpenseByPoolId(transactions), [transactions]);

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
        <h3 className="text-lg font-semibold text-gray-800">资金池管理</h3>
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={pending !== null}
          className="flex items-center space-x-1 text-sm bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {pending === 'add' ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Plus size={16} />
          )}
          <span>{pending === 'add' ? '添加中…' : '新建资金池'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pools.map((pool) => {
          const spentMonth = expenseThisMonth.get(pool.id) ?? 0;

          return (
          <div key={pool.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            {isEditing === pool.id ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">名称</label>
                  <input
                    type="text"
                    value={editForm.name || ''}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">预算 ({baseCurrency})</label>
                  <input
                    type="number"
                    value={editForm.budget || 0}
                    onChange={e => setEditForm({ ...editForm, budget: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">颜色</label>
                  <input
                    type="color"
                    value={editForm.color || '#000000'}
                    onChange={e => setEditForm({ ...editForm, color: e.target.value })}
                    className="w-full h-10 p-1 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer"
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
                    className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
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
                    <h4 className="font-semibold text-gray-900 text-lg">{pool.name}</h4>
                  </div>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => {
                        setEditForm(pool);
                        setIsEditing(pool.id);
                      }}
                      className="p-2 text-gray-400 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50"
                    >
                      <Edit2 size={16} />
                    </button>
                    {pools.length > 1 && (
                      <button
                        onClick={() => {
                          if (confirm('确定删除？若存在关联流水或预设，服务器会拒绝删除。')) {
                            void deletePool(pool.id).catch((e) =>
                              alert(e instanceof Error ? e.message : String(e))
                            );
                          }
                        }}
                        className="p-2 text-gray-400 hover:text-rose-600 transition-colors rounded-lg hover:bg-rose-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">当前余额</p>
                    <p className={cn("text-2xl font-bold", pool.balance < 0 ? "text-rose-600" : "text-gray-900")}>
                      {pool.balance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  
                  {pool.budget > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>预算 {pool.budget.toFixed(2)} {baseCurrency}</span>
                        <span>整条 = 预算额度</span>
                      </div>
                      <PoolBudgetBar
                        budget={pool.budget}
                        balance={pool.balance}
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
