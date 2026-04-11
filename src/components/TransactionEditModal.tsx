import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { useStore, Currency, Allocation, Transaction } from '../store/useStore';
import { cn } from '../lib/utils';
import { presetPercentsToIncomeAllocations } from '../lib/incomePreset';

interface Props {
  transaction: Transaction;
  onClose: () => void;
}

function expenseEffectiveBalance(poolId: string, pools: { id: string; balance: number }[], tx: Transaction): number {
  const p = pools.find((x) => x.id === poolId);
  if (!p) return 0;
  if (tx.type !== 'expense' || !tx.poolId) return p.balance;
  if (tx.poolId === poolId) return p.balance + tx.amount;
  return p.balance;
}

function transferEffectiveFromBalance(
  fromPoolId: string,
  pools: { id: string; balance: number }[],
  tx: Transaction
): number {
  const p = pools.find((x) => x.id === fromPoolId);
  if (!p) return 0;
  if (tx.type !== 'transfer' || !tx.fromPoolId) return p.balance;
  if (fromPoolId === tx.fromPoolId) return p.balance + tx.amount;
  return p.balance;
}

export default function TransactionEditModal({ transaction, onClose }: Props) {
  const { pools, baseCurrency, exchangeRates, updateTransaction, incomePresets } = useStore();

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>(baseCurrency);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');

  const [poolId, setPoolId] = useState('');
  const [allowNegative, setAllowNegative] = useState(false);

  const [allocations, setAllocations] = useState<Allocation[]>([{ poolId: '', amount: 0 }]);
  const [allocationMode, setAllocationMode] = useState<'amount' | 'percent'>('amount');
  const [incomePresetId, setIncomePresetId] = useState<string>('');

  const [fromPoolId, setFromPoolId] = useState('');
  const [toPoolId, setToPoolId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setAmount(String(transaction.originalAmount));
    setCurrency(transaction.currency);
    setDate(transaction.date.includes('T') ? transaction.date.split('T')[0] : transaction.date.slice(0, 10));
    setNote(transaction.note);
    setAllowNegative(false);
    setIncomePresetId('');

    if (transaction.type === 'expense') {
      setPoolId(transaction.poolId || pools[0]?.id || '');
    }
    if (transaction.type === 'income') {
      const rows =
        transaction.allocations?.length && transaction.allocations.length > 0
          ? transaction.allocations.map((a) => ({ poolId: a.poolId, amount: a.amount }))
          : [{ poolId: pools[0]?.id || '', amount: 0 }];
      setAllocations(rows);
      setAllocationMode('amount');
    }
    if (transaction.type === 'transfer') {
      setFromPoolId(transaction.fromPoolId || pools[0]?.id || '');
      setToPoolId(transaction.toPoolId || pools[1]?.id || pools[0]?.id || '');
    }
    // 仅当切换记录或资金池列表从空加载出来时同步表单，避免 refreshState 替换 transaction 引用时冲掉未保存编辑
  }, [transaction.id, pools.length]);

  const numAmount = parseFloat(amount) || 0;
  const convertedAmount = numAmount / exchangeRates[currency];

  const selectedPool = pools.find((p) => p.id === poolId);
  const effectiveExpenseBalance =
    transaction.type === 'expense' ? expenseEffectiveBalance(poolId, pools, transaction) : 0;
  const isExpenseOverdraft =
    transaction.type === 'expense' &&
    selectedPool &&
    convertedAmount > effectiveExpenseBalance;

  const effectiveFromBal =
    transaction.type === 'transfer' ? transferEffectiveFromBalance(fromPoolId, pools, transaction) : 0;
  const isTransferOverdraft =
    transaction.type === 'transfer' &&
    fromPoolId &&
    convertedAmount > effectiveFromBal;

  const typeLabel =
    transaction.type === 'income' ? '收入' : transaction.type === 'expense' ? '支出' : '转账';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!numAmount || numAmount <= 0) return;

    if (transaction.type === 'income') {
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

    if (transaction.type === 'expense' && isExpenseOverdraft && !allowNegative) {
      alert('修改后金额超过该资金池可用余额，请调低金额、更换资金池，或勾选允许负数');
      return;
    }

    if (transaction.type === 'transfer') {
      if (fromPoolId === toPoolId) {
        alert('转出和转入资金池不能相同');
        return;
      }
      if (isTransferOverdraft && !allowNegative) {
        alert('修改后转出金额超过该资金池可用余额，请调低金额、更换转出池，或勾选允许负数');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (transaction.type === 'expense') {
        await updateTransaction(transaction.id, {
          type: 'expense',
          amount: convertedAmount,
          originalAmount: numAmount,
          currency,
          date,
          note,
          poolId,
        });
      } else if (transaction.type === 'income') {
        let finalAllocations = [...allocations];
        if (allocationMode === 'percent') {
          finalAllocations = allocations.map((a) => ({
            poolId: a.poolId,
            amount: convertedAmount * (a.amount / 100),
          }));
        }
        await updateTransaction(transaction.id, {
          type: 'income',
          amount: convertedAmount,
          originalAmount: numAmount,
          currency,
          date,
          note,
          allocations: finalAllocations,
        });
      } else {
        await updateTransaction(transaction.id, {
          type: 'transfer',
          amount: convertedAmount,
          originalAmount: numAmount,
          currency,
          date,
          note,
          fromPoolId,
          toPoolId,
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-800">编辑流水</h2>
            <span
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium',
                transaction.type === 'income'
                  ? 'bg-emerald-100 text-emerald-700'
                  : transaction.type === 'expense'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-blue-100 text-blue-700'
              )}
            >
              {typeLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <form id="tx-edit-form" onSubmit={handleSubmit} className="space-y-5">
            <fieldset disabled={submitting} className="border-0 p-0 m-0 min-w-0 disabled:opacity-60">
              <div className="flex space-x-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">金额</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-lg font-medium"
                    placeholder="0.00"
                  />
                </div>
                <div className="w-32">
                  <label className="block text-sm font-medium text-gray-700 mb-1">货币</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as Currency)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  >
                    {Object.keys(exchangeRates).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {currency !== baseCurrency && numAmount > 0 && (
                <p className="text-sm text-gray-500">约合 {convertedAmount.toFixed(2)} {baseCurrency}</p>
              )}

              {transaction.type === 'expense' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">支出资金池</label>
                    <select
                      value={poolId}
                      onChange={(e) => setPoolId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {pools.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (余额: {p.balance.toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </div>

                  {isExpenseOverdraft && (
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-3">
                      <div className="flex items-start space-x-2 text-amber-800">
                        <AlertCircle size={20} className="shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">修改后余额不足</p>
                          <p className="text-sm mt-1">
                            按当前账目，该池可用约 {effectiveExpenseBalance.toFixed(2)} {baseCurrency}
                            （已抵消本条旧记录影响）
                          </p>
                        </div>
                      </div>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={allowNegative}
                          onChange={(e) => setAllowNegative(e.target.checked)}
                          className="text-amber-600 focus:ring-amber-500 rounded"
                        />
                        <span className="text-sm text-amber-900">允许该资金池变为负数</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {transaction.type === 'income' && (
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="block text-sm font-medium text-gray-700">分配到资金池</label>
                    <div className="flex bg-gray-100 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setAllocationMode('amount');
                          setIncomePresetId('');
                        }}
                        className={cn(
                          'px-3 py-1 text-xs font-medium rounded-md',
                          allocationMode === 'amount' ? 'bg-white shadow-sm' : 'text-gray-500'
                        )}
                      >
                        按金额
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllocationMode('percent')}
                        className={cn(
                          'px-3 py-1 text-xs font-medium rounded-md',
                          allocationMode === 'percent' ? 'bg-white shadow-sm' : 'text-gray-500'
                        )}
                      >
                        按比例
                      </button>
                    </div>
                  </div>

                  {allocationMode === 'percent' && incomePresets.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">套用预设</label>
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
                        className="w-full px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
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
                        onChange={(e) => {
                          setIncomePresetId('');
                          const newAllocs = [...allocations];
                          newAllocs[index].poolId = e.target.value;
                          setAllocations(newAllocs);
                        }}
                        className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      >
                        {pools.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <div className="relative w-32">
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={alloc.amount || ''}
                          onChange={(e) => {
                            setIncomePresetId('');
                            const newAllocs = [...allocations];
                            newAllocs[index].amount = parseFloat(e.target.value) || 0;
                            setAllocations(newAllocs);
                          }}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm pr-8"
                          placeholder="0"
                        />
                        <span className="absolute right-3 top-2 text-gray-400 text-sm">
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
                          className="p-2 text-gray-400 hover:text-rose-500 transition-colors"
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

              {transaction.type === 'transfer' && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">转出</label>
                      <select
                        value={fromPoolId}
                        onChange={(e) => setFromPoolId(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        {pools.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (余额: {p.balance.toFixed(2)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">转入</label>
                      <select
                        value={toPoolId}
                        onChange={(e) => setToPoolId(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        {pools.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {isTransferOverdraft && (
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-3">
                      <div className="flex items-start space-x-2 text-amber-800">
                        <AlertCircle size={20} className="shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">转出池可用余额不足</p>
                          <p className="text-sm mt-1">
                            按当前账目，转出池可用约 {effectiveFromBal.toFixed(2)} {baseCurrency}
                          </p>
                        </div>
                      </div>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={allowNegative}
                          onChange={(e) => setAllowNegative(e.target.checked)}
                          className="text-amber-600 focus:ring-amber-500 rounded"
                        />
                        <span className="text-sm text-amber-900">允许转出资金池变为负数</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              <div className="flex space-x-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">日期</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="写点什么..."
                />
              </div>
            </fieldset>
          </form>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-6 py-2.5 text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            form="tx-edit-form"
            disabled={submitting}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-sm disabled:opacity-60 disabled:pointer-events-none inline-flex items-center justify-center gap-2 min-w-[120px]"
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin shrink-0" />
                <span>保存中…</span>
              </>
            ) : (
              '保存修改'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
