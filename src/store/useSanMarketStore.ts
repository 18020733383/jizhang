import { create } from 'zustand';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';
import type { SanStock, SanHistory } from './useStore.types';

interface SanMarketState {
  stocks: SanStock[];
  histories: Record<string, SanHistory[]>;
  isLoading: boolean;
  error: string | null;

  loadStocks: () => Promise<void>;
  loadHistory: (stockId: string) => Promise<void>;
  addStock: (stock: Omit<SanStock, 'id' | 'sortOrder'>) => Promise<void>;
  updateStock: (id: string, stock: Partial<Omit<SanStock, 'id'>>) => Promise<void>;
  deleteStock: (id: string) => Promise<void>;
  addHistory: (history: Omit<SanHistory, 'id' | 'recordedAt'>) => Promise<void>;
  getStockChange: (stock: SanStock) => { change: number; percent: number; isUp: boolean };
}

export const useSanMarketStore = create<SanMarketState>((set, get) => ({
  stocks: [],
  histories: {},
  isLoading: false,
  error: null,

  loadStocks: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiGet<{ stocks: Array<{
        id: string;
        name: string;
        code: string;
        description: string;
        base_value: number;
        current_value: number;
        color: string;
        sort_order: number;
      }> }>('/san-stocks');
      // 转换snake_case到camelCase
      const stocks: SanStock[] = data.stocks.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        description: s.description,
        baseValue: s.base_value,
        currentValue: s.current_value,
        color: s.color,
        sortOrder: s.sort_order,
      }));
      set({ stocks, isLoading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), isLoading: false });
    }
  },

  loadHistory: async (stockId: string) => {
    try {
      const data = await apiGet<{ history: Array<{
        id: string;
        stock_id: string;
        value: number;
        note: string;
        recorded_at: string;
      }> }>(`/san-stocks/${stockId}/history`);
      // 转换snake_case到camelCase
      const history: SanHistory[] = data.history.map(h => ({
        id: h.id,
        stockId: h.stock_id,
        value: h.value,
        note: h.note,
        recordedAt: h.recorded_at,
      }));
      const histories = { ...get().histories, [stockId]: history };
      set({ histories });
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  },

  addStock: async (stock) => {
    await apiPost('/san-stocks', stock);
    await get().loadStocks();
  },

  updateStock: async (id, updated) => {
    await apiPatch(`/san-stocks/${id}`, updated);
    await get().loadStocks();
  },

  deleteStock: async (id) => {
    await apiDelete(`/san-stocks/${id}`);
    await get().loadStocks();
  },

  addHistory: async (history) => {
    await apiPost('/san-history', history);
    await get().loadStocks();
    await get().loadHistory(history.stockId);
  },

  getStockChange: (stock: SanStock) => {
    const change = stock.currentValue - stock.baseValue;
    const percent = stock.baseValue > 0 ? (change / stock.baseValue) * 100 : 0;
    // SAN值下跌是好事（焦虑减少），上涨是坏事（焦虑增加）
    // 但在股市术语中，绿色上涨是好的，红色下跌是坏的
    // 这里我们反转一下：SAN值下降显示为绿色（好事），上升显示为红色（坏事）
    const isUp = change < 0; 
    return { change: Math.abs(change), percent: Math.abs(percent), isUp };
  },
}));
