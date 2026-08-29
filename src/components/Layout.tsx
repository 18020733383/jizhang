import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion, usePresence, useReducedMotion } from 'motion/react';
import { CalendarDays, LayoutDashboard, ReceiptText, WalletCards, Settings, Plus, RefreshCw, Monitor, Menu, X, Shield, Target, LogOut, User as UserIcon, ChevronDown, LogIn, Key, Building2, PanelLeftClose, PanelLeftOpen, Images } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';
import Dashboard from './Dashboard';
import MonthlyReport from './MonthlyReport';
import Transactions from './Transactions';
import Pools from './Pools';
import Intercept from './Intercept';
import Bet from './Bet';
import SettingsView from './Settings';
import TransactionModal from './TransactionModal';
import ImmersiveDashboard from './ImmersiveDashboard';
import UserManagement from './UserManagement';
import ApiTokens from './ApiTokens';
import PoolCity from './PoolCity';
import PhotoCards from './PhotoCards';

type Tab = 'dashboard' | 'monthly-report' | 'transactions' | 'pools' | 'intercept' | 'bet' | 'photo-cards' | 'ai' | 'settings' | 'users' | 'city' | 'api-tokens';

type PageMotion = {
  enter: { x: number; y: number };
  exit: { x: number; y: number };
};

const PAGE_MOTION_DIRECTIONS = [
  { x: 64, y: 0 },
  { x: -64, y: 0 },
  { x: 0, y: 54 },
  { x: 0, y: -54 },
] as const;

function getPageMotion(targetIndex: number): PageMotion {
  const enter = PAGE_MOTION_DIRECTIONS[Math.max(targetIndex, 0) % PAGE_MOTION_DIRECTIONS.length];
  return {
    enter,
    exit: { x: -enter.x, y: -enter.y },
  };
}

function AnimatedTabPanel({
  children,
  pageMotion,
  prefersReducedMotion,
}: {
  children: React.ReactNode;
  pageMotion: PageMotion;
  prefersReducedMotion: boolean;
}) {
  const [isPresent, safeToRemove] = usePresence();
  const phase = isPresent ? 'entering' : 'exiting';

  useEffect(() => {
    if (isPresent) return;
    const timer = window.setTimeout(() => safeToRemove?.(), prefersReducedMotion ? 20 : 520);
    return () => window.clearTimeout(timer);
  }, [isPresent, prefersReducedMotion, safeToRemove]);

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: pageMotion.enter.x, y: pageMotion.enter.y, scale: 0.985 }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: pageMotion.exit.x, y: pageMotion.exit.y, scale: 0.985 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.32, ease: [0.2, 0.8, 0.2, 1] }}
      data-phase={phase}
      data-reduced-motion={prefersReducedMotion ? 'true' : 'false'}
      className="tab-content-choreo h-full overflow-y-auto p-4 lg:p-8"
    >
      {children}
    </motion.div>
  );
}

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
  const [pageMotion, setPageMotion] = useState<PageMotion>(() => getPageMotion(0));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const prefersReducedMotion = useReducedMotion();
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
    { id: 'monthly-report', name: '每月财报', icon: CalendarDays },
    { id: 'transactions', name: '流水记录', icon: ReceiptText },
    { id: 'pools', name: '资金池', icon: WalletCards },
    { id: 'intercept', name: '拦截池', icon: Shield },
    { id: 'bet', name: '对赌协议', icon: Target },
    ...(user.trustLevel >= 3 ? [{ id: 'photo-cards' as const, name: '生活卡片', icon: Images }] : []),
    { id: 'city', name: '城市视图', icon: Building2 },
    { id: 'settings', name: '设置', icon: Settings },
    ...(user.trustLevel >= 3 ? [{ id: 'users' as const, name: '用户管理', icon: UserIcon }] : []),
    ...(user.trustLevel >= 3 ? [{ id: 'api-tokens' as const, name: 'API Token', icon: Key }] : []),
  ] as const;

  const activeContent = (() => {
    if (activeTab === 'dashboard') return <Dashboard />;
    if (activeTab === 'monthly-report') return <MonthlyReport userTrustLevel={user.trustLevel} />;
    if (activeTab === 'transactions') return <Transactions userTrustLevel={user.trustLevel} />;
    if (activeTab === 'pools') return <Pools userTrustLevel={user.trustLevel} />;
    if (activeTab === 'intercept') return <Intercept userTrustLevel={user.trustLevel} />;
    if (activeTab === 'bet') return <Bet userTrustLevel={user.trustLevel} />;
    if (activeTab === 'photo-cards' && user.trustLevel >= 3) return <PhotoCards />;
    if (activeTab === 'city') return <PoolCity />;
    if (activeTab === 'settings') return <SettingsView />;
    if (activeTab === 'users' && user.trustLevel >= 3) return <UserManagement />;
    if (activeTab === 'api-tokens' && user.trustLevel >= 3) return <ApiTokens userTrustLevel={user.trustLevel} />;
    return <Dashboard />;
  })();

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
          "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 flex flex-col transform transition-[width,transform] duration-300 lg:translate-x-0",
          sidebarCollapsed ? "lg:w-20" : "lg:w-64",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className={cn("p-6 flex items-center justify-between gap-2", sidebarCollapsed && "lg:justify-center lg:px-4")}>
          <h1 className={cn("text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent", sidebarCollapsed && "lg:hidden")}>
            Flow 记账
          </h1>
          <button
            onClick={() => setSidebarCollapsed((value) => !value)}
            className="hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 lg:block"
            title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </div>
        
        <nav className={cn("flex-1 space-y-2", sidebarCollapsed ? "px-4 lg:px-3" : "px-4")}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  const targetIndex = tabs.findIndex((item) => item.id === tab.id);
                  setPageMotion(getPageMotion(targetIndex));
                  setActiveTab(tab.id);
                  setSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200",
                  sidebarCollapsed && "lg:justify-center lg:space-x-0 lg:px-0",
                  activeTab === tab.id 
                    ? "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium" 
                    : "text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100"
                )}
                title={sidebarCollapsed ? tab.name : undefined}
              >
                <Icon size={20} className={activeTab === tab.id ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-slate-500"} />
                <span className={cn(sidebarCollapsed && "lg:hidden")}>{tab.name}</span>
              </button>
            );
          })}
        </nav>

        <div className={cn("p-4 border-t border-gray-100 dark:border-slate-700", sidebarCollapsed && "lg:px-3")}>
          <button
            onClick={() => sync()}
            disabled={isSyncing}
            className={cn("w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors", sidebarCollapsed && "lg:px-0 lg:space-x-0 [&>span]:lg:hidden")}
            title={lastSync ? `上次同步: ${new Date(lastSync).toLocaleTimeString()}` : '同步'}
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

        <main className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <AnimatedTabPanel
              key={activeTab}
              pageMotion={pageMotion}
              prefersReducedMotion={!!prefersReducedMotion}
            >
              {activeContent}
            </AnimatedTabPanel>
          </AnimatePresence>
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
