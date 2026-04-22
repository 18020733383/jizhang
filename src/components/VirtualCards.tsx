import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, CreditCard, Loader2, Image, Printer, Eye, Ban, Filter, Link2, Unlink } from 'lucide-react';
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
  pool_id: string | null;
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
  is_card_pool?: number;
}

function Card3DPreview({ card, statusLabels, statusColors, denominationLabels }: {
  card: VirtualCard;
  statusLabels: Record<string, string>;
  statusColors: Record<string, string>;
  denominationLabels: Record<number, string>;
}) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className="perspective-[1000px] w-full" style={{ perspective: '1000px' }}>
      <div
        className="relative w-full cursor-pointer transition-transform duration-700"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
        onClick={() => setIsFlipped(!isFlipped)}
      >
        {/* Front */}
        <div className="relative h-56 rounded-2xl overflow-hidden shadow-2xl" style={{ backfaceVisibility: 'hidden' }}>
          {card.front_image ? (
            <>
              <div className="absolute inset-0">
                <img src={card.front_image} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-indigo-600 to-violet-700" />
          )}
          <div className="absolute inset-0 p-6 flex flex-col justify-between relative z-10">
            <div className="flex items-start justify-between">
              <div className="text-white">
                <div className="text-sm opacity-80 font-medium">虚拟储蓄卡</div>
                <div className="text-xl font-bold tracking-[0.15em] mt-1 font-mono">{card.card_number}</div>
              </div>
              <div className={cn("px-3 py-1.5 rounded-full text-sm font-medium", statusColors[card.status])}>
                {statusLabels[card.status]}
              </div>
            </div>
            <div className="flex items-end justify-between">
              <div className="text-white">
                <div className="text-sm opacity-70">{card.card_holder}</div>
                <div className="text-3xl font-bold mt-1">{denominationLabels[card.denomination]}</div>
              </div>
              <div className="text-white/80 text-right">
                <div className="text-sm">{format(new Date(card.issue_date), 'yyyy/MM/dd')}</div>
                <div className="text-xs opacity-70">发卡日期</div>
              </div>
            </div>
          </div>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 h-56 rounded-2xl overflow-hidden shadow-2xl"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          {card.back_image ? (
            <div className="absolute inset-0">
              <img src={card.back_image} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600" />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="text-4xl font-bold mb-2" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                ¥{card.denomination.toLocaleString()}
              </div>
              <div className="text-sm opacity-80">磁条区 · 仅限消费 · 禁止转账</div>
              {card.current_amount < card.denomination && (
                <div className="mt-2 text-xs opacity-70">
                  已蓄力 ¥{card.current_amount.toLocaleString()} / ¥{card.denomination.toLocaleString()}
                </div>
              )}
            </div>
          </div>
          <div className="absolute bottom-3 left-4 right-4 flex justify-between items-end text-white/50 text-xs">
            <span>点击翻转→正面</span>
            <span className="font-mono">{card.card_number}</span>
          </div>
        </div>
      </div>
      <p className="text-center text-white/60 text-xs mt-3">点击卡片翻转预览</p>
    </div>
  );
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
  const [uploadingField, setUploadingField] = useState<'front' | 'back' | null>(null);

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
      const cardPools = (data.pools || []).filter((p: CardPool) => p.is_card_pool);
      setPools(cardPools);
    } catch (e) {
      console.error('Failed to load pools:', e);
    }
  };

  useEffect(() => {
    if (showPoolModal) loadPools();
  }, [showPoolModal]);

  const getCardProgress = (card: VirtualCard): number => {
    return Math.min(100, (card.current_amount / card.denomination) * 100);
  };

  const uploadImage = async (file: File): Promise<string> => {
    setUploading(true);
    try {
      const uploadForm = new FormData();
      uploadForm.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: uploadForm,
      });
      if (!res.ok) throw new Error('图片上传失败');
      const data = await res.json() as { ok: boolean; url: string };
      if (data.ok) return data.url;
      throw new Error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleAddCard = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    let frontImageUrl = '';
    let backImageUrl = formData.get('backImageUrl') as string || '';

    const frontFile = formData.get('frontImage') as File | null;
    const backFile = formData.get('backImage') as File | null;
    
    try {
      if (frontFile && frontFile.size > 0) {
        setUploadingField('front');
        frontImageUrl = await uploadImage(frontFile);
      }
      if (backFile && backFile.size > 0) {
        setUploadingField('back');
        backImageUrl = await uploadImage(backFile);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '图片上传失败');
      setUploadingField(null);
      return;
    }
    setUploadingField(null);
    
    try {
      const result = await apiPost<{ ok: boolean; id: string; cardNumber: string; poolId: string }>('/cards', {
        cardHolder: formData.get('cardHolder'),
        denomination: Number(formData.get('denomination')),
        frontImage: frontImageUrl,
        backImage: backImageUrl,
        poolName: formData.get('poolName') || '',
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

  const handleUnbindPool = async (cardId: string) => {
    if (!confirm('解绑后，对应资金池将变为普通池子，不可恢复。确定？')) return;
    try {
      await apiPost(`/cards/unbind/${cardId}`, {});
      await loadCards();
      await useStore.getState().loadState();
    } catch (e) {
      alert(e instanceof Error ? e.message : '解绑失败');
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
    1000: '¥1,000',
    2000: '¥2,000',
    5000: '¥5,000',
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
              {/* Mini card front */}
              <div className="relative h-36 overflow-hidden">
                {card.front_image ? (
                  <>
                    <div className="absolute inset-0">
                      <img src={card.front_image} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  </>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-indigo-700" />
                )}
                <div className="absolute inset-0 p-3 flex flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div className="text-white/90">
                      <div className="text-[10px] uppercase tracking-wider opacity-70">Virtual Savings</div>
                      <div className="text-sm font-bold tracking-[0.12em] font-mono mt-0.5">{card.card_number}</div>
                    </div>
                    <div className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", statusColors[card.status])}>
                      {statusLabels[card.status]}
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="text-white">
                      <div className="text-xs opacity-70">{card.card_holder}</div>
                      <div className="text-lg font-bold">{denominationLabels[card.denomination]}</div>
                    </div>
                    <div className="text-white/70 text-[10px] text-right">
                      <div>{format(new Date(card.issue_date), 'yy/MM')}</div>
                    </div>
                  </div>
                </div>
                {card.status === 'saving' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                    <div className="h-full bg-yellow-400 transition-all" style={{ width: `${getCardProgress(card)}%` }} />
                  </div>
                )}
              </div>

              <div className="p-3 space-y-2">
                {card.status === 'saving' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500 dark:text-slate-400">已存</span>
                      <span className="font-medium">¥{card.current_amount.toLocaleString()} / ¥{card.denomination.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${getCardProgress(card)}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
                  {(card.front_image || card.back_image) && <Image size={12} />}
                  {card.front_image && '正面'}
                  {card.front_image && card.back_image && '·'}
                  {card.back_image && '背面'}
                  {!card.front_image && !card.back_image && '自定义图片'}
                </div>

                <div className="flex items-center gap-1.5 pt-1.5 border-t border-gray-100 dark:border-slate-700">
                  <button
                    onClick={() => setPreviewCard(card)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <Eye size={14} />
                    3D预览
                  </button>
                  
                  {card.status === 'saving' && userTrustLevel >= 3 && (
                    <>
                      {card.pool_id && (
                        <button
                          onClick={() => handleUnbindPool(card.id)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                          title="解绑池子，变为普通池子"
                        >
                          <Unlink size={14} />
                          解绑
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteCard(card.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}

                  {card.status === 'saving' && card.current_amount >= card.denomination && userTrustLevel >= 3 && (
                    <button
                      onClick={() => handlePrintCard(card.id)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                      <Printer size={14} />
                      打印
                    </button>
                  )}

                  {card.status === 'printed' && userTrustLevel >= 3 && (
                    <button
                      onClick={() => handleDepleteCard(card.id)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
                    >
                      <Ban size={14} />
                      弃用
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Card Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
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
                  <option value="1000">1,000 元</option>
                  <option value="2000">2,000 元</option>
                  <option value="5000">5,000 元</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">蓄水池名称 (可选，留空自动生成)</label>
                <input
                  type="text"
                  name="poolName"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-blue-500"
                  placeholder="如：我的储蓄卡蓄水池"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">正面图片 (可选)</label>
                <input
                  type="file"
                  name="frontImage"
                  accept="image/*"
                  className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-semibold file:bg-purple-50 dark:file:bg-purple-900/30 file:text-purple-700 dark:file:text-purple-300 file:cursor-pointer"
                />
                <p className="text-xs text-gray-400 mt-1">显示在卡片正面</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">背面图片 (可选)</label>
                <input
                  type="file"
                  name="backImage"
                  accept="image/*"
                  className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-900/30 file:text-indigo-700 dark:file:text-indigo-300 file:cursor-pointer"
                />
                <p className="text-xs text-gray-400 mt-1">翻转卡片后显示</p>
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
                  {uploading ? `上传${uploadingField === 'front' ? '正面' : '背面'}中...` : '开卡'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3D Preview Modal */}
      {previewCard && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPreviewCard(null)}>
          <div className="max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <Card3DPreview
              card={previewCard}
              statusLabels={statusLabels}
              statusColors={statusColors}
              denominationLabels={denominationLabels}
            />
            <div className="mt-4 text-center space-y-2">
              {previewCard.status === 'saving' && previewCard.front_image && userTrustLevel >= 3 && (
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl cursor-pointer transition-colors text-sm">
                  <Image size={16} />
                  更换正面
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const url = await uploadImage(file);
                        await apiPatch(`/cards/${previewCard.id}`, { frontImage: url });
                        await loadCards();
                        const updated = cards.find(c => c.id === previewCard.id);
                        if (updated) setPreviewCard({ ...updated, front_image: url });
                      } catch (err) {
                        alert('上传失败');
                      }
                    }}
                  />
                </label>
              )}
              {previewCard.status === 'saving' && previewCard.back_image && userTrustLevel >= 3 && (
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl cursor-pointer transition-colors text-sm">
                  <Image size={16} />
                  更换背面
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const url = await uploadImage(file);
                        await apiPatch(`/cards/${previewCard.id}`, { backImage: url });
                        await loadCards();
                        const updated = cards.find(c => c.id === previewCard.id);
                        if (updated) setPreviewCard({ ...updated, back_image: url });
                      } catch (err) {
                        alert('上传失败');
                      }
                    }}
                  />
                </label>
              )}
              <button
                onClick={() => setPreviewCard(null)}
                className="block mx-auto px-6 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors"
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