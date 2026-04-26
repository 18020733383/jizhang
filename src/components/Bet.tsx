import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, Target, Calendar, DollarSign, Loader2, Star, Flame, Lock, FileText } from 'lucide-react';
import { format, differenceInDays, addDays, parseISO, isValid } from 'date-fns';
import { cn } from '../lib/utils';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';

interface BetItem {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  reward: number;
  status: 'active' | 'completed' | 'failed';
  completedAt: string | null;
  note: string;
  createdAt: string;
  targetAmount: number;
  currentAmount: number;
  isStarred: boolean;
  sortOrder: number;
}

interface BetProps {
  userTrustLevel?: number;
}

function safeParseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    const date = parseISO(dateStr);
    return isValid(date) ? date : null;
  } catch {
    return null;
  }
}

export default function Bet({ userTrustLevel = 1 }: BetProps) {
  const [bets, setBets] = useState<BetItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [duration, setDuration] = useState(30);
  const [showPrivacySettings, setShowPrivacySettings] = useState(false);
  const [privacyLevels, setPrivacyLevels] = useState<Record<string, number>>({});

  useEffect(() => {
    loadBets();
  }, []);

  const loadPrivacyLevels = async () => {
    try {
      const data = await apiGet<{ levels: Record<string, Record<string, number>> }>('/auth/privacy', true);
      setPrivacyLevels(data.levels?.bets || {});
    } catch (e) {
      console.error('Failed to load privacy levels:', e);
    }
  };

  useEffect(() => {
    loadPrivacyLevels();
  }, [userTrustLevel]);

  const [detailBet, setDetailBet] = useState<BetItem | null>(null);

  const getBetPrivacyLevel = (betId: string): number => {
    return privacyLevels[betId] ?? 1;
  };

  const isBetBlurred = (betId: string): boolean => {
    if (userTrustLevel >= 3) return false;
    return userTrustLevel < getBetPrivacyLevel(betId);
  };

  const setBetPrivacyLevel = async (betId: string, level: number) => {
    if (userTrustLevel < 3) return;
    try {
      await apiPost('/auth/privacy', { itemType: 'bets', itemId: betId, privacyLevel: level });
      setPrivacyLevels(prev => ({ ...prev, [betId]: level }));
    } catch (e) {
      console.error('Failed to set privacy level:', e);
    }
  };

  const loadBets = async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<{ 
        bets: Array<{
          id: string;
          title: string;
          start_date: string;
          end_date: string;
          reward: number;
          status: 'active' | 'completed' | 'failed';
          completed_at: string | null;
          note: string;
          created_at: string;
          target_amount: number;
          current_amount: number;
          is_starred: number;
          sort_order: number;
        }> 
      }>('/bets');
      const formattedBets: BetItem[] = (data.bets || []).map(b => ({
        id: b.id,
        title: b.title,
        startDate: b.start_date,
        endDate: b.end_date,
        reward: b.reward,
        status: b.status,
        completedAt: b.completed_at,
        note: b.note,
        createdAt: b.created_at,
        targetAmount: b.target_amount ?? 0,
        currentAmount: b.current_amount ?? 0,
        isStarred: Boolean(b.is_starred),
        sortOrder: b.sort_order ?? 0,
      }));
      setBets(formattedBets);
    } catch (e) {
      console.error('Failed to load bets:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddBet = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const startDate = formData.get('startDate') as string;
    const days = Number(formData.get('duration') || 30);
    const endDate = format(addDays(parseISO(startDate), days), 'yyyy-MM-dd');
    
    try {
      await apiPost('/bets', {
        title: formData.get('title'),
        startDate,
        endDate,
        reward: Number(formData.get('reward')),
        note: formData.get('note'),
        targetAmount: Number(formData.get('targetAmount') || 0),
      });
      await loadBets();
      setShowAddModal(false);
      form.reset();
      setDuration(30);
    } catch (e) {
      alert(e instanceof Error ? e.message : '创建失败');
    }
  };

  const handleComplete = async (id: string, success: boolean) => {
    try {
      await apiPatch(`/bets/${id}`, {
        status: success ? 'completed' : 'failed',
        completedAt: new Date().toISOString(),
      });
      await loadBets();
    } catch (e) {
      alert(e instanceof Error ? e.message : '更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个对赌协议吗？')) return;
    try {
      await apiDelete(`/bets/${id}`);
      await loadBets();
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleUpdateCurrentAmount = async (id: string, currentAmount: number) => {
    try {
      await apiPatch(`/bets/${id}`, { currentAmount });
      await loadBets();
    } catch (e) {
      alert(e instanceof Error ? e.message : '更新失败');
    }
  };

  const handleToggleStar = async (id: string, isStarred: boolean) => {
    try {
      await apiPatch(`/bets/${id}`, { isStarred });
      await loadBets();
    } catch (e) {
      alert(e instanceof Error ? e.message : '更新失败');
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
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Target className="w-8 h-8" />
              对赌协议
            </h2>
            {userTrustLevel >= 3 && (
              <button
                onClick={() => setShowPrivacySettings(!showPrivacySettings)}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  showPrivacySettings 
                    ? "bg-amber-400 text-amber-900" 
                    : "bg-white/20 text-white hover:bg-white/30"
                )}
                title="隐私设置"
              >
                <Lock size={18} />
              </button>
            )}
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

      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-500" />
          <p className="text-gray-500 mt-2">加载中...</p>
        </div>
      ) : (
        <>
          {/* Active Bets */}
          {activeBets.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 flex items-center gap-2">
                <Circle className="w-5 h-5 text-blue-500" />
                进行中的协议
              </h3>
              <div className="grid gap-4">
                {activeBets.map((bet) => (
                  <BetCard 
                    key={bet.id} 
                    bet={bet} 
                    onComplete={handleComplete}
                    onDelete={handleDelete}
                    onUpdateCurrentAmount={handleUpdateCurrentAmount}
                    onToggleStar={handleToggleStar}
                    showPrivacySettings={showPrivacySettings}
                    privacyLevel={getBetPrivacyLevel(bet.id)}
                    onPrivacyChange={(level) => setBetPrivacyLevel(bet.id, level)}
                    onDetail={setDetailBet}
                    readonly={userTrustLevel < 3}
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
                    onToggleStar={handleToggleStar}
                    onDetail={setDetailBet}
                    showPrivacySettings={showPrivacySettings}
                    privacyLevel={getBetPrivacyLevel(bet.id)}
                    onPrivacyChange={(level) => setBetPrivacyLevel(bet.id, level)}
                    readonly={true}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Failed Bets */}
          {failedBets.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 flex items-center gap-2">
                <Circle className="w-5 h-5 text-rose-500" />
                失败的协议
              </h3>
              <div className="grid gap-4">
                {failedBets.map(bet => (
                  <BetCard
                    key={bet.id}
                    bet={bet}
                    onComplete={handleComplete}
                    onDelete={handleDelete}
                    onToggleStar={handleToggleStar}
                    onDetail={setDetailBet}
                    showPrivacySettings={showPrivacySettings}
                    privacyLevel={getBetPrivacyLevel(bet.id)}
                    onPrivacyChange={(level) => setBetPrivacyLevel(bet.id, level)}
                    readonly={true}
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
        </>
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
                  placeholder="如：每天跑步5公里"
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
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
                  <label className="block text-sm font-medium mb-1">持续天数</label>
                  <input
                    name="duration"
                    type="number"
                    min="1"
                    max="365"
                    required
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>
              
              <div className="text-sm text-gray-500 bg-gray-50 dark:bg-slate-800 p-3 rounded-lg">
                结束日期：{format(addDays(new Date(), duration), 'yyyy年MM月dd日')}
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
                <label className="block text-sm font-medium mb-1">目标金额 (¥)</label>
                <input
                  name="targetAmount"
                  type="number"
                  min="0"
                  placeholder="如：50000（用于进度追踪，可不填）"
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
                <p className="text-xs text-gray-500 mt-1">设置目标金额用于进度追踪（可选）</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">备注</label>
                <textarea
                  name="note"
                  rows={2}
                  placeholder="如：需要每天打卡记录"
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

      {/* Contract Detail Modal */}
      {detailBet && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetailBet(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Contract header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-700 rounded-t-2xl p-6 text-white text-center relative">
              <div className="absolute top-3 left-4 text-xs opacity-40 font-mono">No. {detailBet.id.slice(0, 8).toUpperCase()}</div>
              <div className="absolute top-3 right-4 text-xs opacity-40 font-mono">{new Date(detailBet.createdAt).getFullYear()}</div>
              <h2 className="text-xl font-bold tracking-wider mt-2">对 赌 协 议 书</h2>
              <p className="text-xs opacity-60 mt-1">BET AGREEMENT</p>
            </div>

            {/* Contract body */}
            <div className="p-6 space-y-5 text-sm text-gray-800 dark:text-slate-200">
              {/* Decorative top line */}
              <div className="border-t-2 border-indigo-200 dark:border-indigo-800 pt-4">
                <p className="text-gray-500 dark:text-slate-400 text-xs mb-4">根据双方自愿协商，就以下事项达成对赌协议：</p>
              </div>

              <div className="space-y-3">
                <div className="flex">
                  <span className="text-gray-400 dark:text-slate-500 w-20 shrink-0">协议标题</span>
                  <span className="font-semibold text-base">{detailBet.title}</span>
                </div>

                <div className="flex">
                  <span className="text-gray-400 dark:text-slate-500 w-20 shrink-0">协议期限</span>
                  <span>
                    {format(new Date(detailBet.startDate), 'yyyy年MM月dd日')} — {format(new Date(detailBet.endDate), 'yyyy年MM月dd日')}
                    <span className="text-gray-400 ml-2">（共{differenceInDays(new Date(detailBet.endDate), new Date(detailBet.startDate))}天）</span>
                  </span>
                </div>

                <div className="flex">
                  <span className="text-gray-400 dark:text-slate-500 w-20 shrink-0">奖励金额</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 text-lg">¥{detailBet.reward.toLocaleString()}</span>
                </div>

                {detailBet.targetAmount > 0 && (
                  <div className="flex">
                    <span className="text-gray-400 dark:text-slate-500 w-20 shrink-0">目标金额</span>
                    <span className="font-semibold">¥{detailBet.targetAmount.toLocaleString()}</span>
                  </div>
                )}

                {detailBet.currentAmount > 0 && (
                  <div className="flex">
                    <span className="text-gray-400 dark:text-slate-500 w-20 shrink-0">当前进展</span>
                    <span className="font-semibold">¥{detailBet.currentAmount.toLocaleString()}</span>
                    {detailBet.targetAmount > 0 && (
                      <span className="text-gray-400 ml-2">
                        ({Math.round((detailBet.currentAmount / detailBet.targetAmount) * 100)}%)
                      </span>
                    )}
                  </div>
                )}

                {detailBet.note && (
                  <div className="flex">
                    <span className="text-gray-400 dark:text-slate-500 w-20 shrink-0">备注</span>
                    <span className="text-gray-600 dark:text-slate-300">{detailBet.note}</span>
                  </div>
                )}
              </div>

              {/* Status seal */}
              <div className="flex items-center justify-center py-4">
                <div className={cn(
                  "w-28 h-28 rounded-full border-4 flex flex-col items-center justify-center rotate-12",
                  detailBet.status === 'completed'
                    ? "border-emerald-400 text-emerald-600 dark:text-emerald-400"
                    : detailBet.status === 'failed'
                    ? "border-rose-400 text-rose-600 dark:text-rose-400"
                    : "border-indigo-400 text-indigo-600 dark:text-indigo-400"
                )}>
                  <span className="text-2xl font-bold">
                    {detailBet.status === 'completed' ? '✓' : detailBet.status === 'failed' ? '✗' : '…'}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider">
                    {detailBet.status === 'completed' ? '已达成' : detailBet.status === 'failed' ? '未达成' : '进行中'}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              {detailBet.status === 'active' && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>时间进度</span>
                    <span>{Math.min(Math.max(0, differenceInDays(new Date(), new Date(detailBet.startDate)) / Math.max(1, differenceInDays(new Date(detailBet.endDate), new Date(detailBet.startDate))) * 100), 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, Math.max(0, differenceInDays(new Date(), new Date(detailBet.startDate)) / Math.max(1, differenceInDays(new Date(detailBet.endDate), new Date(detailBet.startDate))) * 100))}%` }} />
                  </div>
                </div>
              )}

              {/* Signatures */}
              <div className="border-t border-dashed border-gray-200 dark:border-slate-600 pt-4 mt-4">
                <div className="grid grid-cols-2 gap-8 text-xs text-gray-400 dark:text-slate-500">
                  <div>
                    <div className="mb-1">协议签订日期</div>
                    <div className="font-mono">{format(new Date(detailBet.createdAt), 'yyyy-MM-dd')}</div>
                  </div>
                  <div className="text-right">
                    <div className="mb-1">协议编号</div>
                    <div className="font-mono">{detailBet.id.slice(0, 12).toUpperCase()}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-slate-700">
              <button
                onClick={() => setDetailBet(null)}
                className="w-full px-4 py-2.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-xl transition-colors font-medium"
              >
                关闭
              </button>
            </div>
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
  onUpdateCurrentAmount,
  onToggleStar,
  onDetail,
  showPrivacySettings = false,
  privacyLevel = 1,
  onPrivacyChange,
  readonly = false 
}: { 
  bet: BetItem; 
  onComplete: (id: string, success: boolean) => void;
  onDelete: (id: string) => void;
  onUpdateCurrentAmount?: (id: string, currentAmount: number) => void;
  onToggleStar?: (id: string, isStarred: boolean) => void;
  onDetail?: (bet: BetItem) => void;
  showPrivacySettings?: boolean;
  privacyLevel?: number;
  onPrivacyChange?: (level: number) => void;
  readonly?: boolean;
}) {
  const isBlurred = privacyLevel > 1;
  const [amountInput, setAmountInput] = useState('');
  const today = new Date();
  const start = safeParseDate(bet.startDate);
  const end = safeParseDate(bet.endDate);
  
  // 如果日期无效，显示占位符
  if (!start || !end) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{bet.title}</h4>
          <button
            onClick={() => onDelete(bet.id)}
            className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
          >
            <Trash2 size={18} />
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-2">日期数据无效</p>
      </div>
    );
  }
  
  const totalDays = Math.max(1, differenceInDays(end, start));
  const elapsedDays = differenceInDays(today, start);
  const progress = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
  const isOverdue = today > end && bet.status === 'active';
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  
  const progressTarget = bet.targetAmount > 0 ? bet.targetAmount : bet.reward;
  const amountProgress = progressTarget > 0 
    ? Math.min(100, Math.max(0, (bet.currentAmount / progressTarget) * 100)) 
    : 0;

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
            <h4 className={cn(
              "text-lg font-semibold",
              isBlurred ? "blur-sm" : "text-gray-900 dark:text-slate-100"
            )}>
              {isBlurred ? '对赌协议 #' + bet.id.slice(0, 6) : bet.title}
            </h4>
            {onDetail && (
              <button
                onClick={() => onDetail(bet)}
                className="p-1 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                title="查看合同"
              >
                <FileText size={16} />
              </button>
            )}
            {showPrivacySettings && onPrivacyChange && (
              <select
                value={privacyLevel}
                onChange={(e) => onPrivacyChange(Number(e.target.value))}
                className={cn(
                  "px-2 py-0.5 rounded-lg text-xs font-medium border-0 cursor-pointer",
                  privacyLevel === 3 
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                    : privacyLevel === 2
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                )}
              >
                <option value={1}>Lv1</option>
                <option value={2}>Lv2</option>
                <option value={3}>Lv3</option>
              </select>
            )}
            {!readonly && bet.status === 'active' && !isBlurred && (
              <button
                onClick={() => onToggleStar?.(bet.id, !bet.isStarred)}
                className={cn(
                  "p-1 rounded-full transition-colors",
                  bet.isStarred 
                    ? "text-amber-500 bg-amber-50 dark:bg-amber-900/30" 
                    : "text-gray-300 hover:text-amber-400"
                )}
              >
                <Star size={16} fill={bet.isStarred ? "currentColor" : "none"} />
              </button>
            )}
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
          
          <div className={cn("flex flex-wrap items-center gap-4 mt-2 text-sm", isBlurred ? "blur-sm" : "text-gray-600 dark:text-slate-400")}>
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              {isBlurred ? '**/** - **/**' : `${format(start, 'MM/dd')} - ${format(end, 'MM/dd')}`}
            </span>
            <span className="flex items-center gap-1">
              <DollarSign size={14} />
              {isBlurred ? '¥••••' : `¥${bet.reward.toLocaleString()}`}
            </span>
            <span className="text-gray-400">
              {isBlurred ? '**天' : `共 ${totalDays} 天`}
            </span>
          </div>

          {bet.note && (
            <p className="text-xs text-gray-500 mt-2">{bet.note}</p>
          )}

          {/* 时间进度条 */}
          {bet.status === 'active' && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>时间进度</span>
                <span>{Math.round(progress)}% ({Math.min(elapsedDays, totalDays)}/{totalDays}天)</span>
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
                剩余 {remainingDays} 天
              </p>
            </div>
          )}

          {/* 金额进度条 */}
          {bet.status === 'active' && (bet.targetAmount > 0 || bet.reward > 0) && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span className="flex items-center gap-1">
                  <Flame size={12} className={cn(amountProgress >= 100 && "text-orange-500")} />
                  {bet.targetAmount > 0 ? '目标进度' : '奖金进度'}
                </span>
                <span className="font-medium">
                  ¥{bet.currentAmount.toLocaleString()} / 
                  ¥{progressTarget.toLocaleString()} 
                  ({Math.round(amountProgress)}%)
                </span>
              </div>
              <div className="h-2.5 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all relative",
                    amountProgress >= 100 ? "bg-emerald-500" : "bg-indigo-500"
                  )}
                  style={{ width: `${Math.min(amountProgress, 100)}%` }}
                />
              </div>
              {!readonly && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  placeholder="输入当前金额"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
                <button
                  onClick={() => {
                    const val = parseFloat(amountInput);
                    if (!isNaN(val) && val >= 0 && onUpdateCurrentAmount) {
                      onUpdateCurrentAmount(bet.id, val);
                      setAmountInput('');
                    }
                  }}
                  className="px-3 py-1.5 text-sm bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-200 transition-colors"
                >
                  更新
                </button>
              </div>
            )}
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
              <Circle size={16} />
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
