import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Currency = 'CNY' | 'USD' | 'EUR' | 'JPY';

export interface Pool {
  id: string;
  name: string;
  balance: number;
  budget: number;
  color: string;
}

export interface Allocation {
  poolId: string;
  amount: number;
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number; // In base currency
  originalAmount: number;
  currency: Currency;
  date: string;
  note: string;
  // For expense
  poolId?: string;
  // For income
  allocations?: Allocation[];
  // For transfer
  fromPoolId?: string;
  toPoolId?: string;
}

interface State {
  pools: Pool[];
  transactions: Transaction[];
  baseCurrency: Currency;
  exchangeRates: Record<Currency, number>;
  lastSync: string | null;
  isSyncing: boolean;
  
  addPool: (pool: Omit<Pool, 'id' | 'balance'>) => void;
  updatePool: (id: string, pool: Partial<Pool>) => void;
  deletePool: (id: string) => void;
  
  addTransaction: (transaction: Omit<Transaction, 'id'>) => void;
  deleteTransaction: (id: string) => void;
  
  setBaseCurrency: (currency: Currency) => void;
  updateExchangeRate: (currency: Currency, rate: number) => void;
  sync: () => Promise<void>;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      pools: [
        { id: '1', name: '日常开销', balance: 0, budget: 3000, color: '#3b82f6' },
        { id: '2', name: '储蓄', balance: 0, budget: 0, color: '#10b981' },
        { id: '3', name: '娱乐', balance: 0, budget: 1000, color: '#f59e0b' },
      ],
      transactions: [],
      baseCurrency: 'CNY',
      exchangeRates: {
        CNY: 1,
        USD: 7.2,
        EUR: 7.8,
        JPY: 0.048,
      },
      lastSync: null,
      isSyncing: false,

      addPool: (pool) => set((state) => ({
        pools: [...state.pools, { ...pool, id: generateId(), balance: 0 }]
      })),

      updatePool: (id, updatedPool) => set((state) => ({
        pools: state.pools.map(p => p.id === id ? { ...p, ...updatedPool } : p)
      })),

      deletePool: (id) => set((state) => ({
        pools: state.pools.filter(p => p.id !== id)
      })),

      addTransaction: (transaction) => set((state) => {
        const newTx = { ...transaction, id: generateId() };
        let newPools = [...state.pools];

        if (newTx.type === 'expense' && newTx.poolId) {
          newPools = newPools.map(p => 
            p.id === newTx.poolId ? { ...p, balance: p.balance - newTx.amount } : p
          );
        } else if (newTx.type === 'income' && newTx.allocations) {
          newTx.allocations.forEach(alloc => {
            newPools = newPools.map(p => 
              p.id === alloc.poolId ? { ...p, balance: p.balance + alloc.amount } : p
            );
          });
        } else if (newTx.type === 'transfer' && newTx.fromPoolId && newTx.toPoolId) {
          newPools = newPools.map(p => {
            if (p.id === newTx.fromPoolId) return { ...p, balance: p.balance - newTx.amount };
            if (p.id === newTx.toPoolId) return { ...p, balance: p.balance + newTx.amount };
            return p;
          });
        }

        return {
          transactions: [newTx, ...state.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
          pools: newPools
        };
      }),

      deleteTransaction: (id) => set((state) => {
        const tx = state.transactions.find(t => t.id === id);
        if (!tx) return state;

        let newPools = [...state.pools];
        if (tx.type === 'expense' && tx.poolId) {
          newPools = newPools.map(p => 
            p.id === tx.poolId ? { ...p, balance: p.balance + tx.amount } : p
          );
        } else if (tx.type === 'income' && tx.allocations) {
          tx.allocations.forEach(alloc => {
            newPools = newPools.map(p => 
              p.id === alloc.poolId ? { ...p, balance: p.balance - alloc.amount } : p
            );
          });
        } else if (tx.type === 'transfer' && tx.fromPoolId && tx.toPoolId) {
          newPools = newPools.map(p => {
            if (p.id === tx.fromPoolId) return { ...p, balance: p.balance + tx.amount };
            if (p.id === tx.toPoolId) return { ...p, balance: p.balance - tx.amount };
            return p;
          });
        }

        return {
          transactions: state.transactions.filter(t => t.id !== id),
          pools: newPools
        };
      }),

      setBaseCurrency: (currency) => set({ baseCurrency: currency }),
      
      updateExchangeRate: (currency, rate) => set((state) => ({
        exchangeRates: { ...state.exchangeRates, [currency]: rate }
      })),

      sync: async () => {
        set({ isSyncing: true });
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        set({ isSyncing: false, lastSync: new Date().toISOString() });
      }
    }),
    {
      name: 'finance-store',
    }
  )
);
