import React from 'react';
import { Sun, Moon, Copy, FileJson, FileSpreadsheet, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { useStore, Currency } from '../store/useStore';
import { useThemeStore } from '../store/useThemeStore';
import { useSettingsStore } from '../store/useSettingsStore';
import IncomePresetsSettings from './IncomePresetsSettings';
import { cn } from '../lib/utils';

function exportToJson(data: { pools: unknown[]; transactions: unknown[]; incomePresets: unknown[]; baseCurrency: string; exchangeRates: Record<string, number> }) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jizhang-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportToCsv(transactions: { id: string; type: string; amount: number; originalAmount: number; currency: string; date: string; note: string; poolId?: string; fromPoolId?: string; toPoolId?: string }[]) {
  const headers = ['ID', '类型', '金额', '原始金额', '货币', '日期', '备注', '资金池ID', '转出', '转入'];
  const rows = transactions.map(t => [
    t.id,
    t.type,
    t.amount,
    t.originalAmount,
    t.currency,
    t.date,
    t.note,
    t.poolId || '',
    t.fromPoolId || '',
    t.toPoolId || '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jizhang-transactions-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Settings() {
  const { baseCurrency, setBaseCurrency, exchangeRates, updateExchangeRate, pools, transactions, incomePresets } = useStore();
  const { theme, setTheme } = useThemeStore();
  const { autoRefresh, refreshInterval, setAutoRefresh, setRefreshInterval } = useSettingsStore();
  const [copyStatus, setCopyStatus] = React.useState<'idle' | 'copied' | 'error'>('idle');

  const handleExportJson = () => {
    exportToJson({ pools, transactions, incomePresets, baseCurrency, exchangeRates });
  };

  const handleExportCsv = () => {
    exportToCsv(transactions);
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ pools, transactions, incomePresets, baseCurrency, exchangeRates }, null, 2));
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  return (
    <div className="max-w-2xl space-y-6 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-6">外观</h3>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">界面主题</label>
          <div className="flex rounded-xl border border-gray-200 dark:border-slate-600 p-1 bg-gray-50 dark:bg-slate-800/80 w-full max-w-md">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
                theme === 'light'
                  ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
              )}
            >
              <Sun size={18} className="shrink-0" />
              浅色
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
                theme === 'dark'
                  ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
              )}
            >
              <Moon size={18} className="shrink-0" />
              深色
            </button>
          </div>
          <p className="text-sm text-gray-500 dark:text-slate-400">偏好保存在本机浏览器中。</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-6">基础设置</h3>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">主货币</label>
            <select
              value={baseCurrency}
              onChange={e =>
                void setBaseCurrency(e.target.value as Currency).catch((err) =>
                  alert(err instanceof Error ? err.message : String(err))
                )
              }
              className="w-full md:w-64 px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-slate-100"
            >
              {Object.keys(exchangeRates).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">
              所有统计数据将以此货币为基准进行换算显示。
            </p>
          </div>
        </div>
      </div>

      <IncomePresetsSettings />

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-2">数据自动刷新</h3>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
          开启后，大屏模式会自动定时同步最新数据（适合手机端操作后大屏自动刷新）。
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:bg-blue-600 transition-colors" />
              <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">自动刷新</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-slate-400">间隔</span>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              disabled={!autoRefresh}
              className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-sm disabled:opacity-50"
            >
              <option value={10}>10秒</option>
              <option value={30}>30秒</option>
              <option value={60}>1分钟</option>
              <option value={120}>2分钟</option>
              <option value={300}>5分钟</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-6">汇率设置</h3>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
          设置其他货币相对于主货币 ({baseCurrency}) 的汇率。例如，如果主货币是 CNY，USD 汇率设为 7.2，则表示 1 USD = 7.2 CNY。
        </p>
        
        <div className="space-y-4">
          {Object.entries(exchangeRates).map(([currency, rate]) => {
            if (currency === baseCurrency) return null;
            return (
              <div key={currency} className="flex items-center space-x-4">
                <div className="w-20 font-medium text-gray-700 dark:text-slate-300">{currency}</div>
                <input
                  type="number"
                  step="0.0001"
                  value={rate}
                  onChange={e =>
                    void updateExchangeRate(currency as Currency, parseFloat(e.target.value) || 0).catch(
                      (err) => alert(err instanceof Error ? err.message : String(err))
                    )
                  }
                  className="flex-1 max-w-xs px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-slate-100"
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-2">数据导出</h3>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
          导出你的所有数据，包括资金池、交易记录和收入分配预设。
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportJson}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
          >
            <FileJson size={18} />
            导出 JSON
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors"
          >
            <FileSpreadsheet size={18} />
            导出 CSV
          </button>
          <button
            onClick={handleCopyToClipboard}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-colors',
              copyStatus === 'copied'
                ? 'bg-emerald-600 text-white'
                : copyStatus === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600'
            )}
          >
            {copyStatus === 'copied' ? <Check size={18} /> : copyStatus === 'error' ? <AlertCircle size={18} /> : <Copy size={18} />}
            {copyStatus === 'copied' ? '已复制' : copyStatus === 'error' ? '复制失败' : '复制到剪贴板'}
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-4">
          JSON 格式可完整恢复数据，CSV 适合在表格软件中打开。
        </p>
      </div>
    </div>
  );
}
