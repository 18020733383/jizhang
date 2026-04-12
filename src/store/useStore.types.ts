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

export interface IncomePresetRow {
  poolId: string;
  percent: number;
}

export interface IncomeAllocationPreset {
  id: string;
  name: string;
  allocations: IncomePresetRow[];
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer' | 'intercept';
  amount: number;
  originalAmount: number;
  currency: Currency;
  date: string;
  note: string;
  poolId?: string;
  allocations?: Allocation[];
  fromPoolId?: string;
  toPoolId?: string;
}
