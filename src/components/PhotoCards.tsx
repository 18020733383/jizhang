import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  ImagePlus,
  Images,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost, apiUploadFile } from '../lib/api';
import { cn } from '../lib/utils';
import { exportPhotoCardsZip, type PhotoCard } from '../lib/photoCards';
import ImageCropper from './ImageCropper';

type CardDraft = {
  id?: string;
  dayNumber: number;
  title: string;
  openedOn: string;
  frontText: string;
  backText: string;
  frontImageUrl: string | null;
  backImageUrl: string | null;
};

type CardView = 'manage' | 'gallery';

const GALLERY_PAGE_SIZE = 6;

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function displayDate(value: string) {
  return value.replaceAll('-', '.');
}

function CardFace({ card, side, compact = false }: { card: CardDraft | PhotoCard; side: 'front' | 'back'; compact?: boolean }) {
  const imageUrl = side === 'front' ? card.frontImageUrl : card.backImageUrl;
  const text = side === 'front'
    ? (card.frontText || card.title || `第 ${card.dayNumber} 天`)
    : (card.backText || '把今天好好收藏。');
  return (
    <div className={cn(
      'absolute inset-0 overflow-hidden rounded-[1.35rem] text-white shadow-2xl',
      side === 'front' ? 'bg-gradient-to-br from-teal-600 via-slate-900 to-indigo-800' : 'bg-gradient-to-br from-indigo-800 via-purple-900 to-rose-800'
    )} style={{ backfaceVisibility: 'hidden', transform: side === 'back' ? 'rotateY(180deg)' : undefined }}>
      {imageUrl && <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/25 via-transparent to-slate-950/55" />
      <div className={cn('absolute inset-0 flex flex-col justify-between', compact ? 'p-4' : 'p-6 sm:p-8')}>
        <div className="flex items-start justify-between gap-4">
          <span className={cn('font-semibold tracking-[0.16em] text-white/85 drop-shadow', compact ? 'text-[9px]' : 'text-[11px] sm:text-xs')}>
            DAY {String(card.dayNumber).padStart(2, '0')}
          </span>
          <span className={cn('text-white/70 drop-shadow', compact ? 'text-[9px]' : 'text-[11px] sm:text-xs')}>
            {displayDate(card.openedOn)}
          </span>
        </div>
        {side === 'front' ? (
          <div className="max-w-[72%] self-start">
            <p className={cn('font-semibold leading-snug drop-shadow-lg', compact ? 'line-clamp-2 text-sm' : 'line-clamp-3 text-xl sm:text-2xl')}>
              {text}
            </p>
            {card.title && card.frontText && card.title !== card.frontText && (
              <p className={cn('mt-1.5 line-clamp-1 text-white/65 drop-shadow', compact ? 'text-[9px]' : 'text-xs')}>{card.title}</p>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-end justify-end pb-1">
            <p className={cn('max-w-[72%] text-right font-medium leading-relaxed drop-shadow-lg', compact ? 'line-clamp-3 text-xs' : 'line-clamp-4 text-lg sm:text-xl')}>
              {text}
            </p>
          </div>
        )}
        {side === 'back' && (
          <p className={cn('self-end text-right text-white/55 drop-shadow', compact ? 'mt-1 text-[8px]' : 'mt-2 text-[10px] sm:text-[11px]')}>
            {card.title || `生活卡片 · ${card.dayNumber}/30`}
          </p>
        )}
      </div>
    </div>
  );
}

function FlippableCard({ card, compact = false }: { card: CardDraft | PhotoCard; compact?: boolean }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setFlipped((value) => !value)}
        className="block w-full text-left"
        aria-label={flipped ? '翻到卡片正面' : '翻到卡片背面'}
        style={{ perspective: '1200px' }}
      >
        <div
          className="relative w-full transition-transform duration-700 ease-out"
          style={{
            aspectRatio: '85.6 / 54',
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          <CardFace card={card} side="front" compact={compact} />
          <CardFace card={card} side="back" compact={compact} />
        </div>
      </button>
      {!compact && (
        <button type="button" onClick={() => setFlipped((value) => !value)} className="mx-auto mt-4 flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300">
          <RotateCw size={16} /> 点击旋转 · 当前{flipped ? '背面' : '正面'}
        </button>
      )}
    </div>
  );
}

function GalleryFace({ card, side }: { card: PhotoCard; side: 'front' | 'back' }) {
  const hasImage = side === 'front' ? Boolean(card.frontImageUrl) : Boolean(card.backImageUrl);
  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <div className="relative" style={{ aspectRatio: '85.6 / 54' }}>
        <CardFace card={card} side={side} compact />
      </div>
      <div className="flex items-center justify-between gap-3 px-3.5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">DAY {String(card.dayNumber).padStart(2, '0')} · {side === 'front' ? '正面' : '背面'}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{card.title || card.openedOn}</p>
        </div>
        <span className={cn(
          'shrink-0 rounded-full px-2 py-1 text-[10px] font-medium',
          hasImage
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
        )}>
          {hasImage ? '已上传' : '待补图'}
        </span>
      </div>
    </article>
  );
}

function ImagePicker({
  label,
  imageUrl,
  file,
  onChange,
}: {
  label: string;
  imageUrl: string | null;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropSource, setCropSource] = useState<File | null>(null);
  const [originalSource, setOriginalSource] = useState<File | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : imageUrl, [file, imageUrl]);
  useEffect(() => () => {
    if (file && previewUrl) URL.revokeObjectURL(previewUrl);
  }, [file, previewUrl]);

  const chooseFile = (selected: File | null) => {
    if (!selected) return;
    setError(null);
    setOriginalSource(selected);
    setCropSource(selected);
  };

  const editCrop = async () => {
    if (originalSource) {
      setCropSource(originalSource);
      return;
    }
    if (file) {
      setCropSource(file);
      return;
    }
    if (!imageUrl) return;
    setLoadingSource(true);
    setError(null);
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`图片读取失败：${response.status}`);
      const blob = await response.blob();
      const existing = new File([blob], `${label}.jpg`, { type: blob.type || 'image/jpeg' });
      setOriginalSource(existing);
      setCropSource(existing);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoadingSource(false);
    }
  };

  return (
    <div>
      <div className="group relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 transition hover:border-indigo-400 dark:border-slate-600 dark:bg-slate-900/60 dark:hover:border-indigo-500">
      {previewUrl ? (
        <>
          <img src={previewUrl} alt={`${label}预览`} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
          <div className="absolute inset-x-3 bottom-3 flex justify-center gap-2">
            <button type="button" disabled={loadingSource} onClick={() => void editCrop()} className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow backdrop-blur hover:bg-white disabled:opacity-60">
              {loadingSource ? <Loader2 className="animate-spin" size={14} /> : <RotateCw size={14} />} 调整裁切
            </button>
            <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center gap-1.5 rounded-full bg-slate-950/65 px-3 py-2 text-xs font-semibold text-white shadow backdrop-blur hover:bg-slate-950/80">
              <ImagePlus size={14} /> 更换
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} className="absolute inset-0 w-full text-center text-slate-500 hover:bg-indigo-50/50 dark:text-slate-400 dark:hover:bg-indigo-950/20">
          <ImagePlus className="mx-auto mb-2" size={28} />
          <p className="text-sm font-medium">上传{label}</p>
          <p className="mt-1 text-xs">JPG / PNG / WebP · 最大 20MB</p>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          chooseFile(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />
      </div>
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{error}</p>}
      {cropSource && (
        <ImageCropper
          source={cropSource}
          label={label}
          onCancel={() => setCropSource(null)}
          onConfirm={(cropped) => {
            onChange(cropped);
            setCropSource(null);
          }}
        />
      )}
    </div>
  );
}

