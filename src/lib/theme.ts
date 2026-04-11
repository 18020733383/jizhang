export const THEME_STORAGE_KEY = 'flow-theme';

export type UiTheme = 'light' | 'dark';

export function getStoredTheme(): UiTheme {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* ignore */
  }
  return 'light';
}

export function applyTheme(theme: UiTheme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
