import React, { useState, useEffect, useMemo } from 'react';
import { useSanMarketStore } from '../store/useSanMarketStore';
import { 
  TrendingUp, TrendingDown, Plus, Trash2, Edit2, 
  Activity, BrainCircuit, AlertCircle, X, History, CandlestickChart, LineChart as LineChartIcon
} from 'lucide-react';
import { cn } from '../lib/utils';
import { format, parseISO } from 'date-fns';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, AreaChart, Area, ReferenceLine, ComposedChart, Bar
} from 'recharts';
import { useThemeStore } from '../store/useThemeStore';

// 预设的焦虑来源模板
const STOCK_TEMPLATES = [
  { name: '工作压力', code: 'WORK', desc: '无穷无尽的KPI和deadline', color: '#ef4444' },
  { name: '房贷', code: 'LOAN', desc: '每月固定掉血', color: '#f97316' },
  { name: '催婚', code: 'MARR', desc: '来自爸妈的亲切问候', color: '#eab308' },
  { name: '社交焦虑', code: 'SOCL', desc: '被迫营业的周末', color: '#8b5cf6' },
  { name: '健康焦虑', code: 'HLTH', desc: '体检报告不敢看', color: '#ec4899' },
  { name: '容貌焦虑', code: 'FACE', desc: '镜子里的自己越来越陌生', color: '#06b6d4' },
  { name: '年龄焦虑', code: 'AGE', desc: '又老了一岁', color: '#84cc16' },
  { name: '存款焦虑', code: 'SAVE', desc: '余额不足恐惧症', color: '#f43f5e' },
  { name: '职业焦虑', code: 'CARE', desc: '35岁危机提前到来', color: '#a855f7' },
  { name: '人际焦虑', code: 'RLAT', desc: '处理关系好累', color: '#14b8a6' },
];

