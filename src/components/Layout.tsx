import React, { useState } from 'react';
import { LayoutDashboard, ReceiptText, WalletCards, Settings, Plus, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';
import Dashboard from './Dashboard';
import Transactions from './Transactions';
import Pools from './Pools';
import SettingsView from './Settings';
import TransactionModal from './TransactionModal';

type Tab = 'dashboard' | 'transactions' | 'pools' | 'settings';

export default function Layout() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { isSyncing, sync, lastSync } = useStore();

  const tabs = [
    { id: 'dashboard', name: '数据看板', icon: LayoutDashboard },
    { id: 'transactions', name: '流水记录', icon: ReceiptText },
    { id: 'pools', name: '资金池', icon: WalletCards },
    { id: 'settings', name: '设置', icon: Settings },
  ] as const;

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Flow 记账
          </h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200",
                  activeTab === tab.id 
                    ? "bg-blue-50 text-blue-700 font-medium" 
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <Icon size={20} className={activeTab === tab.id ? "text-blue-600" : "text-gray-400"} />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button
            onClick={() => sync()}
            disabled={isSyncing}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <RefreshCw size={16} className={cn(isSyncing && "animate-spin")} />
            <span>{isSyncing ? '同步中...' : lastSync ? `上次同步: ${new Date(lastSync).toLocaleTimeString()}` : '未同步'}</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-gray-200 flex items-center justify-between px-8 z-10">
          <h2 className="text-xl font-semibold text-gray-800">
            {tabs.find(t => t.id === activeTab)?.name}
          </h2>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full font-medium transition-all shadow-sm hover:shadow-md active:scale-95"
          >
            <Plus size={18} />
            <span>记一笔</span>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'transactions' && <Transactions />}
          {activeTab === 'pools' && <Pools />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {isModalOpen && (
        <TransactionModal onClose={() => setIsModalOpen(false)} />
      )}
    </div>
  );
}
