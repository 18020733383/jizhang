import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  autoRefresh: boolean;
  refreshInterval: number; // seconds
  setAutoRefresh: (v: boolean) => void;
  setRefreshInterval: (v: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoRefresh: false,
      refreshInterval: 30,
      setAutoRefresh: (v) => set({ autoRefresh: v }),
      setRefreshInterval: (v) => set({ refreshInterval: v }),
    }),
    {
      name: 'jizhang-settings',
    }
  )
);