export default function SanMarket() {
  const { 
    stocks, histories, isLoading, loadStocks, addStock, 
    updateStock, deleteStock, addHistory, loadHistory, getStockChange 
  } = useSanMarketStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [editingStock, setEditingStock] = useState<string | null>(null);
  const chartDark = useThemeStore((s) => s.theme === 'dark');

  useEffect(() => {
    void loadStocks();
  }, []);

  useEffect(() => {
    if (selectedStock) {
      void loadHistory(selectedStock);
    }
  }, [selectedStock]);

  // 计算大盘指数（平均SAN值）
  const marketIndex = useMemo(() => {
    if (stocks.length === 0) return { value: 100, change: 0, percent: 0 };
    const total = stocks.reduce((sum, s) => sum + s.currentValue, 0);
    const baseTotal = stocks.reduce((sum, s) => sum + s.baseValue, 0);
    const value = total / stocks.length;
    const change = value - (baseTotal / stocks.length);
    const percent = baseTotal > 0 ? (change / (baseTotal / stocks.length)) * 100 : 0;
    return { value, change, percent };
  }, [stocks]);

  // 情绪评级
  const sanityLevel = useMemo(() => {
    if (marketIndex.value <= 50) return { level: '情绪稳定', color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
    if (marketIndex.value <= 80) return { level: '轻度焦虑', color: 'text-yellow-500', bg: 'bg-yellow-500/10' };
    if (marketIndex.value <= 120) return { level: '中度焦虑', color: 'text-orange-500', bg: 'bg-orange-500/10' };
    return { level: '重度焦虑', color: 'text-red-500', bg: 'bg-red-500/10' };
  }, [marketIndex.value]);

  const selectedStockData = stocks.find(s => s.id === selectedStock);
  const selectedHistory = selectedStock ? histories[selectedStock] || [] : [];
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');

  // 准备图表数据
  const chartData = useMemo(() => {
    if (!selectedHistory.length) return [];
    return [...selectedHistory].reverse().map(h => ({
      date: format(parseISO(h.recordedAt), 'MM-dd HH:mm'),
      value: h.value,
      note: h.note,
    }));
  }, [selectedHistory]);

  // 准备K线数据（将连续记录聚合成蜡烛形态）
  const candleData = useMemo(() => {
    if (!selectedHistory.length) return [];
    const sorted = [...selectedHistory].sort((a, b) => 
      new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
    );
    
    return sorted.map((h, i) => {
      const prev = i > 0 ? sorted[i - 1].value : h.value;
      const open = prev;
      const close = h.value;
      const high = Math.max(open, close);
      const low = Math.min(open, close);
      const isUp = close < open; // SAN值下降是好事（绿色）
      
      return {
        date: format(parseISO(h.recordedAt), 'MM-dd HH:mm'),
        open,
        close,
        high,
        low,
        isUp,
        value: h.value,
        note: h.note,
      };
    });
  }, [selectedHistory]);

  const handleAddStock = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    addStock({
      name: formData.get('name') as string,
      code: formData.get('code') as string,
      description: formData.get('description') as string,
      baseValue: 100,
      currentValue: Number(formData.get('currentValue') || 100),
      color: formData.get('color') as string,
    }).then(() => {
      setShowAddModal(false);
      form.reset();
    });
  };

  const handleRecordSan = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedStock) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    addHistory({
      stockId: selectedStock,
      value: Number(formData.get('value')),
      note: formData.get('note') as string,
    }).then(() => {
      setShowRecordModal(false);
      form.reset();
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 大盘指数卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -mr-20 -mt-20" />
          <div className="relative">
            <div className="flex items-center space-x-2 mb-2">
              <Activity className="text-blue-400" size={20} />
              <span className="text-sm text-slate-400">SAN值大盘指数</span>
            </div>
            <h3 className="text-4xl font-bold mb-1">{marketIndex.value.toFixed(2)}</h3>
            <div className={cn(
              "flex items-center space-x-1 text-sm",
              marketIndex.change < 0 ? "text-emerald-400" : "text-rose-400"
            )}>
              {marketIndex.change < 0 ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
              <span>{Math.abs(marketIndex.change).toFixed(2)} ({Math.abs(marketIndex.percent).toFixed(2)}%)</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {marketIndex.change < 0 ? 'SAN值下降是好事 ✓' : 'SAN值上升，注意心理健康'}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
          <div className="flex items-center space-x-2 mb-2">
            <BrainCircuit className="text-purple-500" size={20} />
            <span className="text-sm text-gray-500 dark:text-slate-400">精神状态评估</span>
          </div>
          <div className={cn("inline-flex items-center px-3 py-1 rounded-full text-sm font-medium", sanityLevel.bg, sanityLevel.color)}>
            {sanityLevel.level}
          </div>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-3">
            基于 {stocks.length} 个焦虑来源综合计算
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
          <div className="flex items-center space-x-2 mb-2">
            <AlertCircle className="text-amber-500" size={20} />
            <span className="text-sm text-gray-500 dark:text-slate-400">最高焦虑源</span>
          </div>
          {stocks.length > 0 && (() => {
            const maxStock = stocks.reduce((max, s) => s.currentValue > max.currentValue ? s : max, stocks[0]);
            return (
              <div>
                <h4 className="text-xl font-bold text-gray-900 dark:text-slate-100">{maxStock.name}</h4>
                <p className="text-sm text-gray-500 dark:text-slate-400">{maxStock.code} • {maxStock.currentValue}点</p>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">焦虑股市</h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium transition-all"
        >
          <Plus size={18} />
          <span>新增股票</span>
        </button>
      </div>

      {/* 股票列表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {stocks.map((stock) => {
          const { change, percent, isUp } = getStockChange(stock);
          const isSelected = selectedStock === stock.id;
          
          return (
            <div 
              key={stock.id}
              onClick={() => setSelectedStock(stock.id)}
              className={cn(
                "bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border cursor-pointer transition-all hover:shadow-md",
                isSelected 
                  ? "border-blue-500 dark:border-blue-400 ring-2 ring-blue-500/20" 
                  : "border-gray-100 dark:border-slate-700"
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: stock.color }}
                  >
                    {stock.code.slice(0, 2)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-slate-100">{stock.name}</h4>
                    <p className="text-xs text-gray-500 dark:text-slate-400">{stock.code}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{stock.currentValue}</p>
                  <div className={cn(
                    "flex items-center justify-end space-x-1 text-sm",
                    isUp ? "text-emerald-500" : "text-rose-500"
                  )}>
                    {isUp ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                    <span>{change.toFixed(1)} ({percent.toFixed(1)}%)</span>
                  </div>
                </div>
              </div>
              
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">{stock.description}</p>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1 text-xs text-gray-400">
                  <span>基准: {stock.baseValue}</span>
                  <span className="mx-1">•</span>
                  <span>波动: {Math.abs(stock.currentValue - stock.baseValue).toFixed(1)}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedStock(stock.id);
                      setShowRecordModal(true);
                    }}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    title="记录SAN值"
                  >
                    <History size={16} className="text-gray-500" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingStock(stock.id);
                    }}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <Edit2 size={16} className="text-gray-500" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('确定要删除这支股票吗？')) {
                        deleteStock(stock.id);
                      }
                    }}
                    className="p-2 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} className="text-red-500" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 选中股票的图表 */}
      {selectedStockData && chartData.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">
                {selectedStockData.name} ({selectedStockData.code})
              </h3>
              <p className="text-sm text-gray-500 dark:text-slate-400">SAN值走势</p>
            </div>
            <div className="flex items-center space-x-2">
              {/* 图表类型切换 */}
              <div className="flex bg-gray-100 dark:bg-slate-800 rounded-lg p-1">
                <button
                  onClick={() => setChartType('line')}
                  className={cn(
                    "flex items-center space-x-1 px-3 py-1.5 rounded-md text-sm transition-all",
                    chartType === 'line' 
                      ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 shadow-sm" 
                      : "text-gray-500 dark:text-slate-400"
                  )}
                >
                  <LineChartIcon size={14} />
                  <span>走势</span>
                </button>
                <button
                  onClick={() => setChartType('candle')}
                  className={cn(
                    "flex items-center space-x-1 px-3 py-1.5 rounded-md text-sm transition-all",
                    chartType === 'candle' 
                      ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 shadow-sm" 
                      : "text-gray-500 dark:text-slate-400"
                  )}
                >
                  <CandlestickChart size={14} />
                  <span>K线</span>
                </button>
              </div>
              <button
                onClick={() => setShowRecordModal(true)}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
              >
                <Plus size={16} />
                <span>记录SAN值</span>
              </button>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'line' ? (
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sanGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={selectedStockData.color} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={selectedStockData.color} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartDark ? '#334155' : '#f3f4f6'} />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: chartDark ? '#94a3b8' : '#9ca3af', fontSize: 11 }} 
                    dy={10}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    domain={[0, 200]} 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: chartDark ? '#94a3b8' : '#9ca3af', fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: chartDark ? '1px solid #475569' : 'none',
                      backgroundColor: chartDark ? '#1e293b' : '#fff',
                      color: chartDark ? '#f1f5f9' : '#1f2937',
                      boxShadow: chartDark ? 'none' : '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    formatter={(value: number) => [`SAN值: ${value}`, '']}
                    labelFormatter={(label) => `时间: ${label}`}
                  />
                  <ReferenceLine y={selectedStockData.baseValue} stroke="#94a3b8" strokeDasharray="4 4" label="基准线" />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke={selectedStockData.color} 
                    strokeWidth={3} 
                    fillOpacity={1} 
                    fill="url(#sanGradient)" 
                  />
                </AreaChart>
              ) : (
                <ComposedChart data={candleData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartDark ? '#334155' : '#f3f4f6'} />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: chartDark ? '#94a3b8' : '#9ca3af', fontSize: 11 }} 
                    dy={10}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    domain={[0, 200]} 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: chartDark ? '#94a3b8' : '#9ca3af', fontSize: 11 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700">
                            <p className="text-xs text-gray-500 mb-1">{d.date}</p>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between gap-4">
                                <span className="text-gray-500">开盘:</span>
                                <span className={d.isUp ? 'text-emerald-500' : 'text-rose-500'}>{d.open.toFixed(1)}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-gray-500">收盘:</span>
                                <span className={d.isUp ? 'text-emerald-500' : 'text-rose-500'}>{d.close.toFixed(1)}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-gray-500">最高:</span>
                                <span>{d.high.toFixed(1)}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-gray-500">最低:</span>
                                <span>{d.low.toFixed(1)}</span>
                              </div>
                            </div>
                            {d.note && <p className="text-xs text-gray-400 mt-2 pt-2 border-t">{d.note}</p>}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine y={selectedStockData.baseValue} stroke="#94a3b8" strokeDasharray="4 4" />
                  {/* 绘制K线 */}
                  {candleData.map((entry, index) => (
                    <g key={`candle-${index}`}>
                      {/* 影线 */}
                      <line
                        x1={`${(index / (candleData.length - 1)) * 100}%`}
                        y1={entry.high}
                        x2={`${(index / (candleData.length - 1)) * 100}%`}
                        y2={entry.low}
                        stroke={entry.isUp ? '#10b981' : '#f43f5e'}
                        strokeWidth={1}
                      />
                      {/* 实体 */}
                      <rect
                        x={`${(index / (candleData.length - 1)) * 100 - 1}%`}
                        y={Math.min(entry.open, entry.close)}
                        width="2%"
                        height={Math.abs(entry.close - entry.open) || 2}
                        fill={entry.isUp ? '#10b981' : '#f43f5e'}
                        rx={2}
                      />
                    </g>
                  ))}
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
          {chartType === 'candle' && (
            <div className="flex items-center justify-center space-x-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center"><span className="w-3 h-3 bg-emerald-500 rounded-sm mr-1"></span> SAN下降（好事）</span>
              <span className="flex items-center"><span className="w-3 h-3 bg-rose-500 rounded-sm mr-1"></span> SAN上升（焦虑↑）</span>
            </div>
          )}
        </div>
      )}

      {/* 添加股票模态框 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">新增焦虑股票</h3>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg">
                <X size={20} />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-500 mb-2">快速选择模板：</p>
              <div className="flex flex-wrap gap-2">
                {STOCK_TEMPLATES.map((t) => (
                  <button
                    key={t.code}
                    onClick={() => {
                      const form = document.getElementById('addStockForm') as HTMLFormElement;
                      (form.elements.namedItem('name') as HTMLInputElement).value = t.name;
                      (form.elements.namedItem('code') as HTMLInputElement).value = t.code;
                      (form.elements.namedItem('description') as HTMLInputElement).value = t.desc;
                      (form.elements.namedItem('color') as HTMLInputElement).value = t.color;
                    }}
                    className="px-3 py-1 text-xs bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <form id="addStockForm" onSubmit={handleAddStock} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">股票名称</label>
                <input name="name" required className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800" placeholder="如：工作压力" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">股票代码</label>
                <input name="code" required maxLength={10} className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 uppercase" placeholder="如：WORK" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">描述</label>
                <input name="description" className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800" placeholder="简短描述这个焦虑来源" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">当前SAN值 (0-200)</label>
                <input name="currentValue" type="number" min="0" max="200" defaultValue="100" className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">颜色</label>
                <input name="color" type="color" defaultValue="#ef4444" className="w-full h-10 rounded-xl border border-gray-200 dark:border-slate-700" />
              </div>
              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800">
                  取消
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700">
                  添加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 记录SAN值模态框 */}
      {showRecordModal && selectedStockData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">记录 {selectedStockData.name} 的SAN值</h3>
              <button onClick={() => setShowRecordModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleRecordSan} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">当前SAN值 (0-200)</label>
                <input 
                  name="value" 
                  type="number" 
                  min="0" 
                  max="200" 
                  defaultValue={selectedStockData.currentValue}
                  required
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800" 
                />
                <p className="text-xs text-gray-500 mt-1">0 = 完全不焦虑, 200 = 焦虑到爆炸</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">备注</label>
                <textarea 
                  name="note" 
                  rows={3}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800" 
                  placeholder="今天发生了什么？"
                />
              </div>
              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={() => setShowRecordModal(false)} className="flex-1 px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800">
                  取消
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700">
                  记录
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-8 text-gray-500">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mr-2" />
          加载中...
        </div>
      )}

      {stocks.length === 0 && !isLoading && (
        <div className="text-center py-12 text-gray-500">
          <BrainCircuit size={48} className="mx-auto mb-4 opacity-50" />
          <p>还没有焦虑股票，快添加一个吧！</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 text-blue-600 hover:underline"
          >
            添加第一个焦虑源
          </button>
        </div>
      )}
    </div>
  );
}
