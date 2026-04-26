import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, CreditCard, Loader2, Image, Printer, Eye, Ban, Filter, Unlink, Download, Settings, Link2, CheckSquare, Square } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';
import { compressImage, uploadImage } from '../lib/image';
import { useStore } from '../store/useStore';
import JSZip from 'jszip';
import html2canvas from 'html2canvas';

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

function formatCardNumber(num: string): string {
  return num.replace(/(.{4})/g, '$1 ').trim();
}

function QRCodeImage({ value, size = 80 }: { value: string; size?: number }) {
  const encoded = encodeURIComponent(value);
  return (
    <div className="bg-white rounded p-1 inline-block">
      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&format=png&margin=2`} alt="QR" width={size} height={size} />
    </div>
  );
}

function CardFace({
  card,
  side,
  denominationLabels,
}: {
  card: VirtualCard;
  side: 'front' | 'back';
  denominationLabels: Record<number, string>;
}) {
  const imageUrl = side === 'front' ? card.front_image : card.back_image;

  return (
    <div className="relative w-full aspect-[3/2] rounded-2xl overflow-hidden shadow-2xl bg-gray-900">
      {imageUrl ? (
        <div className="absolute inset-0">
          <img src={imageUrl} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
          <div className={cn(
            "absolute inset-0",
            side === 'front'
              ? "bg-gradient-to-t from-black/70 via-black/15 to-black/25"
              : "bg-gradient-to-b from-black/50 via-black/10 to-black/55"
          )} />
        </div>
      ) : (
        <div className={cn(
          "absolute inset-0",
          side === 'front'
            ? "bg-gradient-to-br from-purple-700 via-indigo-700 to-violet-800"
            : "bg-gradient-to-br from-indigo-700 via-purple-700 to-pink-700"
        )} />
      )}

      {side === 'front' ? (
        <div className="absolute inset-0 p-5 flex flex-col justify-between text-white relative z-10">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] opacity-60 font-medium">Virtual Savings Card</div>
              <div className="text-xl font-bold tracking-[0.18em] mt-1.5 font-mono drop-shadow-lg">
                {formatCardNumber(card.card_number)}
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs opacity-50 uppercase tracking-wider mb-0.5">Card Holder</div>
                <div className="text-lg font-semibold tracking-wide drop-shadow-lg">{card.card_holder}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] opacity-50 uppercase tracking-wider mb-0.5">Denomination</div>
                <div className="text-2xl font-bold drop-shadow-lg">{denominationLabels[card.denomination]}</div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/20">
              <div className="text-[10px] opacity-50">{format(new Date(card.issue_date), 'yyyy/MM/dd')} Issue</div>
              <div className="text-[10px] opacity-30 font-mono tracking-wider">1802</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 p-5 flex flex-col justify-between text-white relative z-10">
          <div>
            <div className="bg-black/30 backdrop-blur-sm rounded-lg p-3 mt-2">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="opacity-80 uppercase tracking-wider text-xs font-medium">Holder</span>
                  <div className="font-semibold drop-shadow-lg">{card.card_holder}</div>
                </div>
                <div>
                  <span className="opacity-80 uppercase tracking-wider text-xs font-medium">Issue Date</span>
                  <div className="font-semibold drop-shadow-lg">{format(new Date(card.issue_date), 'yyyy.MM.dd')}</div>
                </div>
                <div>
                  <span className="opacity-80 uppercase tracking-wider text-xs font-medium">Denomination</span>
                  <div className="font-bold drop-shadow-lg text-base">¥{card.denomination.toLocaleString()}</div>
                </div>
                <div>
                  <span className="opacity-80 uppercase tracking-wider text-xs font-medium">Card No.</span>
                  <div className="font-mono text-sm drop-shadow-lg">{card.card_number}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <div className="flex flex-col gap-1">
              <QRCodeImage value={card.card_number} size={64} />
              <div className="text-[8px] opacity-50">Scan for info</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] opacity-50 leading-tight">
                Virtual Savings Card<br />
                For spending only · No transfer
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card3DPreview({
  card,
  denominationLabels,
}: {
  card: VirtualCard;
  denominationLabels: Record<number, string>;
}) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className="w-full" style={{ perspective: '1000px' }}>
      <div
        className="relative w-full cursor-pointer"
        style={{
          transformStyle: 'preserve-3d',
          transition: 'transform 0.7s ease',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div style={{ backfaceVisibility: 'hidden' }}>
          <CardFace card={card} side="front" denominationLabels={denominationLabels} />
        </div>
        <div style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', position: 'absolute', inset: 0 }}>
          <CardFace card={card} side="back" denominationLabels={denominationLabels} />
        </div>
      </div>
      <p className="text-center text-white/50 text-xs mt-3">点击翻转卡片</p>
    </div>
  );
}

interface VirtualCardsProps {
  userTrustLevel?: number;
}

export default function VirtualCards({ userTrustLevel = 1 }: VirtualCardsProps) {
  const [cards, setCards] = useState<VirtualCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPoolModal, setShowPoolModal] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'saving' | 'printed' | 'depleted'>('all');
  const [previewCard, setPreviewCard] = useState<VirtualCard | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingField, setUploadingField] = useState<'front' | 'back' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [settingsCard, setSettingsCard] = useState<VirtualCard | null>(null);
  const [rebindCard, setRebindCard] = useState<VirtualCard | null>(null);
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadCards(); }, []);

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

  const getCardProgress = (card: VirtualCard): number => {
    return Math.min(100, (card.current_amount / card.denomination) * 100);
  };

  const doUploadImage = async (file: File): Promise<string> => {
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      return await uploadImage(compressed);
    } finally {
      setUploading(false);
    }
  };

  const handleAddCard = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    let frontImageUrl = '';
    let backImageUrl = '';
    
    try {
      const frontFile = formData.get('frontImage') as File | null;
      const backFile = formData.get('backImage') as File | null;
      if (frontFile && frontFile.size > 0) { setUploadingField('front'); frontImageUrl = await doUploadImage(frontFile); }
      if (backFile && backFile.size > 0) { setUploadingField('back'); backImageUrl = await doUploadImage(backFile); }
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
    } catch (e) { alert(e instanceof Error ? e.message : '打印失败'); }
  };

  const handleDepleteCard = async (id: string) => {
    if (!confirm('确定要弃用此卡片吗？')) return;
    try {
      await apiPost(`/cards/deplete/${id}`, {});
      await loadCards();
    } catch (e) { alert(e instanceof Error ? e.message : '弃用失败'); }
  };

  const handleDeleteCard = async (id: string) => {
    if (!confirm('确定要删除此卡片吗？')) return;
    try {
      await apiDelete(`/cards/${id}`);
      await loadCards();
      await useStore.getState().loadState();
    } catch (e) { alert(e instanceof Error ? e.message : '删除失败'); }
  };

  const handleSaveSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!settingsCard) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    try {
      const patchData: Record<string, unknown> = {};
      if (formData.get('cardHolder')) patchData.cardHolder = formData.get('cardHolder');
      if (formData.get('denomination')) patchData.denomination = Number(formData.get('denomination'));
      if (formData.get('poolName')) patchData.poolName = formData.get('poolName');
      if (formData.get('regenerate') === 'on') patchData.newCardNumber = true;
      
      await apiPatch(`/cards/${settingsCard.id}`, patchData);
      await loadCards();
      await useStore.getState().loadState();
      setSettingsCard(null);
    } catch (e) { alert(e instanceof Error ? e.message : '保存失败'); }
  };

  const handleRebindPool = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!rebindCard) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    try {
      await apiPost(`/cards/rebind/${rebindCard.id}`, { poolName: formData.get('poolName') || '' });
      await loadCards();
      await useStore.getState().loadState();
      setRebindCard(null);
    } catch (e) { alert(e instanceof Error ? e.message : '重新绑定失败'); }
  };

  const handleExportCard = async (card: VirtualCard) => {
    setExporting(true);
    try {
      const zip = new JSZip();
      
      const createElementForCapture = (side: 'front' | 'back') => {
        const container = document.createElement('div');
        container.style.cssText = 'width:600px;height:400px;position:fixed;left:-9999px;top:-9999px;z-index:-1;background:#1a1a2e;';
        document.body.appendChild(container);
        
        const faceDiv = document.createElement('div');
        faceDiv.style.cssText = 'width:600px;height:400px;position:relative;border-radius:16px;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;background:linear-gradient(135deg, #7c3aed, #4f46e5, #6d28d9);';
        
        const imageUrl = side === 'front' ? card.front_image : card.back_image;
        
        if (imageUrl) {
          const img = document.createElement('img');
          img.src = imageUrl;
          img.crossOrigin = 'anonymous';
          img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
          faceDiv.appendChild(img);
          const overlay = document.createElement('div');
          overlay.style.cssText = side === 'front'
            ? 'position:absolute;inset:0;background:linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0.15), rgba(0,0,0,0.25));'
            : 'position:absolute;inset:0;background:linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0.1), rgba(0,0,0,0.55));';
          faceDiv.appendChild(overlay);
        } else {
          faceDiv.style.background = side === 'front'
            ? 'linear-gradient(135deg, #7c3aed, #4f46e5, #6d28d9)'
            : 'linear-gradient(135deg, #4f46e5, #7c3aed, #be185d)';
        }
        
        const denomLabels: Record<number, string> = { 1000: '¥1,000', 2000: '¥2,000', 5000: '¥5,000' };
        
        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = 'position:absolute;inset:0;padding:20px;display:flex;flex-direction:column;justify-content:space-between;color:white;z-index:10;';
        
        if (side === 'front') {
          contentDiv.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <div style="font-size:9px;text-transform:uppercase;letter-spacing:3px;opacity:0.6;">Virtual Savings Card</div>
                <div style="font-size:18px;font-weight:bold;letter-spacing:3px;font-family:monospace;margin-top:6px;text-shadow:0 2px 8px rgba(0,0,0,0.5);">${formatCardNumber(card.card_number)}</div>
              </div>
            </div>
            <div>
              <div style="display:flex;justify-content:space-between;align-items:flex-end;">
                <div>
                  <div style="font-size:10px;opacity:0.5;text-transform:uppercase;letter-spacing:2px;">Card Holder</div>
                  <div style="font-size:15px;font-weight:600;letter-spacing:1px;margin-top:2px;text-shadow:0 2px 8px rgba(0,0,0,0.5);">${card.card_holder}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:10px;opacity:0.5;text-transform:uppercase;letter-spacing:2px;">Denomination</div>
                  <div style="font-size:20px;font-weight:bold;text-shadow:0 2px 8px rgba(0,0,0,0.5);">${denomLabels[card.denomination]}</div>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.2);">
                <div style="font-size:10px;opacity:0.5;">${format(new Date(card.issue_date), 'yyyy/MM/dd')} Issue</div>
                <div style="font-size:10px;opacity:0.3;font-family:monospace;letter-spacing:2px;">1802</div>
              </div>
            </div>`;
        } else {
          contentDiv.innerHTML = `
            <div>
              <div style="background:rgba(0,0,0,0.3);border-radius:8px;padding:12px;backdrop-filter:blur(4px);margin-top:16px;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:14px;">
                  <div><div style="opacity:0.8;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:500;">Holder</div><div style="font-weight:600;text-shadow:0 2px 8px rgba(0,0,0,0.5);">${card.card_holder}</div></div>
                  <div><div style="opacity:0.8;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:500;">Issue Date</div><div style="font-weight:600;text-shadow:0 2px 8px rgba(0,0,0,0.5);">${format(new Date(card.issue_date), 'yyyy.MM.dd')}</div></div>
                  <div><div style="opacity:0.8;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:500;">Denomination</div><div style="font-weight:bold;text-shadow:0 2px 8px rgba(0,0,0,0.5);font-size:16px;">¥${card.denomination.toLocaleString()}</div></div>
                  <div><div style="opacity:0.8;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:500;">Card No.</div><div style="font-family:monospace;font-size:14px;text-shadow:0 2px 8px rgba(0,0,0,0.5);">${card.card_number}</div></div>
                </div>
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:flex-end;">
              <div style="text-align:left;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(card.card_number)}&format=png&margin=2" alt="QR" style="border-radius:4px;background:white;padding:4px;width:64px;height:64px;" />
                <div style="font-size:8px;opacity:0.5;margin-top:2px;">Scan for info</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:9px;opacity:0.5;line-height:1.4;">Virtual Savings Card<br />For spending only · No transfer</div>
              </div>
            </div>`;
        }
        
        faceDiv.appendChild(contentDiv);
        container.appendChild(faceDiv);
        return container;
      };

      for (const side of ['front', 'back'] as const) {
        const container = createElementForCapture(side);
        
        await new Promise(r => setTimeout(r, 200));
        
        try {
          const canvas = await html2canvas(container, {
            backgroundColor: '#1a1a2e',
            scale: 2,
            useCORS: true,
            allowTaint: true,
            width: 600,
            height: 400,
          });
          
          const blob = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/png'));
          const label = side === 'front' ? '正面' : '背面';
          zip.file(`${card.card_number} - ${label}.png`, blob);
        } finally {
          document.body.removeChild(container);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${card.card_number}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
      alert('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  const filteredCards = cards.filter(card => {
    if (filter === 'all') return true;
    return card.status === filter;
  });

  const statusLabels: Record<string, string> = { saving: '蓄力中', printed: '已打印', depleted: '已弃用' };
  const statusColors: Record<string, string> = {
    saving: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    printed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    depleted: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  };
  const denominationLabels: Record<number, string> = { 1000: '¥1,000', 2000: '¥2,000', 5000: '¥5,000' };

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
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm">
              <option value="all">全部</option><option value="saving">蓄力中</option><option value="printed">已打印</option><option value="depleted">已弃用</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {userTrustLevel >= 3 && selectedCards.size === 0 && (
            <button onClick={() => setSelectMode(true)} className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 px-3 py-2 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors">
              <Download size={16} />多选导出
            </button>
          )}
          {selectedCards.size > 0 && (
            <>
              <span className="text-sm text-purple-600 dark:text-purple-400 font-medium">{selectedCards.size} 张已选</span>
              <button
                onClick={async () => {
                  const zip = new JSZip();
                  const selectedList = cards.filter(c => selectedCards.has(c.id));
                  setExporting(true);
                  try {
                    for (const card of selectedList) {
                      for (const side of ['front', 'back'] as const) {
const container = document.createElement('div');
                         container.style.cssText = 'width:600px;height:400px;position:fixed;left:-9999px;top:-9999px;z-index:-1;background:#1a1a2e;';
                         document.body.appendChild(container);
                         const faceDiv = document.createElement('div');
                         faceDiv.style.cssText = 'width:600px;height:400px;position:relative;border-radius:16px;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;background:linear-gradient(135deg, #7c3aed, #4f46e5, #6d28d9);';
                        const imageUrl = side === 'front' ? card.front_image : card.back_image;
                        if (imageUrl) {
                          const img = document.createElement('img');
                          img.src = imageUrl; img.crossOrigin = 'anonymous';
                          img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
                          faceDiv.appendChild(img);
                          const overlay = document.createElement('div');
                          overlay.style.cssText = side === 'front'
                            ? 'position:absolute;inset:0;background:linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0.15), rgba(0,0,0,0.25));'
                            : 'position:absolute;inset:0;background:linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0.1), rgba(0,0,0,0.55));';
                          faceDiv.appendChild(overlay);
                        } else {
                          faceDiv.style.background = side === 'front'
                            ? 'linear-gradient(135deg, #7c3aed, #4f46e5, #6d28d9)'
                            : 'linear-gradient(135deg, #4f46e5, #7c3aed, #be185d)';
                        }
                        const denomLabels: Record<number, string> = { 1000: '¥1,000', 2000: '¥2,000', 5000: '¥5,000' };
                        const contentDiv = document.createElement('div');
                        contentDiv.style.cssText = 'position:absolute;inset:0;padding:20px;display:flex;flex-direction:column;justify-content:space-between;color:white;z-index:10;';
                        if (side === 'front') {
                          contentDiv.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><div style="font-size:9px;text-transform:uppercase;letter-spacing:3px;opacity:0.6;">Virtual Savings Card</div><div style="font-size:18px;font-weight:bold;letter-spacing:3px;font-family:monospace;margin-top:6px;text-shadow:0 2px 8px rgba(0,0,0,0.5);">${formatCardNumber(card.card_number)}</div></div></div><div><div style="display:flex;justify-content:space-between;align-items:flex-end;"><div><div style="font-size:10px;opacity:0.5;text-transform:uppercase;letter-spacing:2px;">Card Holder</div><div style="font-size:15px;font-weight:600;letter-spacing:1px;margin-top:2px;text-shadow:0 2px 8px rgba(0,0,0,0.5);">${card.card_holder}</div></div><div style="text-align:right;"><div style="font-size:10px;opacity:0.5;text-transform:uppercase;letter-spacing:2px;">Denomination</div><div style="font-size:20px;font-weight:bold;text-shadow:0 2px 8px rgba(0,0,0,0.5);">${denomLabels[card.denomination]}</div></div></div><div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.2);"><div style="font-size:10px;opacity:0.5;">${format(new Date(card.issue_date), 'yyyy/MM/dd')} Issue</div><div style="font-size:10px;opacity:0.3;font-family:monospace;letter-spacing:2px;">1802</div></div></div>`;
                        } else {
                          contentDiv.innerHTML = `<div><div style="background:rgba(0,0,0,0.3);border-radius:8px;padding:12px;backdrop-filter:blur(4px);margin-top:16px;"><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:14px;"><div><div style="opacity:0.8;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:500;">Holder</div><div style="font-weight:600;text-shadow:0 2px 8px rgba(0,0,0,0.5);">${card.card_holder}</div></div><div><div style="opacity:0.8;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:500;">Issue Date</div><div style="font-weight:600;text-shadow:0 2px 8px rgba(0,0,0,0.5);">${format(new Date(card.issue_date), 'yyyy.MM.dd')}</div></div><div><div style="opacity:0.8;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:500;">Denomination</div><div style="font-weight:bold;text-shadow:0 2px 8px rgba(0,0,0,0.5);font-size:16px;">¥${card.denomination.toLocaleString()}</div></div><div><div style="opacity:0.8;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:500;">Card No.</div><div style="font-family:monospace;font-size:14px;text-shadow:0 2px 8px rgba(0,0,0,0.5);">${card.card_number}</div></div></div></div></div><div style="display:flex;justify-content:space-between;align-items:flex-end;"><div style="text-align:left;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(card.card_number)}&format=png&margin=2" alt="QR" style="border-radius:4px;background:white;padding:4px;width:64px;height:64px;" /><div style="font-size:8px;opacity:0.5;margin-top:2px;">Scan for info</div></div><div style="text-align:right;"><div style="font-size:9px;opacity:0.5;line-height:1.4;">Virtual Savings Card<br />For spending only · No transfer</div></div></div>`;
                        }
                        faceDiv.appendChild(contentDiv);
                        container.appendChild(faceDiv);
                        await new Promise(r => setTimeout(r, 200));
                        try {
                          const canvas = await html2canvas(container, { backgroundColor: '#1a1a2e', scale: 2, useCORS: true, allowTaint: true, width: 600, height: 400 });
                          const blob = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/png'));
                          zip.file(`${card.card_number} - ${side === 'front' ? '正面' : '背面'}.png`, blob);
                        } finally { document.body.removeChild(container); }
                      }
                    }
                    const content = await zip.generateAsync({ type: 'blob' });
                    const url = URL.createObjectURL(content);
                    const a = document.createElement('a');
                    a.href = url; a.download = `cards_batch_${Date.now()}.zip`; a.click();
                    URL.revokeObjectURL(url);
                  } catch { alert('导出失败，请重试'); }
                  finally { setExporting(false); setSelectMode(false); setSelectedCards(new Set()); }
                }}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <Download size={14} />{exporting ? '导出中...' : `下载 ${selectedCards.size} 张`}
              </button>
              <button onClick={() => { setSelectMode(false); setSelectedCards(new Set()); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm">
                取消
              </button>
            </>
          )}
          {userTrustLevel >= 3 && !selectMode && selectedCards.size === 0 && (
            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium transition-all">
              <Plus size={18} />开新卡
            </button>
          )}
        </div>
      </div>

      {filteredCards.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-slate-400">
          <CreditCard size={48} className="mx-auto mb-4 opacity-50" />
          <p>暂无虚拟储蓄卡</p>
          {userTrustLevel >= 3 && (
            <button onClick={() => setShowAddModal(true)} className="mt-4 text-blue-600 dark:text-blue-400 hover:underline">开一张新卡</button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCards.map(card => (
            <div key={card.id} className={cn(
              "bg-white dark:bg-slate-800 rounded-2xl shadow-sm border overflow-hidden transition-all relative",
              selectedCards.has(card.id)
                ? "border-purple-400 dark:border-purple-500 ring-2 ring-purple-300 dark:ring-purple-600"
                : "border-gray-100 dark:border-slate-700"
            )}>
              {selectMode && (
                <button
                  onClick={() => {
                    setSelectedCards(prev => {
                      const next = new Set(prev);
                      if (next.has(card.id)) next.delete(card.id);
                      else next.add(card.id);
                      return next;
                    });
                  }}
                  className="absolute top-3 left-3 z-20 p-1.5 bg-white/90 dark:bg-slate-800/90 rounded-full shadow-md hover:bg-white dark:hover:bg-slate-700 transition-colors"
                >
                  {selectedCards.has(card.id) ? <CheckSquare size={18} className="text-purple-600" /> : <Square size={18} className="text-gray-400" />}
                </button>
              )}

              {/* Mini front card */}
              <div className="relative h-32 overflow-hidden">
                {card.front_image ? (
                  <><img src={card.front_image} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/30" /></>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-indigo-600 to-violet-700" />
                )}
                <div className="absolute inset-0 p-3 flex flex-col justify-between text-white z-10">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[8px] uppercase tracking-widest opacity-50">Virtual Savings</div>
                      <div className="text-xs font-bold tracking-wider font-mono mt-0.5 drop-shadow">{formatCardNumber(card.card_number)}</div>
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="text-xs opacity-80 drop-shadow">{card.card_holder}</div>
                    <div className="text-sm font-bold drop-shadow">{denominationLabels[card.denomination]}</div>
                  </div>
                </div>
                {card.status === 'saving' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20 z-10">
                    <div className="h-full bg-yellow-400" style={{ width: `${getCardProgress(card)}%` }} />
                  </div>
                )}
              </div>

              <div className="p-3 space-y-1.5">
                {card.status === 'saving' && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-slate-400">已存 ¥{card.current_amount.toLocaleString()}</span>
                    <span className="font-medium">目标 ¥{card.denomination.toLocaleString()}</span>
                  </div>
                )}

                <div className="flex items-center gap-1 flex-wrap">
                  <button onClick={() => setPreviewCard(card)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg transition-colors">
                    <Eye size={14} />3D预览
                  </button>
                  {!exporting && (
                    <button onClick={() => handleExportCard(card)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg transition-colors">
                      <Download size={14} />导出
                    </button>
                  )}
                  {card.status === 'saving' && userTrustLevel >= 3 && (
                    <button onClick={() => setSettingsCard(card)}
                      className="flex items-center justify-center gap-1 py-1.5 px-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="卡片设置">
                      <Settings size={12} />
                    </button>
                  )}
                  {card.status === 'saving' && userTrustLevel >= 3 && !card.pool_id && (
                    <button onClick={() => setRebindCard(card)}
                      className="flex items-center justify-center gap-1 py-1.5 px-2 text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                      title="重新绑定池子">
                      <Link2 size={12} />
                    </button>
                  )}
                  {card.status === 'saving' && userTrustLevel >= 3 && card.pool_id && (
                    <button onClick={() => handleUnbindPool(card.id)}
                      className="flex items-center justify-center gap-1 py-1.5 px-2 text-xs text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                      title="解绑池子">
                      <Unlink size={12} />
                    </button>
                  )}
                  {card.status === 'saving' && userTrustLevel >= 3 && (
                    <button onClick={() => handleDeleteCard(card.id)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                  {card.status === 'saving' && card.current_amount >= card.denomination && userTrustLevel >= 3 && (
                    <button onClick={() => handlePrintCard(card.id)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
                      <Printer size={14} />打印
                    </button>
                  )}
                  {card.status === 'printed' && userTrustLevel >= 3 && (
                    <button onClick={() => handleDepleteCard(card.id)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors">
                      <Ban size={14} />弃用
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
                <input type="text" name="cardHolder" required className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-blue-500" placeholder="卡片持有人姓名" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">面额</label>
                <select name="denomination" required className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-blue-500">
                  <option value="">选择面额</option><option value="1000">1,000 元</option><option value="2000">2,000 元</option><option value="5000">5,000 元</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">蓄水池名称 (可选)</label>
                <input type="text" name="poolName" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-blue-500" placeholder="留空自动生成" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">正面图片 (可选)</label>
                <input type="file" name="frontImage" accept="image/*" className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-semibold file:bg-purple-50 dark:file:bg-purple-900/30 file:text-purple-700 dark:file:text-purple-300 file:cursor-pointer" />
                <p className="text-xs text-gray-400 mt-1">显示在卡片正面背景</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">背面图片 (可选)</label>
                <input type="file" name="backImage" accept="image/*" className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-900/30 file:text-indigo-700 dark:file:text-indigo-300 file:cursor-pointer" />
                <p className="text-xs text-gray-400 mt-1">翻转后显示的背景</p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-slate-600 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">取消</button>
                <button type="submit" disabled={uploading} className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
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
            <Card3DPreview card={previewCard} denominationLabels={denominationLabels} />
            
            <div className="mt-4 space-y-2">
              {/* Image update buttons */}
              {userTrustLevel >= 3 && previewCard.status === 'saving' && (
                <div className="flex gap-2 justify-center">
                  <label className="inline-flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl cursor-pointer transition-colors text-sm">
                    <Image size={16} />换正面
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      try {
                        const url = await doUploadImage(file);
                        await apiPatch(`/cards/${previewCard.id}`, { frontImage: url });
                        await loadCards();
                        const updated = cards.find(c => c.id === previewCard.id);
                        if (updated) setPreviewCard({ ...updated });
                      } catch { alert('上传失败'); }
                    }} />
                  </label>
                  <label className="inline-flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl cursor-pointer transition-colors text-sm">
                    <Image size={16} />换背面
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      try {
                        const url = await doUploadImage(file);
                        await apiPatch(`/cards/${previewCard.id}`, { backImage: url });
                        await loadCards();
                        const updated = cards.find(c => c.id === previewCard.id);
                        if (updated) setPreviewCard({ ...updated });
                      } catch { alert('上传失败'); }
                    }} />
                  </label>
                </div>
              )}
              {!exporting && (
                <button onClick={() => handleExportCard(previewCard)}
                  className="block mx-auto px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors text-sm">
                  <Download size={16} className="inline mr-1" />导出图片
                </button>
              )}
              <button onClick={() => setPreviewCard(null)}
                className="block mx-auto px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Card Settings Modal */}
      {settingsCard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">卡片设置</h3>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">持卡人</label>
                <input type="text" name="cardHolder" defaultValue={settingsCard.card_holder} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">面额</label>
                <select name="denomination" defaultValue={settingsCard.denomination} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-blue-500">
                  <option value="1000">1,000 元</option>
                  <option value="2000">2,000 元</option>
                  <option value="5000">5,000 元</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">修改面额将同步调整蓄水池预算</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">蓄水池名称</label>
                <input type="text" name="poolName" placeholder="留空保持默认" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="regenerate" id="regenerate" className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500" />
                <label htmlFor="regenerate" className="text-sm text-gray-600 dark:text-slate-300">重新生成卡号</label>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button type="button" onClick={() => setSettingsCard(null)} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-slate-600 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">取消</button>
                <button type="submit" className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rebind Pool Modal */}
      {rebindCard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">重新绑定池子</h3>
            <p className="text-sm text-gray-500 mb-4">卡片 <span className="font-mono font-medium">{rebindCard.card_number}</span> 当前没有关联池子，是否创建一个新池子？</p>
            <form onSubmit={handleRebindPool} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">新池子名称 (可选)</label>
                <input type="text" name="poolName" defaultValue={`卡 ${rebindCard.card_number.slice(-8)} 蓄水池`} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button type="button" onClick={() => setRebindCard(null)} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-slate-600 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">取消</button>
                <button type="submit" className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-colors">创建并绑定</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}