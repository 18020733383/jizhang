import { create } from 'zustand';
import { applyTheme, getStoredTheme, type UiTheme } from '../lib/theme';

export type { UiTheme } from '../lib/theme';

export const useThemeStore = create<{
  theme: UiTheme;
  setTheme: (t: UiTheme) => void;
}>((set) => ({
  theme: getStoredTheme(),
  setTheme: (t) => {
    applyTheme(t);
    set({ theme: t });
  },
}));
