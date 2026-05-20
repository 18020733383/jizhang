import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Camera, Check, Download, Eye, EyeOff, Image, Loader2, Lock, PenLine, ScanLine, Sparkles } from 'lucide-react';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { apiGet, apiPost } from '../lib/api';
import { uploadImage } from '../lib/image';
import { cn } from '../lib/utils';

const CARD_TARGET_WORDS = 2000;

interface WritingCardsProps {
  userTrustLevel?: number;
}

interface WritingCard {
  id: string;
  card_number: string;
  article_id: string;
  title: string;
  front_image: string | null;
  back_image: string | null;
  issue_date: string;
  status: 'draft' | 'printed';
  qr_locked: number;
  printed: number;
  printed_at: string | null;
  created_at: string;
  word_count: number;
}

interface CreatedWritingCard {
  ok: boolean;
  id: string;
  articleId: string;
  cardNumber: string;
  qrHash: string;
  issueDate: string;
}

interface ReadWritingCard {
  id: string;
  card_number: string;
  title: string;
  front_image: string | null;
  back_image: string | null;
  issue_date: string;
  article_id: string;
  content: string;
  word_count: number;
  article_created_at: string;
}

function countWritingWords(text: string): number {
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
  const withoutCjk = text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, ' ');
  const latin = withoutCjk.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g)?.length ?? 0;
  return cjk + latin;
}

function formatCardNumber(value: string): string {
  return value.replace(/(.{4})/g, '$1 ').trim();
}

