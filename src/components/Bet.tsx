import React, { useState, useMemo } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, Target, Calendar, DollarSign, TrendingDown } from 'lucide-react';
import { format, differenceInDays, addDays, isAfter, isBefore } from 'date-fns';
import { cn } from '../lib/utils';

interface BetItem {
  id: string;
  title: string;
  targetWeight: number;
  currentWeight?: number;
  startWeight?: number;
  startDate: string;
  endDate: string;
  reward: number;
  status: 'active' | 'completed' | 'failed';
  completedAt?: string;
  note?: string;
}

export default function Bet() {
  const [bets, setBets] = useState<BetItem[]>(() => {
    const saved = localStorage.getItem('bet-agreements');
    return saved ? JSON.parse(saved) : [];
  });
  const [showAddModal, setShowAddModal] = useState(false);

  React.useEffect(() => {
    localStorage.setItem('bet-agreements', JSON.stringify(bets));
  }, [bets]);

  const handleAddBet = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const newBet: BetItem = {
      id: crypto.randomUUID(),
      title: formData.get('title') as string,
      targetWeight: Number(formData.get('targetWeight')),
      startWeight: Number(formData.get('startWeight')) || undefined,
      startDate: formData.get('startDate') as string,
      endDate: formData.get('endDate') as string,
      reward: Number(formData.get('reward')),
      status: 'active',
      note: formData.get('note') as string,
    };

    setBets(prev => [newBet, ...prev]);
    setShowAddModal(false);
    form.reset();
  };

  const handleComplete = (id: string, success: boolean) => {
    setBets(prev => prev.map(bet => 
      bet.id === id 
        ? { ...bet, status: success ? 'completed' : 'failed', completedAt: new Date().toISOString() }
        : bet
    ));
  };

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这个对赌协议吗？')) {
      setBets(prev => prev.filter(b => b.id !== id));
    }
  };

  const activeBets = bets.filter(b => b.status === 'active');
  const completedBets = bets.filter(b => b.status === 'completed');
  const failedBets = bets.filter(b => b.status === 'failed');

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Target className="w-8 h-8" />
              对赌协议
            </h2>
            <p className="text-indigo-100 mt-1">
              设定目标，挑战自我，赢得奖金！
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-white text-indigo-600 px-4 py-2 rounded-xl font-medium hover:bg-indigo-50 transition-colors"
          >
            <Plus size={20} />
            新建协议
          </button>
        </div>
        <div className="flex gap-6 mt-6">
          <div className="text-center">
            <p className="text-3xl font-bold">{activeBets.length}</p>
            <p className="text-sm text-indigo-200">进行中</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold">{completedBets.length}</p>
            <p className="text-sm text-indigo-200">已完成</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold">
              ¥{activeBets.reduce((sum, b) => sum + b.reward, 0).toLocaleString()}
            </p>
            <p className="text-sm text-indigo-200">待赢取奖金</p>
          </div>
        </div>
      </div>

      {/* Active Bets */}
      {activeBets.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 flex items-center gap-2">
            <Circle className="w-5 h-5 text-blue-500" />
            进行中的协议
          </h3>
          <div className="grid gap-4">
            {activeBets.map(bet => (
              <BetCard 
                key={bet.id} 
                bet={bet} 
                onComplete={handleComplete}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed Bets */}
      {completedBets.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            已完成的协议
          </h3>
          <div className="grid gap-4">
            {completedBets.map(bet => (
              <BetCard 
                key={bet.id} 
                bet={bet} 
                onComplete={handleComplete}
                onDelete={handleDelete}
                readonly
              />
            ))}
          </div>
        </div>
      )}

      {/* Failed Bets */}
      {failedBets.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-rose-500" />
            失败的协议
          </h3>
          <div className="grid gap-4">
            {failedBets.map(bet => (
              <BetCard 
                key={bet.id} 
                bet={bet} 
                onComplete={handleComplete}
                onDelete={handleDelete}
                readonly
              />
            ))}
          </div>
        </div>
      )}

      {bets.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Target size={48} className="mx-auto mb-4 opacity-50" />
          <p>还没有对赌协议，快来挑战自己吧！</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 text-indigo-600 hover:underline"
          >
            创建第一个协议
          </button>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">新建对赌协议</h3>
            <form onSubmit={handleAddBet} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">协议名称</label>
                <input
                  name="title"
                  required
                  placeholder="如：一个月减重10斤"
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">起始体重 (kg)</label>
                  <input
                    name="startWeight"
                    type="number"
                    step="0.1"
                    placeholder="如：75"
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">目标体重 (kg)</label>
                  <input
                    name="targetWeight"
                    type="number"
                    step="0.1"
                    required
                    placeholder="如：70"
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">开始日期</label>
                  <input
                    name="startDate"
                    type="date"
                    required
                    defaultValue={format(new Date(), 'yyyy-MM-dd')}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">结束日期</label>
                  <input
                    name="endDate"
                    type="date"
                    required
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">奖金金额 (¥)</label>
                <input
                  name="reward"
                  type="number"
                  required
                  min="0"
                  placeholder="如：1000"
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
                <p className="text-xs text-gray-500 mt-1">达成目标后可获得的奖励（仅作记录）</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">备注</label>
                <textarea
                  name="note"
                  rows={2}
                  placeholder="如：一周内反弹不超过1斤"
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
                >
                  创建协议
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BetCard({ 
  bet, 
  onComplete, 
  onDelete,
  readonly = false 
}: { 
  bet: BetItem; 
  onComplete: (id: string, success: boolean) => void;
  onDelete: (id: string) => void;
  readonly?: boolean;
}) {
  const today = new Date();
  const start = new Date(bet.startDate);
  const end = new Date(bet.endDate);
  const totalDays = differenceInDays(end, start);
  const elapsedDays = differenceInDays(today, start);
  const progress = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
  const isOverdue = isAfter(today, end) && bet.status === 'active';
  
  const weightChange = bet.startWeight && bet.currentWeight 
    ? bet.startWeight - bet.currentWeight 
    : null;

  return (
    <div className={cn(
      "bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border transition-all",
      bet.status === 'completed' ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/30" :
      bet.status === 'failed' ? "border-rose-200 dark:border-rose-800 bg-rose-50/30" :
      isOverdue ? "border-amber-200 dark:border-amber-800" :
      "border-gray-100 dark:border-slate-700"
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{bet.title}</h4>
            {bet.status === 'completed' && (
              <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs rounded-full">
                已达成
              </span>
            )}
            {bet.status === 'failed' && (
              <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-xs rounded-full">
                未达成
              </span>
            )}
            {isOverdue && bet.status === 'active' && (
              <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs rounded-full">
                已过期
              </span>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-600 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              {format(start, 'MM/dd')} - {format(end, 'MM/dd')}
            </span>
            <span className="flex items-center gap-1">
              <DollarSign size={14} />
              ¥{bet.reward.toLocaleString()}
            </span>
            {bet.startWeight && (
              <span className="flex items-center gap-1">
                <TrendingDown size={14} />
                {bet.startWeight}kg → {bet.targetWeight}kg
              </span>
            )}
          </div>

          {bet.note && (
            <p className="text-xs text-gray-500 mt-2">{bet.note}</p>
          )}

          {/* Progress Bar */}
          {bet.status === 'active' && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>进度</span>
                <span>{Math.round(progress)}% ({elapsedDays}/{totalDays}天)</span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all",
                    isOverdue ? "bg-amber-500" : "bg-indigo-500"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                剩余 {Math.max(0, totalDays - elapsedDays)} 天
              </p>
            </div>
          )}
        </div>

        {!readonly && bet.status === 'active' && (
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => onComplete(bet.id, true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm hover:bg-emerald-200 transition-colors"
            >
              <CheckCircle2 size={16} />
              达成
            </button>
            <button
              onClick={() => onComplete(bet.id, false)}
              className="flex items-center gap-1 px-3 py-1.5 bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 rounded-lg text-sm hover:bg-rose-200 transition-colors"
            >
              <TrendingDown size={16} />
              失败
            </button>
          </div>
        )}

        <button
          onClick={() => onDelete(bet.id)}
          className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors ml-2"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}
