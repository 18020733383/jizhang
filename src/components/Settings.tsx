import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useStore, Currency } from '../store/useStore';
import { useThemeStore } from '../store/useThemeStore';
import IncomePresetsSettings from './IncomePresetsSettings';
import { cn } from '../lib/utils';

export default function Settings() {
  const { baseCurrency, setBaseCurrency, exchangeRates, updateExchangeRate } = useStore();
  const { theme, setTheme } = useThemeStore();

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
    </div>
  );
}
