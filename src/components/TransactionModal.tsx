import React, { useState } from 'react';
import { X, Plus, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { useStore, Currency, Allocation } from '../store/useStore';
import { cn } from '../lib/utils';
import { presetPercentsToIncomeAllocations } from '../lib/incomePreset';

interface Props {
  onClose: () => void;
}

export default function TransactionModal({ onClose }: Props) {
  const { pools, baseCurrency, exchangeRates, addTransaction, incomePresets } = useStore();
  
  const [type, setType] = useState<'expense' | 'income' | 'transfer' | 'intercept'>('expense');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>(baseCurrency);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  
  // Expense specific
  const [poolId, setPoolId] = useState(pools[0]?.id || '');
  const [coverPoolId, setCoverPoolId] = useState('');
  const [allowNegative, setAllowNegative] = useState(false);

  // Income specific
  const [allocations, setAllocations] = useState<Allocation[]>([{ poolId: pools[0]?.id || '', amount: 0 }]);
  const [allocationMode, setAllocationMode] = useState<'amount' | 'percent'>('amount');
  const [incomePresetId, setIncomePresetId] = useState<string>('');

  // Transfer specific
  const [fromPoolId, setFromPoolId] = useState(pools[0]?.id || '');
  const [toPoolId, setToPoolId] = useState(pools[1]?.id || '');
  const [submitting, setSubmitting] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const convertedAmount = numAmount / exchangeRates[currency]; // Convert to base currency

  // Expense overdraft logic
  const selectedPool = pools.find(p => p.id === poolId);
  const isOverdraft = type === 'expense' && selectedPool && convertedAmount > selectedPool.balance;
  const overdraftAmount = isOverdraft ? convertedAmount - selectedPool.balance : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!numAmount || numAmount <= 0) return;

    if (type === 'income') {
      if (allocationMode === 'percent') {
        const totalPercent = allocations.reduce((sum, a) => sum + a.amount, 0);
        if (totalPercent !== 100) {
          alert('分配比例总和必须为100%');
          return;
        }
      } else {
        const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
        if (Math.abs(totalAllocated - convertedAmount) > 0.01) {
          alert(
            `分配总金额 (${totalAllocated.toFixed(2)}) 必须等于总收入 (${convertedAmount.toFixed(2)})`
          );
          return;
        }
      }
    }

    if (type === 'expense') {
      if (isOverdraft && !allowNegative && !coverPoolId) {
        alert('请选择如何处理超支金额');
        return;
      }
    }

    if (type === 'transfer' && fromPoolId === toPoolId) {
      alert('转出和转入资金池不能相同');
      return;
    }

    setSubmitting(true);
    try {
      if (type === 'expense') {
        if (isOverdraft && coverPoolId && !allowNegative) {
          await addTransaction({
            type: 'transfer',
            amount: overdraftAmount,
            originalAmount: overdraftAmount * exchangeRates[currency],
            currency: baseCurrency,
            date,
            note: `自动填补超支: ${note}`,
            fromPoolId: coverPoolId,
            toPoolId: poolId,
          });
        }

        await addTransaction({
          type: 'expense',
          amount: convertedAmount,
          originalAmount: numAmount,
          currency,
          date,
          note,
          poolId,
        });
      } else if (type === 'income') {
        let finalAllocations = [...allocations];
        if (allocationMode === 'percent') {
          finalAllocations = allocations.map((a) => ({
            poolId: a.poolId,
            amount: convertedAmount * (a.amount / 100),
          }));
        }

        await addTransaction({
          type: 'income',
          amount: convertedAmount,
          originalAmount: numAmount,
          currency,
          date,
          note,
          allocations: finalAllocations,
        });
      } else if (type === 'transfer') {
        await addTransaction({
          type: 'transfer',
          amount: convertedAmount,
          originalAmount: numAmount,
          currency,
          date,
          note,
          fromPoolId,
          toPoolId,
        });
      } else if (type === 'intercept') {
        await addTransaction({
          type: 'intercept',
          amount: convertedAmount,
          originalAmount: numAmount,
          currency,
          date,
          note,
        });
      }

      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh] border border-gray-200/80 dark:border-slate-700">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-slate-700">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-slate-100">记一笔</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors disabled:opacity-40"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="flex p-1 bg-gray-100 dark:bg-slate-800 rounded-lg mb-6">
            {(['expense', 'income', 'intercept', 'transfer'] as const).map(t => (
              <button
                key={t}
                type="button"
                disabled={submitting}
                onClick={() => setType(t)}
                className={cn(
                  "flex-1 py-2 text-sm font-medium rounded-md transition-all disabled:opacity-50",
                  type === t ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 shadow-sm" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
                )}
              >
                {t === 'expense' ? '支出' : t === 'income' ? '收入' : t === 'intercept' ? '拦截' : '转账'}
              </button>
            ))}
          </div>

          <form id="tx-form" onSubmit={handleSubmit} className="space-y-5">
          <fieldset disabled={submitting} className="border-0 p-0 m-0 min-w-0 disabled:opacity-60">
            <div className="flex space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">金额</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-lg font-medium text-gray-900 dark:text-slate-100"
                  placeholder="0.00"
                />
              </div>
              <div className="w-32">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">货币</label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value as Currency)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-900 dark:text-slate-100"
                >
                  {Object.keys(exchangeRates).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {currency !== baseCurrency && numAmount > 0 && (
              <p className="text-sm text-gray-500 dark:text-slate-400">
                约合 {convertedAmount.toFixed(2)} {baseCurrency}
              </p>
            )}

            {(type === 'expense' || type === 'intercept') && (
              <div className="space-y-4">
                {type === 'expense' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">支出资金池</label>
                  <select
                    value={poolId}
                    onChange={e => setPoolId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-slate-100"
                  >
                    {pools.map(p => (
                      <option key={p.id} value={p.id}>{p.name} (余额: {p.balance.toFixed(2)})</option>
                    ))}
                  </select>
                </div>
                )}

                {isOverdraft && (
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 space-y-3">
                    <div className="flex items-start space-x-2 text-amber-800 dark:text-amber-200">
                      <AlertCircle size={20} className="shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">资金池余额不足</p>
                        <p className="text-sm mt-1">当前余额 {selectedPool.balance.toFixed(2)}，将超支 {overdraftAmount.toFixed(2)}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2 pt-2">
                      <label className="flex items-center space-x-2">
                        <input 
                          type="radio" 
                          checked={allowNegative} 
                          onChange={() => { setAllowNegative(true); setCoverPoolId(''); }}
                          className="text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-sm text-amber-900 dark:text-amber-100">允许该资金池变为负数</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input 
                          type="radio" 
                          checked={!allowNegative} 
                          onChange={() => setAllowNegative(false)}
                          className="text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-sm text-amber-900 dark:text-amber-100">从其他资金池挪用填补</span>
                      </label>
                    </div>

                    {!allowNegative && (
                      <select
                        value={coverPoolId}
                        onChange={e => setCoverPoolId(e.target.value)}
                        required
                        className="w-full mt-2 px-3 py-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm text-gray-900 dark:text-slate-100"
                      >
                        <option value="">选择填补资金池...</option>
                        {pools.filter(p => p.id !== poolId).map(p => (
                          <option key={p.id} value={p.id} disabled={p.balance < overdraftAmount}>
                            {p.name} (余额: {p.balance.toFixed(2)})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            )}

            {type === 'income' && (
              <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">分配到资金池</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex bg-gray-100 dark:bg-slate-800 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setAllocationMode('amount');
                          setIncomePresetId('');
                        }}
                        className={cn("px-3 py-1 text-xs font-medium rounded-md", allocationMode === 'amount' ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 shadow-sm" : "text-gray-500 dark:text-slate-400")}
                      >
                        按金额
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllocationMode('percent')}
                        className={cn("px-3 py-1 text-xs font-medium rounded-md", allocationMode === 'percent' ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 shadow-sm" : "text-gray-500 dark:text-slate-400")}
                      >
                        按比例
                      </button>
                    </div>
                  </div>
                </div>

                {allocationMode === 'percent' && incomePresets.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">套用预设</label>
                    <select
                      value={incomePresetId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setIncomePresetId(id);
                        if (!id) return;
                        const preset = incomePresets.find((p) => p.id === id);
                        if (!preset) return;
                        const next = presetPercentsToIncomeAllocations(
                          preset,
                          pools.map((p) => p.id)
                        );
                        if (next.length === 0) {
                          alert('预设中的资金池已失效，请在设置中更新该预设。');
                          setIncomePresetId('');
                          return;
                        }
                        setAllocations(next);
                      }}
                      className="w-full px-3 py-2 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900 rounded-xl text-sm text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">手动填写比例</option>
                      {incomePresets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {allocations.map((alloc, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <select
                      value={alloc.poolId}
                      onChange={e => {
                        setIncomePresetId('');
                        const newAllocs = [...allocations];
                        newAllocs[index].poolId = e.target.value;
                        setAllocations(newAllocs);
                      }}
                      className="flex-1 px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm text-gray-900 dark:text-slate-100"
                    >
                      {pools.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <div className="relative w-32">
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={alloc.amount || ''}
                        onChange={e => {
                          setIncomePresetId('');
                          const newAllocs = [...allocations];
                          newAllocs[index].amount = parseFloat(e.target.value) || 0;
                          setAllocations(newAllocs);
                        }}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm pr-8 text-gray-900 dark:text-slate-100"
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-2 text-gray-400 dark:text-slate-500 text-sm">
                        {allocationMode === 'percent' ? '%' : baseCurrency}
                      </span>
                    </div>
                    {allocations.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIncomePresetId('');
                          setAllocations(allocations.filter((_, i) => i !== index));
                        }}
                        className="p-2 text-gray-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
                
                <button
                  type="button"
                  onClick={() => {
                    setIncomePresetId('');
                    setAllocations([...allocations, { poolId: pools[0]?.id || '', amount: 0 }]);
                  }}
                  className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus size={16} />
                  <span>添加分配</span>
                </button>
              </div>
            )}

            {type === 'transfer' && (
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">转出</label>
                  <select
                    value={fromPoolId}
                    onChange={e => setFromPoolId(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-slate-100"
                  >
                    {pools.map(p => (
                      <option key={p.id} value={p.id}>{p.name} (余额: {p.balance.toFixed(2)})</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">转入</label>
                  <select
                    value={toPoolId}
                    onChange={e => setToPoolId(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-slate-100"
                  >
                    {pools.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">日期</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-gray-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">备注</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-gray-900 dark:text-slate-100"
                placeholder="写点什么..."
              />
            </div>
          </fieldset>
          </form>
        </div>

        <div className="p-6 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/80 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-6 py-2.5 text-gray-600 dark:text-slate-300 font-medium hover:bg-gray-200 dark:hover:bg-slate-700 rounded-xl transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            form="tx-form"
            disabled={submitting}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-sm disabled:opacity-60 disabled:pointer-events-none inline-flex items-center justify-center gap-2 min-w-[120px]"
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin shrink-0" />
                <span>保存中…</span>
              </>
            ) : (
              '保存'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
