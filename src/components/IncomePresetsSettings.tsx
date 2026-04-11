import React, { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X, Loader2 } from 'lucide-react';
import {
  useStore,
  type IncomeAllocationPreset,
  type IncomePresetRow,
} from '../store/useStore';
import { cn } from '../lib/utils';

const emptyRow = (poolId: string): IncomePresetRow => ({
  poolId,
  percent: 0,
});

export default function IncomePresetsSettings() {
  const { pools, incomePresets, addIncomePreset, updateIncomePreset, deleteIncomePreset } =
    useStore();

  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftRows, setDraftRows] = useState<IncomePresetRow[]>([]);
  const [saving, setSaving] = useState(false);

  const startNew = () => {
    setEditingId('new');
    setDraftName('我的分配方案');
    setDraftRows(
      pools.length >= 2
        ? [
            { poolId: pools[0].id, percent: 50 },
            { poolId: pools[1].id, percent: 50 },
          ]
        : pools.length === 1
          ? [{ poolId: pools[0].id, percent: 100 }]
          : []
    );
  };

  const startEdit = (p: IncomeAllocationPreset) => {
    setEditingId(p.id);
    setDraftName(p.name);
    setDraftRows(
      p.allocations.length > 0
        ? p.allocations.map((a) => ({ ...a }))
        : pools[0]
          ? [emptyRow(pools[0].id)]
          : []
    );
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftName('');
    setDraftRows([]);
  };

  const sumPercent = draftRows.reduce((s, r) => s + r.percent, 0);

  const saveDraft = async () => {
    if (saving) return;
    if (!draftName.trim()) {
      alert('请填写预设名称');
      return;
    }
    if (draftRows.length === 0) {
      alert('至少保留一行分配');
      return;
    }
    if (Math.abs(sumPercent - 100) > 0.01) {
      alert(`各池比例之和须为 100%，当前为 ${sumPercent.toFixed(2)}%`);
      return;
    }

    setSaving(true);
    try {
      if (editingId === 'new') {
        await addIncomePreset({ name: draftName.trim(), allocations: draftRows });
      } else if (editingId) {
        await updateIncomePreset(editingId, { name: draftName.trim(), allocations: draftRows });
      }
      cancelEdit();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const updateRow = (index: number, patch: Partial<IncomePresetRow>) => {
    const next = [...draftRows];
    next[index] = { ...next[index], ...patch };
    setDraftRows(next);
  };

  const addRow = () => {
    const pid = pools.find((p) => !draftRows.some((r) => r.poolId === p.id))?.id ?? pools[0]?.id;
    if (!pid) return;
    setDraftRows([...draftRows, emptyRow(pid)]);
  };

  const removeRow = (index: number) => {
    setDraftRows(draftRows.filter((_, i) => i !== index));
  };

  const getPoolName = (id: string) => pools.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">收入分配预设</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            为「收入 → 按比例」预先配置各资金池占比（合计 100%）。记一笔时可一键套用。
          </p>
        </div>
        {editingId === null && (
          <button
            type="button"
            onClick={startNew}
            disabled={pools.length === 0 || saving}
            className="flex items-center justify-center space-x-1 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-xl font-medium shrink-0"
          >
            <Plus size={16} />
            <span>新建预设</span>
          </button>
        )}
      </div>

      {pools.length === 0 && (
        <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
          请先在「资金池」中至少创建一个资金池，再添加分配预设。
        </p>
      )}

      {incomePresets.length > 0 && editingId === null && (
        <ul className="space-y-2 mb-4">
          {incomePresets.map((preset) => (
            <li
              key={preset.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-100 dark:border-slate-600"
            >
              <div>
                <span className="font-medium text-gray-800 dark:text-slate-100">{preset.name}</span>
                <span className="text-sm text-gray-500 dark:text-slate-400 ml-2">
                  {preset.allocations.map((a) => `${getPoolName(a.poolId)} ${a.percent}%`).join(' · ')}
                </span>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(preset)}
                  className="flex items-center space-x-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-2 py-1"
                >
                  <Pencil size={14} />
                  <span>编辑</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`删除预设「${preset.name}」？`)) deleteIncomePreset(preset.id);
                  }}
                  className="flex items-center space-x-1 text-sm text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 px-2 py-1"
                >
                  <Trash2 size={14} />
                  <span>删除</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editingId !== null && (
        <div className="border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">预设名称</label>
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="例如：工资到账"
            />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium text-gray-600 dark:text-slate-300">各池比例 (%)</span>
            {draftRows.map((row, index) => (
              <div key={index} className="flex items-center space-x-2">
                <select
                  value={row.poolId}
                  onChange={(e) => updateRow(index, { poolId: e.target.value })}
                  className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {pools.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  value={row.percent || ''}
                  onChange={(e) =>
                    updateRow(index, { percent: parseFloat(e.target.value) || 0 })
                  }
                  className="w-28 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <span className="text-gray-400 dark:text-slate-500 text-sm w-6">%</span>
                {draftRows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="p-2 text-gray-400 hover:text-rose-500"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addRow}
              className="flex items-center space-x-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
            >
              <Plus size={16} />
              <span>添加一行</span>
            </button>
            <p
              className={cn(
                'text-sm',
                Math.abs(sumPercent - 100) > 0.01 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
              )}
            >
              合计：{sumPercent.toFixed(2)}% {Math.abs(sumPercent - 100) > 0.01 ? '（须为 100%）' : '✓'}
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="flex items-center space-x-1 px-4 py-2 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg text-sm disabled:opacity-50"
            >
              <X size={16} />
              <span>取消</span>
            </button>
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={saving}
              className="flex items-center space-x-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-60 min-w-[100px] justify-center"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>保存中…</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>保存</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
