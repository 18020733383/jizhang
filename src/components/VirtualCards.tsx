import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CreditCard, Loader2, Image, Calendar, Package, Printer, Eye, EyeOff, Ban, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';
import { useStore } from '../store/useStore';

interface VirtualCard {
  id: string;
  card_number: string;
  card_holder: string;
  denomination: number;
  current_amount: number;
  status: 'saving' | 'printed' | 'depleted';
  front_image: string | null;
  back_image: string | null;
  issue_date: string;
  batch_id: string | null;
  printed: number;
  printed_at: string | null;
  depleted_at: string | null;
  created_at: string;
}

interface CardPool {
  id: string;
  name: string;
  balance: number;
  budget: number;
}

interface VirtualCardsProps {
  userTrustLevel?: number;
}

export default function VirtualCards({ userTrustLevel = 1 }: VirtualCardsProps) {
  const [cards, setCards] = useState<VirtualCard[]>([]);
  const [pools, setPools] = useState<CardPool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPoolModal, setShowPoolModal] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'saving' | 'printed' | 'depleted'>('all');
  const [previewCard, setPreviewCard] = useState<VirtualCard | null>(null);
  const [uploading, setUploading] = useState(false);
  const { pools: storePools } = useStore();

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<{ cards: VirtualCard[] }>('/cards');
      setCards(data.cards || []);
    } catch (e) {
      console.error('Failed to load cards:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPools = async () => {
    try {
      const data = await apiGet<{ pools: CardPool[] }>('/state');
      const cardPools = (data.pools || []).filter((p: CardPool) => p.name.startsWith('卡 ') && p.name.includes('蓄水池'));
      setPools(cardPools);
    } catch (e) {
      console.error('Failed to load pools:', e);
    }
  };

  useEffect(() => {
    if (showPoolModal) {
      loadPools();
    }
  }, [showPoolModal]);

  const getCardPool = (card: VirtualCard): CardPool | undefined => {
    const cardLast8 = card.id.slice(-8);
    return pools.find(p => p.name.includes(cardLast8));
  };

  const getCardProgress = (card: VirtualCard): number => {
    return Math.min(100, (card.current_amount / card.denomination) * 100);
  };

  const handleAddCard = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    let backImage = formData.get('backImage') as string;
    
    // 如果有上传的图片文件
    const imageFile = formData.get('imageFile') as File | null;
    if (imageFile && imageFile.size > 0) {
      setUploading(true);
      try {
        const uploadForm = new FormData();
        uploadForm.append('file', imageFile);
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: uploadForm,
        });
        if (!res.ok) throw new Error('图片上传失败');
        const data = await res.json() as { ok: boolean; url: string };
        if (data.ok) {
          backImage = data.url;
        }
      } catch (e) {
        alert(e instanceof Error ? e.message : '图片上传失败');
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    
    try {
      const result = await apiPost<{ ok: boolean; id: string; cardNumber: string; poolId: string }>('/cards', {
        cardHolder: formData.get('cardHolder'),
        denomination: Number(formData.get('denomination')),
        backImage: backImage || '',
      });
      if (result.ok) {
        await loadCards();
        await useStore.getState().loadState();
        setShowAddModal(false);
        form.reset();
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '创建失败');
    }
  };

  const handleUpdateCard = async (id: string, updates: Record<string, unknown>) => {
    try {
      await apiPatch(`/cards/${id}`, updates);
      await loadCards();
    } catch (e) {
      alert(e instanceof Error ? e.message : '更新失败');
    }
  };

  const handlePrintCard = async (id: string) => {
    try {
      await apiPost(`/cards/print/${id}`, { batchId: `batch_${Date.now()}` });
      await loadCards();
    } catch (e) {
      alert(e instanceof Error ? e.message : '打印失败');
    }
  };

  const handleDepleteCard = async (id: string) => {
    if (!confirm('确定要弃用此卡片吗？弃用后卡片将无法使用。')) return;
    try {
      await apiPost(`/cards/deplete/${id}`, {});
      await loadCards();
    } catch (e) {
      alert(e instanceof Error ? e.message : '弃用失败');
    }
  };

  const handleDeleteCard = async (id: string) => {
    if (!confirm('确定要删除此卡片吗？')) return;
    try {
      await apiDelete(`/cards/${id}`);
      await loadCards();
      await useStore.getState().loadState();
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  };

  const filteredCards = cards.filter(card => {
    if (filter === 'all') return true;
    return card.status === filter;
  });

  const statusLabels: Record<string, string> = {
    saving: '蓄力中',
    printed: '已打印',
    depleted: '已弃用',
  };

  const statusColors: Record<string, string> = {
    saving: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    printed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    depleted: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  };

  const denominationLabels: Record<number, string> = {
    1000: '1000元',
    2000: '2000元',
    5000: '5000元',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">虚拟储蓄卡</h2>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Filter size={16} />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="all">全部</option>
              <option value="saving">蓄力中</option>
              <option value="printed">已打印</option>
              <option value="depleted">已弃用</option>
            </select>
          </div>
        </div>
        {userTrustLevel >= 3 && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium transition-all"
          >
            <Plus size={18} />
            开新卡
          </button>
        )}
      </div>

      {filteredCards.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-slate-400">
          <CreditCard size={48} className="mx-auto mb-4 opacity-50" />
          <p>暂无虚拟储蓄卡</p>
          {userTrustLevel >= 3 && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 text-blue-600 dark:text-blue-400 hover:underline"
            >
              开一张新卡
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCards.map(card => (
            <div
              key={card.id}
              className={cn(
                "bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden transition-all hover:shadow-md",
                card.status === 'depleted' && "opacity-60"
              )}
            >
              <div className="relative h-40 bg-gradient-to-br from-purple-600 to-indigo-700 p-4 flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="text-white/80 text-xs font-mono">
                    <div className="text-sm opacity-0">虚拟储蓄卡</div>
                    <div className="text-lg font-bold tracking-wider">{card.card_number}</div>
                  </div>
                  <div className={cn("px-2 py-1 rounded-full text-xs font-medium", statusColors[card.status])}>
                    {statusLabels[card.status]}
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div className="text-white">
                    <div className="text-xs opacity-70">{card.card_holder}</div>
                    <div className="text-2xl font-bold">{denominationLabels[card.denomination]}</div>
                  </div>
                  <div className="text-white/80 text-xs text-right">
                    <div>{format(new Date(card.issue_date), 'yyyy/MM/dd')}</div>
                    <div>虚拟卡</div>
                  </div>
                </div>
                
                {card.status === 'saving' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                    <div
                      className="h-full bg-yellow-400 transition-all"
                      style={{ width: `${getCardProgress(card)}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="p-4 space-y-3">
                {card.status === 'saving' && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-slate-400">已存</span>
                      <span className="font-medium">¥{card.current_amount.toLocaleString()} / ¥{card.denomination.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all"
                        style={{ width: `${getCardProgress(card)}%` }}
                      />
                    </div>
                    <button
                      onClick={() => setShowPoolModal(card.id)}
                      className="w-full text-sm text-purple-600 dark:text-purple-400 hover:underline"
                    >
                      向此卡蓄力
                    </button>
                  </div>
                )}

                {card.back_image && (
                  <div className="text-sm text-gray-500 dark:text-slate-400 flex items-center gap-1">
                    <Image size={14} />
                    背面已自定义
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-slate-700">
                  <button
                    onClick={() => setPreviewCard(card)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <Eye size={16} />
                    预览
                  </button>
                  
                  {card.status === 'saving' && userTrustLevel >= 3 && (
                    <>
                      <button
                        onClick={() => handleUpdateCard(card.id, { backImage: card.back_image ? '' : 'custom' })}
                        className="flex-1 flex items-center justify-center gap-1 py-2 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        <Image size={16} />
                        {card.back_image ? '改图片' : '设图片'}
                      </button>
                      <button
                        onClick={() => handleDeleteCard(card.id)}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}

                  {card.status === 'saving' && card.current_amount >= card.denomination && userTrustLevel >= 3 && (
                    <button
                      onClick={() => handlePrintCard(card.id)}
                      className="flex-1 flex items-center justify-center gap-1 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                      <Printer size={16} />
                      打印
                    </button>
                  )}

                  {card.status === 'printed' && userTrustLevel >= 3 && (
                    <button
                      onClick={() => handleDepleteCard(card.id)}
                      className="flex-1 flex items-center justify-center gap-1 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
                    >
                      <Ban size={16} />
                      弃用
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">开新卡</h3>
            <form onSubmit={handleAddCard} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">持卡人</label>
                <input
                  type="text"
                  name="cardHolder"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-blue-500"
                  placeholder="卡片持有人姓名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">面额</label>
                <select
                  name="denomination"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">选择面额</option>
                  <option value="1000">1000 元</option>
                  <option value="2000">2000 元</option>
                  <option value="5000">5000 元</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">背面图片 (可选, 最大5MB)</label>
                <input
                  type="file"
                  name="imageFile"
                  accept="image/*"
                  className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-semibold file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-300 file:cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-slate-600 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  {uploading ? '上传中...' : '开卡'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPoolModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">向卡片蓄力</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
              充值到此卡对应的蓄水池，存满后即可打印。
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {pools.map(pool => {
                const card = cards.find(c => c.id === showPoolModal);
                const cardLast8 = showPoolModal?.slice(-8);
                const isCardPool = pool.name.includes(cardLast8 || '');
                
                return (
                  <div
                    key={pool.id}
                    className={cn(
                      "p-3 rounded-xl border transition-colors",
                      isCardPool
                        ? "border-purple-300 dark:border-purple-600 bg-purple-50 dark:bg-purple-900/20"
                        : "border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{pool.name}</span>
                      <span className="text-sm text-gray-500">
                        ¥{pool.balance.toLocaleString()} / ¥{pool.budget.toLocaleString()}
                      </span>
                    </div>
                    {isCardPool && (
                      <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                        此池子关联目标卡片
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowPoolModal(null)}
                className="px-4 py-2 bg-gray-100 dark:bg-slate-700 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {previewCard && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPreviewCard(null)}>
          <div className="max-w-lg w-full">
            <div className="relative h-56 rounded-2xl overflow-hidden shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-indigo-700 p-6 flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="text-white">
                    <div className="text-sm opacity-80">虚拟储蓄卡</div>
                    <div className="text-2xl font-bold tracking-wider mt-1">{previewCard.card_number}</div>
                  </div>
                  <div className={cn("px-3 py-1.5 rounded-full text-sm font-medium", statusColors[previewCard.status])}>
                    {statusLabels[previewCard.status]}
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div className="text-white">
                    <div className="text-xs opacity-70">{previewCard.card_holder}</div>
                    <div className="text-3xl font-bold">{denominationLabels[previewCard.denomination]}</div>
                  </div>
                  <div className="text-white/80 text-right">
                    <div className="text-sm">{format(new Date(previewCard.issue_date), 'yyyy/MM/dd')}</div>
                    <div className="text-xs opacity-70">发卡日期</div>
                  </div>
                </div>
              </div>
              
              {previewCard.back_image && (
                <div className="absolute inset-0 opacity-20">
                  <img src={previewCard.back_image} alt="" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
            
            <div className="mt-6 text-center">
              <button
                onClick={() => setPreviewCard(null)}
                className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors"
              >
                点击关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