function QRCodeImage({ value, size = 76 }: { value: string; size?: number }) {
  return (
    <div className="inline-flex rounded-xl bg-white p-1.5 shadow-lg shadow-black/20">
      <img
        src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&format=png&margin=2`}
        alt="QR code"
        width={size}
        height={size}
      />
    </div>
  );
}

function WritingCardFace({
  cardNumber,
  title,
  issueDate,
  wordCount,
  imageUrl,
  side,
  qrHash,
}: {
  cardNumber: string;
  title: string;
  issueDate: string;
  wordCount: number;
  imageUrl: string | null;
  side: 'front' | 'back';
  qrHash?: string;
}) {
  return (
    <div className="relative aspect-[3/2] w-full overflow-hidden rounded-[1.45rem] bg-stone-950 shadow-2xl shadow-stone-950/30">
      {imageUrl ? (
        <img src={imageUrl} alt="" crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover brightness-110 saturate-110" />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,#fef3c7_0,#f97316_22%,transparent_43%),linear-gradient(135deg,#18222f,#35505d_46%,#d3a55f)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-br from-white/18 via-black/5 to-black/55" />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0,rgba(255,255,255,.16)_18%,transparent_36%)]" />

      {side === 'front' ? (
        <div className="relative z-10 flex h-full flex-col justify-between p-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/65">Writing Relic</div>
              <div className="mt-2 max-w-[15rem] text-2xl font-black leading-tight drop-shadow-lg">{title || 'Untitled Article'}</div>
            </div>
            <div className="rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] backdrop-blur">One-Off</div>
          </div>
          <div>
            <div className="font-mono text-lg font-bold tracking-[0.2em] drop-shadow">{formatCardNumber(cardNumber)}</div>
            <div className="mt-3 flex items-end justify-between border-t border-white/25 pt-3 text-xs text-white/75">
              <span>{issueDate}</span>
              <span>{wordCount.toLocaleString()} words sealed</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex h-full flex-col justify-between p-5 text-white">
          <div className="rounded-2xl border border-white/20 bg-black/25 p-4 backdrop-blur-md">
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55">Article Anchor</div>
            <div className="mt-2 text-sm leading-relaxed text-white/90">Scan inside this system to unfold the article, date, and card record. The printed object keeps the time stamp.</div>
          </div>
          <div className="flex items-end justify-between gap-4">
            {qrHash ? (
              <div>
                <QRCodeImage value={qrHash} />
                <div className="mt-1 font-mono text-[9px] tracking-widest text-white/55">{qrHash}</div>
              </div>
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-white/20 bg-black/25 text-center text-[10px] uppercase tracking-[0.2em] text-white/55">
                QR Locked
              </div>
            )}
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/55">Card No.</div>
              <div className="mt-1 font-mono text-sm font-bold">{cardNumber}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CardSpinner({ card }: { card: ReadWritingCard }) {
  return (
    <div className="mx-auto max-w-sm" style={{ perspective: '1100px' }}>
      <motion.div
        initial={{ rotateY: -90, y: 30, opacity: 0, scale: 0.86 }}
        animate={{ rotateY: [0, 180, 360], y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 1.45, ease: [0.2, 0.85, 0.2, 1] }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <WritingCardFace
          cardNumber={card.card_number}
          title={card.title}
          issueDate={card.issue_date}
          wordCount={card.word_count}
          imageUrl={card.front_image}
          side="front"
        />
      </motion.div>
    </div>
  );
}

export default function WritingCards({ userTrustLevel = 1 }: WritingCardsProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [cards, setCards] = useState<WritingCard[]>([]);
  const [created, setCreated] = useState<CreatedWritingCard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [exported, setExported] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [revealedHashes, setRevealedHashes] = useState<Record<string, string>>({});
  const [readCode, setReadCode] = useState('');
  const [readCard, setReadCard] = useState<ReadWritingCard | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [showArticle, setShowArticle] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frontRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLDivElement | null>(null);
  const wordCount = useMemo(() => countWritingWords(content), [content]);
  const progress = Math.min(100, (wordCount / CARD_TARGET_WORDS) * 100);
  const canOpenCard = wordCount >= CARD_TARGET_WORDS && title.trim() && content.trim();
  const browserCanScan = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

  const loadCards = async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<{ cards: WritingCard[] }>('/writing/cards');
      setCards(data.cards);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载写作卡失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCards();
  }, []);

  useEffect(() => {
    if (!scannerOpen || !browserCanScan) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    const start = async () => {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
      timer = window.setInterval(async () => {
        if (!videoRef.current) return;
        const codes = await detector.detect(videoRef.current);
        if (codes[0]?.rawValue) {
          setReadCode(codes[0].rawValue);
          setScannerOpen(false);
        }
      }, 700);
    };
    void start().catch((e) => setError(e instanceof Error ? e.message : '无法打开摄像头'));
    return () => {
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [browserCanScan, scannerOpen]);

  const uploadCardImage = async (file: File, side: 'front' | 'back') => {
    setError('');
    try {
      const url = await uploadImage(file);
      if (side === 'front') setFrontImage(url);
      else setBackImage(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '图片上传失败');
    }
  };

  const openWritingCard = async () => {
    if (!canOpenCard || isOpening) return;
    setIsOpening(true);
    setError('');
    try {
      const data = await apiPost<CreatedWritingCard>('/writing/cards', {
        title: title.trim(),
        content,
        wordCount,
        frontImage,
        backImage,
      });
      setCreated(data);
      setExported(false);
      await loadCards();
    } catch (e) {
      setError(e instanceof Error ? e.message : '开卡失败');
    } finally {
      setIsOpening(false);
    }
  };

  const exportCreatedCard = async () => {
    if (!created || !frontRef.current || !backRef.current) return;
    setIsExporting(true);
    try {
      const zip = new JSZip();
      for (const [label, element] of [['front', frontRef.current], ['back', backRef.current]] as const) {
        const canvas = await html2canvas(element, { backgroundColor: '#f8fafc', scale: 2.6, useCORS: true, allowTaint: true });
        const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
        zip.file(`${created.cardNumber}-${label}.png`, blob);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${created.cardNumber}-writing-card.zip`;
      link.click();
      URL.revokeObjectURL(url);
      setExported(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  const finishCreatedCard = async () => {
    if (!created) return;
    await apiPost(`/writing/cards/${created.id}/finish`, {});
    setCreated(null);
    setTitle('');
    setContent('');
    setFrontImage(null);
    setBackImage(null);
    setExported(false);
    await loadCards();
  };

  const revealHash = async (cardId: string) => {
    setError('');
    try {
      const data = await apiPost<{ qrHash: string }>(`/writing/cards/${cardId}/reveal`, { password: adminPassword });
      setRevealedHashes((current) => ({ ...current, [cardId]: data.qrHash }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '查看哈希失败');
    }
  };

  const readWritingCard = async () => {
    if (!readCode.trim()) return;
    setIsReading(true);
    setShowArticle(false);
    setError('');
    try {
      const data = await apiPost<{ card: ReadWritingCard }>('/writing/read', { code: readCode.trim() });
      setReadCard(data.card);
      window.setTimeout(() => setShowArticle(true), 1450);
    } catch (e) {
      setError(e instanceof Error ? e.message : '读卡失败');
      setReadCard(null);
    } finally {
      setIsReading(false);
    }
  };

  const createdPreview = created ? {
    cardNumber: created.cardNumber,
    issueDate: created.issueDate,
    qrHash: created.qrHash,
  } : null;

  return (
    <div className="relative min-h-full overflow-hidden rounded-[2rem] bg-[#f4efe6] p-4 text-stone-950 lg:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(245,158,11,.28),transparent_26%),radial-gradient(circle_at_88%_16%,rgba(20,184,166,.2),transparent_30%),linear-gradient(135deg,rgba(255,255,255,.75),transparent_48%)]" />
      <div className="relative z-10 space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-stone-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-100">
              <Sparkles size={14} /> Writing Card Forge
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-tight lg:text-5xl">把 2000 字铸成一张实体纪念卡</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              这里按“排除符号后的字数”计算。系统能确认字数与归档，手写/非 AI 的规则先作为你和自己的契约保留。
            </p>
          </div>
          <div className="rounded-3xl border border-stone-300/70 bg-white/65 p-4 shadow-xl shadow-stone-900/5 backdrop-blur">
            <div className="text-xs uppercase tracking-[0.2em] text-stone-500">Progress</div>
            <div className="mt-1 text-3xl font-black">{wordCount.toLocaleString()} / {CARD_TARGET_WORDS}</div>
            <div className="mt-3 h-3 w-64 overflow-hidden rounded-full bg-stone-200">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-teal-500" animate={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,.9fr)]">
          <section className="rounded-[2rem] border border-white/70 bg-white/70 p-5 shadow-2xl shadow-stone-900/8 backdrop-blur">
            <div className="mb-4 flex items-center gap-2">
              <PenLine className="text-amber-600" />
              <h3 className="text-xl font-black">写作页</h3>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="文章标题 / 卡片标题"
              className="w-full rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-lg font-bold outline-none transition focus:border-amber-400"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="在这里写。标点和符号不会计入开卡字数。"
              className="mt-4 min-h-[360px] w-full resize-y rounded-2xl border border-stone-200 bg-[#fffaf1]/90 px-4 py-4 leading-7 outline-none transition focus:border-amber-400"
            />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(['front', 'back'] as const).map((side) => (
                <label key={side} className="flex cursor-pointer items-center justify-between rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-600 transition hover:border-amber-400 hover:bg-amber-50">
                  <span className="flex items-center gap-2"><Image size={16} />上传{side === 'front' ? '正面' : '背面'}卡图</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadCardImage(e.target.files[0], side)} />
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={!canOpenCard || isOpening}
              onClick={openWritingCard}
              className={cn(
                'mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-black text-white shadow-xl transition',
                canOpenCard ? 'bg-stone-950 hover:-translate-y-0.5 hover:bg-stone-800' : 'bg-stone-300'
              )}
            >
              {isOpening ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
              满 2000 字后开卡
            </button>
          </section>

          <section className="space-y-5">
            <div className="rounded-[2rem] border border-stone-900/10 bg-stone-950 p-5 text-white shadow-2xl shadow-stone-950/20">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-amber-200/70">Card Preview</div>
                  <h3 className="text-xl font-black">开卡预览</h3>
                </div>
                {created ? <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-black text-stone-950">Hash visible once</span> : <Lock className="text-white/45" />}
              </div>
              <div className="space-y-4">
                <div ref={frontRef}>
                  <WritingCardFace cardNumber={createdPreview?.cardNumber ?? 'WR00000000000000'} title={title || '未命名文章'} issueDate={createdPreview?.issueDate ?? new Date().toISOString().slice(0, 10)} wordCount={wordCount} imageUrl={frontImage} side="front" />
                </div>
                <div ref={backRef}>
                  <WritingCardFace cardNumber={createdPreview?.cardNumber ?? 'WR00000000000000'} title={title || '未命名文章'} issueDate={createdPreview?.issueDate ?? new Date().toISOString().slice(0, 10)} wordCount={wordCount} imageUrl={backImage} side="back" qrHash={createdPreview?.qrHash} />
                </div>
              </div>
              {created && (
                <div className="mt-4 rounded-2xl border border-amber-200/30 bg-amber-200/10 p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-amber-100/70">One-time QR hash</div>
                  <div className="mt-1 break-all font-mono text-lg font-black text-amber-100">{created.qrHash}</div>
                  <p className="mt-2 text-xs leading-5 text-white/60">下载卡片文件并点击“开卡结束”后，普通界面不再显示这串哈希。管理员可在卡片管理里凭密码再次查看。</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button onClick={exportCreatedCard} disabled={isExporting} className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 font-black text-stone-950 transition hover:bg-amber-100">
                      {isExporting ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}下载正反面
                    </button>
                    <button onClick={finishCreatedCard} disabled={!exported} className="flex items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 font-black text-stone-950 transition disabled:cursor-not-allowed disabled:opacity-40">
                      <Check size={18} />开卡结束并锁定
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
          <section className="rounded-[2rem] border border-white/70 bg-white/70 p-5 shadow-xl shadow-stone-900/5 backdrop-blur">
            <div className="mb-4 flex items-center gap-2">
              <ScanLine className="text-teal-600" />
              <h3 className="text-xl font-black">读卡界面</h3>
            </div>
            <div className="flex gap-2">
              <input value={readCode} onChange={(e) => setReadCode(e.target.value)} placeholder="输入 / 粘贴 QR 哈希码或扫码结果" className="min-w-0 flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-3 font-mono outline-none focus:border-teal-400" />
              <button onClick={readWritingCard} disabled={isReading} className="rounded-2xl bg-teal-600 px-5 py-3 font-black text-white transition hover:bg-teal-700 disabled:opacity-50">
                {isReading ? '读取中' : '读卡'}
              </button>
            </div>
            {browserCanScan && (
              <button onClick={() => setScannerOpen((v) => !v)} className="mt-3 flex items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-bold text-teal-700">
                <Camera size={16} />{scannerOpen ? '关闭摄像头' : '打开摄像头扫码'}
              </button>
            )}
            {scannerOpen && <video ref={videoRef} className="mt-3 aspect-video w-full rounded-2xl bg-black object-cover" muted playsInline />}
            <AnimatePresence mode="wait">
              {readCard && (
                <motion.div key={readCard.id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }} className="mt-6">
                  <CardSpinner card={readCard} />
                  {!showArticle ? (
                    <div className="mt-4 text-center text-sm font-semibold text-stone-500">读卡中，卡片正在展开...</div>
                  ) : (
                    <button onClick={() => setShowArticle(true)} className="mt-4 w-full rounded-2xl bg-stone-950 px-4 py-3 font-black text-white">进入文章</button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <section className="rounded-[2rem] border border-white/70 bg-white/70 p-5 shadow-xl shadow-stone-900/5 backdrop-blur">
            <div className="mb-4 flex items-center gap-2">
              <BookOpen className="text-amber-600" />
              <h3 className="text-xl font-black">文章界面</h3>
            </div>
            {readCard && showArticle ? (
              <article className="rounded-3xl bg-[#fffaf1] p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-stone-400">{readCard.card_number} · {readCard.issue_date}</div>
                <h4 className="mt-2 text-3xl font-black">{readCard.title}</h4>
                <div className="mt-2 text-sm text-stone-500">{readCard.word_count.toLocaleString()} counted words · article id {readCard.article_id.slice(0, 8)}</div>
                <div className="mt-5 whitespace-pre-wrap rounded-2xl bg-white/70 p-5 leading-8 text-stone-700">{readCard.content}</div>
              </article>
            ) : (
              <div className="flex min-h-[20rem] items-center justify-center rounded-3xl border border-dashed border-stone-300 text-center text-sm leading-6 text-stone-500">
                扫码或输入哈希后，这里会打开对应文章。<br />实体卡像一把钥匙，文章像被它解封出来。
              </div>
            )}
          </section>
        </div>

        <section className="rounded-[2rem] border border-white/70 bg-white/70 p-5 shadow-xl shadow-stone-900/5 backdrop-blur">
          <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <h3 className="text-xl font-black">卡片管理</h3>
              <p className="mt-1 text-sm text-stone-500">普通列表不返回 QR 哈希；管理员输入密码后可再次查看。</p>
            </div>
            {userTrustLevel >= 3 && (
              <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="管理员密码，用于再次查看哈希" className="rounded-2xl border border-stone-200 bg-white px-4 py-2 text-sm outline-none focus:border-amber-400" />
            )}
          </div>
          {isLoading ? (
            <div className="flex h-32 items-center justify-center"><Loader2 className="animate-spin text-amber-600" /></div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => (
                <div key={card.id} className="rounded-3xl border border-stone-200 bg-white/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs text-stone-400">{card.card_number}</div>
                      <div className="mt-1 font-black">{card.title}</div>
                    </div>
                    <span className={cn('rounded-full px-2.5 py-1 text-xs font-black', card.status === 'printed' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700')}>
                      {card.status === 'printed' ? '已锁定' : '开卡中'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-stone-500">
                    <div>{card.issue_date}</div>
                    <div>{card.word_count.toLocaleString()} 字</div>
                  </div>
                  <div className="mt-3 rounded-2xl bg-stone-100 p-3 font-mono text-xs text-stone-600">
                    {revealedHashes[card.id] ? revealedHashes[card.id] : card.qr_locked ? '******** ******** ********' : '开卡结束前仅本次开卡面板显示'}
                  </div>
                  {userTrustLevel >= 3 && (
                    <button onClick={() => revealHash(card.id)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 px-3 py-2 text-sm font-bold text-stone-700 transition hover:bg-stone-50">
                      {revealedHashes[card.id] ? <EyeOff size={16} /> : <Eye size={16} />}管理员查看哈希
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
