import { create } from 'zustand';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../lib/api';
import type {
  Currency,
  Pool,
  Transaction,
  IncomeAllocationPreset,
} from './useStore.types';

export type {
  Currency,
  Pool,
  Allocation,
  IncomePresetRow,
  IncomeAllocationPreset,
  Transaction,
} from './useStore.types';

interface State {
  pools: Pool[];
  transactions: Transaction[];
  incomePresets: IncomeAllocationPreset[];
  baseCurrency: Currency;
  exchangeRates: Record<Currency, number>;
  lastSync: string | null;
  isSyncing: boolean;
  ready: boolean;
  loadError: string | null;
  interceptTotal: number;

  loadState: () => Promise<void>;
  addPool: (pool: Omit<Pool, 'id' | 'balance'>) => Promise<void>;
  updatePool: (id: string, pool: Partial<Pool>) => Promise<void>;
  deletePool: (id: string) => Promise<void>;

  addTransaction: (transaction: Omit<Transaction, 'id'>) => Promise<void>;
  updateTransaction: (id: string, transaction: Omit<Transaction, 'id'>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  addIncomePreset: (preset: Omit<IncomeAllocationPreset, 'id'>) => Promise<void>;
  updateIncomePreset: (
    id: string,
    preset: Partial<Omit<IncomeAllocationPreset, 'id'>>
  ) => Promise<void>;
  deleteIncomePreset: (id: string) => Promise<void>;

  setBaseCurrency: (currency: Currency) => Promise<void>;
  updateExchangeRate: (currency: Currency, rate: number) => Promise<void>;
  sync: () => Promise<void>;
}

type ApiState = {
  pools: Pool[];
  transactions: Transaction[];
  incomePresets: IncomeAllocationPreset[];
  baseCurrency: string;
  exchangeRates: Record<string, number>;
  lastSync: string;
};

function applyServerState(set: (p: Partial<State>) => void, data: ApiState) {
  const interceptTotal = data.transactions
    .filter(t => t.type === 'intercept')
    .reduce((sum, t) => sum + t.amount, 0);
  set({
    pools: data.pools,
    transactions: data.transactions,
    incomePresets: data.incomePresets,
    baseCurrency: data.baseCurrency as Currency,
    exchangeRates: data.exchangeRates as Record<Currency, number>,
    lastSync: data.lastSync,
    ready: true,
    loadError: null,
    interceptTotal,
  });
}

async function refreshState(set: (p: Partial<State>) => void) {
  const data = await apiGet<ApiState>('/state');
  applyServerState(set, data);
}

export const useStore = create<State>((set, get) => ({
  pools: [],
  transactions: [],
  incomePresets: [],
  baseCurrency: 'CNY',
  exchangeRates: {
    CNY: 1,
    USD: 7.2,
    EUR: 7.8,
    JPY: 0.048,
  },
  lastSync: null,
  isSyncing: false,
  ready: false,
  loadError: null,
  interceptTotal: 0,

  loadState: async () => {
    set({ isSyncing: true, loadError: null });
    try {
      await refreshState(set);
    } catch (e) {
      set({
        loadError: e instanceof Error ? e.message : String(e),
        ready: false,
      });
    } finally {
      set({ isSyncing: false });
    }
  },

  addPool: async (pool) => {
    await apiPost('/pools', pool);
    await refreshState(set);
  },

  updatePool: async (id, updatedPool) => {
    await apiPatch(`/pools/${id}`, updatedPool);
    await refreshState(set);
  },

  deletePool: async (id) => {
    await apiDelete(`/pools/${id}`);
    await refreshState(set);
  },

  addIncomePreset: async (preset) => {
    await apiPost('/income-presets', preset);
    await refreshState(set);
  },

  updateIncomePreset: async (id, updated) => {
    await apiPatch(`/income-presets/${id}`, updated);
    await refreshState(set);
  },

  deleteIncomePreset: async (id) => {
    await apiDelete(`/income-presets/${id}`);
    await refreshState(set);
  },

  addTransaction: async (transaction) => {
    await apiPost('/transactions', transaction);
    await refreshState(set);
  },

  updateTransaction: async (id, transaction) => {
    await apiPatch(`/transactions/${id}`, transaction);
    await refreshState(set);
  },

  deleteTransaction: async (id) => {
    await apiDelete(`/transactions/${id}`);
    await refreshState(set);
  },

  setBaseCurrency: async (currency) => {
    await apiPut('/settings', { baseCurrency: currency });
    await refreshState(set);
  },

  updateExchangeRate: async (currency, rate) => {
    const { exchangeRates } = get();
    await apiPut('/settings', {
      exchangeRates: { ...exchangeRates, [currency]: rate },
    });
    await refreshState(set);
  },

  sync: async () => {
    await get().loadState();
  },
}));
