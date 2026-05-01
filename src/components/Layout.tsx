import React, { useState, useEffect } from 'react';
import { LayoutDashboard, ReceiptText, WalletCards, Settings, Plus, RefreshCw, Monitor, Menu, X, Shield, Target, LogOut, User as UserIcon, ChevronDown, LogIn, CreditCard, Sparkles, Key } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';
import Dashboard from './Dashboard';
import Transactions from './Transactions';
import Pools from './Pools';
import Intercept from './Intercept';
import Bet from './Bet';
import SettingsView from './Settings';
import TransactionModal from './TransactionModal';
import ImmersiveDashboard from './ImmersiveDashboard';
import UserManagement from './UserManagement';
import VirtualCards from './VirtualCards';
import AIGenerate from './AIGenerate';
import ApiTokens from './ApiTokens';

type Tab = 'dashboard' | 'transactions' | 'pools' | 'intercept' | 'bet' | 'cards' | 'ai' | 'settings' | 'users';

interface LayoutProps {
  user: {
    id: string;
    username: string;
    trustLevel: number;
  };
  onLogout: () => void;
  onShowLogin?: () => void;
}

const trustLevelNames: Record<number, string> = {
  1: 'Lv1 访客',
  2: 'Lv2 只读',
  3: 'Lv3 管理员',
};

const trustLevelColors: Record<number, string> = {
  1: 'text-gray-500',
  2: 'text-blue-500',
  3: 'text-amber-500',
};

export default function Layout({ user, onLogout, onShowLogin }: LayoutProps) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { ready, loadError, isSyncing, sync, lastSync } = useStore();

  const retryLoad = () => void useStore.getState().loadState();

  useEffect(() => {
    void useStore.getState().loadState();
  }, []);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-8">
        <div className="max-w-lg text-center space-y-4">
          <p className="text-red-600 dark:text-rose-400 font-medium">无法从服务器加载数据</p>
          <p className="text-sm text-gray-600 dark:text-slate-300">{loadError}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            线上请确认 Pages 已绑定 D1；本地请先执行 <code className="bg-gray-100 dark:bg-slate-800 px-1 rounded">npm run build</code> 再另开终端运行{' '}
            <code className="bg-gray-100 dark:bg-slate-800 px-1 rounded">npx wrangler pages dev dist --port 8788</code>，然后本页用 Vite 开发（会代理 /api 到 8788）。
          </p>
          <button
            type="button"
            onClick={retryLoad}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
        <div className="flex items-center space-x-2 text-gray-600 dark:text-slate-300">
          <RefreshCw className="animate-spin" size={20} />
          <span>加载中…</span>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'dashboard', name: '数据看板', icon: LayoutDashboard },
    { id: 'transactions', name: '流水记录', icon: ReceiptText },
    { id: 'pools', name: '资金池', icon: WalletCards },
    { id: 'intercept', name: '拦截池', icon: Shield },
    { id: 'bet', name: '对赌协议', icon: Target },
    { id: 'cards', name: '储蓄卡', icon: CreditCard },
    ...(user.trustLevel >= 3 ? [{ id: 'ai' as const, name: 'AI生图', icon: Sparkles }] : []),
    { id: 'settings', name: '设置', icon: Settings },
    ...(user.trustLevel >= 3 ? [{ id: 'users' as const, name: '用户管理', icon: UserIcon }] : []),
    ...(user.trustLevel >= 3 ? [{ id: 'api-tokens' as const, name: 'API Token', icon: Key }] : []),
  ] as const;

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-100 font-sans">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 flex flex-col transform transition-transform duration-300 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
            Flow 记账
          </h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200",
                  activeTab === tab.id 
                    ? "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium" 
                    : "text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100"
                )}
              >
                <Icon size={20} className={activeTab === tab.id ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-slate-500"} />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-100 dark:border-slate-700">
          <button
            onClick={() => sync()}
            disabled={isSyncing}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
          >
            <RefreshCw size={16} className={cn(isSyncing && "animate-spin")} />
            <span>{isSyncing ? '同步中...' : lastSync ? `上次同步: ${new Date(lastSync).toLocaleTimeString()}` : '未同步'}</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-4 lg:px-8 z-10 gap-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <Menu size={24} />
          </button>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-slate-100">
            {tabs.find(t => t.id === activeTab)?.name}
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setImmersiveOpen(true)}
              className="flex items-center space-x-2 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-full font-medium transition-all text-sm"
            >
              <Monitor size={18} />
              <span className="hidden sm:inline">数据大屏</span>
            </button>
            {user.id === 'guest' && (
              <button
                type="button"
                onClick={() => onShowLogin?.()}
                className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-full font-medium transition-all text-sm"
              >
                <LogIn size={18} />
                <span>登录</span>
              </button>
            )}
            {user.trustLevel >= 3 && (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full font-medium transition-all shadow-sm hover:shadow-md active:scale-95"
              >
                <Plus size={18} />
                <span>记一笔</span>
              </button>
            )}
            
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                  <UserIcon size={16} className="text-white" />
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{user.username}</p>
                  <p className={cn("text-xs", trustLevelColors[user.trustLevel])}>{trustLevelNames[user.trustLevel]}</p>
                </div>
                <ChevronDown size={16} className="text-gray-400" />
              </button>
              
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-100 dark:border-slate-700 py-1 z-50">
                  <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{user.username}</p>
                    <p className={cn("text-xs", trustLevelColors[user.trustLevel])}>{trustLevelNames[user.trustLevel]}</p>
                  </div>
                  {user.id !== 'guest' && (
                    <button
                      onClick={() => { onLogout(); setShowUserMenu(false); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700"
                    >
                      <LogOut size={16} />
                      退出登录
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'transactions' && <Transactions userTrustLevel={user.trustLevel} />}
          {activeTab === 'pools' && <Pools userTrustLevel={user.trustLevel} />}
          {activeTab === 'intercept' && <Intercept userTrustLevel={user.trustLevel} />}
          {activeTab === 'bet' && <Bet userTrustLevel={user.trustLevel} />}
          {activeTab === 'cards' && <VirtualCards userTrustLevel={user.trustLevel} />}
          {activeTab === 'ai' && user.trustLevel >= 3 && <AIGenerate userTrustLevel={user.trustLevel} />}
          {activeTab === 'settings' && <SettingsView />}
          {activeTab === 'users' && user.trustLevel >= 3 && <UserManagement />}
          {activeTab === 'api-tokens' && user.trustLevel >= 3 && <ApiTokens userTrustLevel={user.trustLevel} />}
        </main>
      </div>

      {isModalOpen && (
        <TransactionModal onClose={() => setIsModalOpen(false)} />
      )}

      {immersiveOpen && (
        <ImmersiveDashboard onClose={() => setImmersiveOpen(false)} userTrustLevel={user.trustLevel} />
      )}
    </div>
  );
}
