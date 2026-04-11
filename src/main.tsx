import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyTheme, getStoredTheme } from './lib/theme';

applyTheme(getStoredTheme());

try {
  localStorage.removeItem('finance-store');
} catch {
  /* ignore */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
