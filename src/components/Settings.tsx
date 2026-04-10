import React from 'react';
import { useStore, Currency } from '../store/useStore';
import IncomePresetsSettings from './IncomePresetsSettings';

export default function Settings() {
  const { baseCurrency, setBaseCurrency, exchangeRates, updateExchangeRate } = useStore();

  return (
    <div className="max-w-2xl space-y-6 animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-6">基础设置</h3>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">主货币</label>
            <select
              value={baseCurrency}
              onChange={e => setBaseCurrency(e.target.value as Currency)}
              className="w-full md:w-64 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {Object.keys(exchangeRates).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <p className="text-sm text-gray-500 mt-2">
              所有统计数据将以此货币为基准进行换算显示。
            </p>
          </div>
        </div>
      </div>

      <IncomePresetsSettings />

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-6">汇率设置</h3>
        <p className="text-sm text-gray-500 mb-6">
          设置其他货币相对于主货币 ({baseCurrency}) 的汇率。例如，如果主货币是 CNY，USD 汇率设为 7.2，则表示 1 USD = 7.2 CNY。
        </p>
        
        <div className="space-y-4">
          {Object.entries(exchangeRates).map(([currency, rate]) => {
            if (currency === baseCurrency) return null;
            return (
              <div key={currency} className="flex items-center space-x-4">
                <div className="w-20 font-medium text-gray-700">{currency}</div>
                <input
                  type="number"
                  step="0.0001"
                  value={rate}
                  onChange={e => updateExchangeRate(currency as Currency, parseFloat(e.target.value) || 0)}
                  className="flex-1 max-w-xs px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