function CardEditor({
  draft,
  onClose,
  onSaved,
}: {
  draft: CardDraft;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState(draft);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frontPreviewUrl = useMemo(() => frontFile ? URL.createObjectURL(frontFile) : null, [frontFile]);
  const backPreviewUrl = useMemo(() => backFile ? URL.createObjectURL(backFile) : null, [backFile]);
  const preview = useMemo<CardDraft>(() => ({
    ...form,
    frontImageUrl: frontPreviewUrl || form.frontImageUrl,
    backImageUrl: backPreviewUrl || form.backImageUrl,
  }), [form, frontPreviewUrl, backPreviewUrl]);
  useEffect(() => () => {
    if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
    if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
  }, [frontPreviewUrl, backPreviewUrl]);

  const setField = <K extends keyof CardDraft>(key: K, value: CardDraft[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      let id = form.id;
      const payload = {
        dayNumber: form.dayNumber,
        title: form.title,
        openedOn: form.openedOn,
        frontText: form.frontText,
        backText: form.backText,
      };
      if (id) {
        await apiPatch(`/photo-cards/${id}`, payload);
      } else {
        const result = await apiPost<{ card: PhotoCard }>('/photo-cards', payload);
        id = result.card.id;
      }
      if (frontFile) await apiUploadFile(`/photo-cards/${id}/images/front`, frontFile);
      if (backFile) await apiUploadFile(`/photo-cards/${id}/images/back`, backFile);
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="mx-auto my-4 grid max-w-6xl gap-6 rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-900 lg:grid-cols-[1fr_0.9fr] lg:p-7">
        <section className="order-2 space-y-5 lg:order-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">30 DAYS PHOTO CARD</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{form.id ? '编辑生活卡片' : '收藏今天'}</h3>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"><X size={22} /></button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              第几天
              <input type="number" min={1} max={999} value={form.dayNumber} onChange={(event) => setField('dayNumber', Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              开卡日期
              <input type="date" value={form.openedOn} onChange={(event) => setField('openedOn', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800" />
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            标题（可选）
            <input value={form.title} maxLength={120} onChange={(event) => setField('title', event.target.value)} placeholder="例如：傍晚的风" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              正面文字
              <textarea value={form.frontText} maxLength={240} onChange={(event) => setField('frontText', event.target.value)} placeholder={`例如：第 ${form.dayNumber} 天`} rows={3} className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800" />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              背面的一句话
              <textarea value={form.backText} maxLength={240} onChange={(event) => setField('backText', event.target.value)} placeholder="写给这一天的一句话…" rows={3} className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800" />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ImagePicker label="正面图片" imageUrl={form.frontImageUrl} file={frontFile} onChange={setFrontFile} />
            <ImagePicker label="背面图片" imageUrl={form.backImageUrl} file={backFile} onChange={setBackFile} />
          </div>
          {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-3 font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">取消</button>
            <button type="button" disabled={saving || !form.openedOn} onClick={() => void save()} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
              {saving ? '保存并上传中…' : '保存卡片'}
            </button>
          </div>
        </section>
        <section className="order-1 flex items-center rounded-3xl bg-gradient-to-br from-slate-100 to-indigo-50 p-5 dark:from-slate-950 dark:to-indigo-950/50 lg:order-2 lg:p-8">
          <div className="w-full"><FlippableCard card={preview} /></div>
        </section>
      </div>
    </div>
  );
}

export default function PhotoCards() {
  const [cards, setCards] = useState<PhotoCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editor, setEditor] = useState<CardDraft | null>(null);
  const [previewCard, setPreviewCard] = useState<PhotoCard | null>(null);
  const [view, setView] = useState<CardView>('manage');
  const [galleryPage, setGalleryPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ percent: 0, label: '' });

  const loadCards = async () => {
    try {
      const data = await apiGet<{ cards: PhotoCard[] }>('/photo-cards');
      setCards(data.cards ?? []);
      setLoadError(null);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadCards(); }, []);

  const completed = cards.filter((card) => card.frontImageUrl && card.backImageUrl).length;
  const planProgress = Math.min(100, (cards.length / 30) * 100);
  const nextDay = Math.max(0, ...cards.map((card) => card.dayNumber)) + 1;
  const sortedCards = useMemo(() => [...cards].sort((a, b) => a.dayNumber - b.dayNumber), [cards]);
  const galleryPageCount = Math.max(1, Math.ceil(sortedCards.length / GALLERY_PAGE_SIZE));
  const currentGalleryPage = Math.min(galleryPage, galleryPageCount);
  const galleryCards = sortedCards.slice(
    (currentGalleryPage - 1) * GALLERY_PAGE_SIZE,
    currentGalleryPage * GALLERY_PAGE_SIZE,
  );

  const openNew = () => setEditor({
    dayNumber: nextDay,
    title: '',
    openedOn: todayString(),
    frontText: `第 ${nextDay} 天`,
    backText: '',
    frontImageUrl: null,
    backImageUrl: null,
  });

  const editCard = (card: PhotoCard) => setEditor({ ...card });

  const deleteCard = async (card: PhotoCard) => {
    if (!window.confirm(`确定删除第 ${card.dayNumber} 天吗？对应的 B2 正反面原图也会永久删除。`)) return;
    try {
      await apiDelete(`/photo-cards/${card.id}`);
      await loadCards();
    } catch (reason) {
      window.alert(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const exportAll = async () => {
    setExporting(true);
    setExportProgress({ percent: 0, label: '准备导出' });
    try {
      await exportPhotoCardsZip(cards, (percent, label) => setExportProgress({ percent, label }));
    } catch (reason) {
      window.alert(reason instanceof Error ? reason.message : String(reason));
    } finally {
      window.setTimeout(() => setExporting(false), 500);
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={32} /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-teal-400/15 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.16em] text-indigo-300"><Sparkles size={16} /> 30 DAYS · 30 MOMENTS</div>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">把一个月，装进 30 张卡片</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">每天留下一张照片和一句话。正反面会按 PVC 横卡比例预览，集齐后可一键导出印刷文件。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={!cards.length || exporting} onClick={() => void exportAll()} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-3 font-medium text-white backdrop-blur transition hover:bg-white/15 disabled:opacity-50">
              {exporting ? <Loader2 className="animate-spin" size={18} /> : <Archive size={18} />}
              导出全部 ZIP
            </button>
            <button type="button" onClick={openNew} className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-slate-950 shadow-lg transition hover:bg-indigo-50">
              <Plus size={19} /> 收藏今天
            </button>
          </div>
        </div>
        <div className="relative mt-7">
          <div className="mb-2 flex items-center justify-between text-sm"><span>{cards.length}/30 张已建立 · {completed} 张正反面完整</span><span>{planProgress.toFixed(0)}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-teal-400 via-cyan-400 to-indigo-400 transition-all duration-500" style={{ width: `${planProgress}%` }} /></div>
        </div>
      </section>

      {exporting && (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/35">
          <div className="flex items-center justify-between text-sm font-medium text-indigo-800 dark:text-indigo-200"><span>{exportProgress.label}</span><span>{exportProgress.percent}%</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-950"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${exportProgress.percent}%` }} /></div>
        </div>
      )}

      {loadError && <div className="rounded-2xl bg-rose-50 p-4 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{loadError}</div>}

      {cards.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex w-fit rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button type="button" onClick={() => setView('manage')} className={cn('rounded-lg px-4 py-2 text-sm font-medium transition', view === 'manage' ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200')}>
              卡片管理
            </button>
            <button type="button" onClick={() => { setView('gallery'); setGalleryPage(1); }} className={cn('flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition', view === 'gallery' ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200')}>
              <Images size={16} /> 正反面画廊
            </button>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{view === 'gallery' ? `共 ${cards.length} 张卡片 · ${cards.length * 2} 个正反面` : '点击卡片可翻面，进入预览可放大查看'}</p>
        </div>
      )}

      {cards.length === 0 ? (
        <button type="button" onClick={openNew} className="flex min-h-80 w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          <Camera size={48} className="mb-4 text-indigo-400" />
          <span className="text-xl font-semibold text-slate-800 dark:text-white">从今天的第一张照片开始</span>
          <span className="mt-2 text-sm">建立第 1 天的生活卡片</span>
        </button>
      ) : view === 'manage' ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sortedCards.map((card) => (
            <article key={card.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="p-4"><FlippableCard card={card} compact /></div>
              <div className="px-5 pb-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{card.title || `第 ${card.dayNumber} 天`}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><CalendarDays size={13} /> {card.openedOn}</p>
                  </div>
                  <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', card.frontImageUrl && card.backImageUrl ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300')}>
                    {card.frontImageUrl && card.backImageUrl ? '正反面完整' : '待补充'}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-[1fr_1fr_auto] gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <button type="button" onClick={() => setPreviewCard(card)} className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-50 py-2 text-sm font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-950"><Eye size={15} /> 预览</button>
                  <button type="button" onClick={() => editCard(card)} className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-50 py-2 text-sm font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-950"><Pencil size={15} /> 编辑</button>
                  <button type="button" onClick={() => void deleteCard(card)} className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"><Trash2 size={17} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {galleryCards.flatMap((card) => [
              <GalleryFace key={`${card.id}-front`} card={card} side="front" />,
              <GalleryFace key={`${card.id}-back`} card={card} side="back" />,
            ])}
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              第 {currentGalleryPage} / {galleryPageCount} 页 · 本页 {galleryCards.length} 张卡片
            </p>
            <div className="flex items-center gap-2">
              <button type="button" disabled={currentGalleryPage <= 1} onClick={() => setGalleryPage((page) => Math.max(1, page - 1))} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-700 dark:hover:text-indigo-300">
                <ChevronLeft size={16} /> 上一页
              </button>
              <button type="button" disabled={currentGalleryPage >= galleryPageCount} onClick={() => setGalleryPage((page) => Math.min(galleryPageCount, page + 1))} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-700 dark:hover:text-indigo-300">
                下一页 <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        <Download className="mt-0.5 shrink-0 text-indigo-500" size={18} />
        <p>ZIP 中每张卡都有独立文件夹，包含 <strong>正面.png</strong>、<strong>背面.png</strong> 和卡片信息。导出图片为 1011 × 638 px，文字与日期已合成到画面中。</p>
      </div>

      {editor && <CardEditor draft={editor} onClose={() => setEditor(null)} onSaved={loadCards} />}
      {previewCard && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-900 sm:p-8">
            <div className="mb-6 flex items-center justify-between"><div><p className="text-sm font-semibold text-indigo-500">DAY {String(previewCard.dayNumber).padStart(2, '0')}</p><h3 className="text-xl font-bold text-slate-900 dark:text-white">{previewCard.title || '生活卡片预览'}</h3></div><button type="button" onClick={() => setPreviewCard(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={22} /></button></div>
            <FlippableCard key={previewCard.id} card={previewCard} />
          </div>
        </div>
      )}
    </div>
  );
}
