import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Camera, Check, Download, Eye, EyeOff, FileText, Image, Loader2, Lock, PenLine, Save, ScanLine, Sparkles, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiDelete, apiGet, apiPost } from '../lib/api';
import { uploadImage } from '../lib/image';
import { cn } from '../lib/utils';

const CARD_TARGET_WORDS = 2000;
const AUTO_DRAFT_ID = 'auto-writing-draft';
const AUTO_SAVE_INTERVAL_MS = 30000;

interface WritingCardsProps {
  userTrustLevel?: number;
}

interface WritingCard {
  id: string;
  card_number: string;
  article_id: string;
  title: string;
  summary: string | null;
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

interface WritingDraft {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  word_count: number;
  front_image: string | null;
  back_image: string | null;
  created_at: string;
  updated_at: string;
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
  summary: string | null;
  front_image: string | null;
  back_image: string | null;
  issue_date: string;
  article_id: string;
  content: string;
  encrypted_content?: string | null;
  content_iv?: string | null;
  encryption_version?: number;
  word_count: number;
  article_created_at: string;
}

interface WritingProgressLog {
  id: string;
  draft_id: string | null;
  card_id: string | null;
  title: string;
  word_count: number;
  event_type: 'auto_save' | 'draft_save' | 'card_opened' | string;
  created_at: string;
}

interface WritingProgressCard {
  id: string;
  card_number: string;
  title: string;
  status: string;
  created_at: string;
  printed_at: string | null;
  word_count: number;
}

function countWritingWords(text: string): number {
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
  const withoutCjk = text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, ' ');
  const latin = withoutCjk.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g)?.length ?? 0;
  return cjk + latin;
}

function formatCardNumber(value: string): string {
  if (value.startsWith('WR')) {
    const numeric = value.slice(2).replace(/\D/g, '');
    if (numeric) return `WR ${numeric.replace(/(.{4})/g, '$1 ').trim()}`;
  }
  return value.replace(/(.{4})/g, '$1 ').trim();
}

function dateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatShortDate(key: string): string {
  const [, month, day] = key.split('-');
  return `${Number(month)}/${Number(day)}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function createQrSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes).toUpperCase();
}

async function importArticleKey(qrSecret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(qrSecret.trim().toUpperCase()));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptArticleContent(content: string, qrSecret: string): Promise<{ encryptedContent: string; contentIv: string }> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await importArticleKey(qrSecret);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(content));
  return {
    encryptedContent: bytesToBase64(new Uint8Array(encrypted)),
    contentIv: bytesToBase64(iv),
  };
}

async function decryptArticleContent(encryptedContent: string, contentIv: string, qrSecret: string): Promise<string> {
  const key = await importArticleKey(qrSecret);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(contentIv) },
    key,
    base64ToBytes(encryptedContent)
  );
  return new TextDecoder().decode(decrypted);
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

function InlineTagText({ children }: { children: React.ReactNode }) {
  return (
    <>
      {React.Children.map(children, (child) => {
        if (typeof child !== 'string') return child;
        return child.split(/(#[\p{L}\p{N}_-]{1,32})/gu).map((part, index) => (
          /^#[\p{L}\p{N}_-]{1,32}$/u.test(part) ? (
            <span key={`${part}-${index}`} className="mx-0.5 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-sm font-black text-amber-700 ring-1 ring-amber-200">
              {part}
            </span>
          ) : part
        ));
      })}
    </>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="rounded-3xl bg-white/75 p-5 leading-8 text-stone-700 shadow-inner shadow-stone-900/5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-5 mt-7 text-center text-4xl font-black tracking-tight text-stone-950 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-4 mt-7 text-center text-3xl font-black tracking-tight text-stone-900 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-3 mt-6 text-center text-2xl font-black text-stone-900 first:mt-0">{children}</h3>,
          p: ({ children }) => <p className="my-4 whitespace-pre-wrap"><InlineTagText>{children}</InlineTagText></p>,
          ul: ({ children }) => <ul className="my-4 list-disc space-y-2 pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="my-4 list-decimal space-y-2 pl-6">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="my-5 border-l-4 border-amber-400 bg-amber-50/70 py-2 pl-4 text-stone-600">{children}</blockquote>,
          code: ({ children }) => <code className="rounded-lg bg-stone-900 px-1.5 py-1 text-sm text-amber-100">{children}</code>,
          pre: ({ children }) => <pre className="my-5 overflow-x-auto rounded-2xl bg-stone-950 p-4 text-sm text-amber-100">{children}</pre>,
          table: ({ children }) => <div className="my-5 overflow-x-auto"><table className="w-full border-collapse text-sm">{children}</table></div>,
          th: ({ children }) => <th className="border border-stone-200 bg-stone-100 px-3 py-2 text-left font-black">{children}</th>,
          td: ({ children }) => <td className="border border-stone-200 px-3 py-2">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createExportCardFace({
  side,
  cardNumber,
  title,
  summary,
  issueDate,
  wordCount,
  imageUrl,
  qrHash,
}: {
  side: 'front' | 'back';
  cardNumber: string;
  title: string;
  summary: string;
  issueDate: string;
  wordCount: number;
  imageUrl: string | null;
  qrHash: string;
}): HTMLDivElement {
  const container = document.createElement('div');
  container.style.cssText = 'width:600px;height:400px;position:fixed;left:-9999px;top:-9999px;background:#f8fafc;z-index:-1;';

  const face = document.createElement('div');
  face.style.cssText = [
    'width:600px',
    'height:400px',
    'position:relative',
    'overflow:hidden',
    'border-radius:28px',
    'font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'color:#ffffff',
    'background:radial-gradient(circle at 20% 10%,#fef3c7 0,#f97316 22%,transparent 43%),linear-gradient(135deg,#18222f,#35505d 46%,#d3a55f)',
  ].join(';');

  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.crossOrigin = 'anonymous';
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(1.12) saturate(1.08);';
    face.appendChild(img);
  }

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.18),rgba(0,0,0,.06) 44%,rgba(0,0,0,.56));';
  face.appendChild(overlay);

  const shine = document.createElement('div');
  shine.style.cssText = 'position:absolute;inset:0;background:linear-gradient(120deg,transparent 0,rgba(255,255,255,.16) 18%,transparent 36%);';
  face.appendChild(shine);

  const content = document.createElement('div');
  content.style.cssText = 'position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;justify-content:space-between;padding:28px;box-sizing:border-box;';

  if (side === 'front') {
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:24px;align-items:flex-start;">
        <div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:4px;color:rgba(255,255,255,.68);">Writing Relic</div>
          <div style="margin-top:12px;max-width:430px;font-size:34px;font-weight:900;line-height:1.05;text-shadow:0 8px 24px rgba(0,0,0,.38);">${escapeHtml(title || 'Untitled Article')}</div>
        </div>
      </div>
      <div>
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:24px;font-weight:800;letter-spacing:5px;text-shadow:0 5px 18px rgba(0,0,0,.36);">${formatCardNumber(cardNumber)}</div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.28);display:flex;justify-content:space-between;font-size:13px;color:rgba(255,255,255,.78);">
          <span>${escapeHtml(issueDate)}</span>
          <span>${wordCount.toLocaleString()} words sealed</span>
        </div>
      </div>`;
  } else {
    content.innerHTML = `
      <div style="border:1px solid rgba(255,255,255,.22);background:rgba(0,0,0,.26);border-radius:22px;padding:18px;">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:3px;color:rgba(255,255,255,.58);">Article Note</div>
        <div style="margin-top:10px;font-size:21px;font-weight:800;line-height:1.45;color:rgba(255,255,255,.94);text-shadow:0 6px 18px rgba(0,0,0,.28);">${escapeHtml(summary || 'No summary written for this card.')}</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;">
        <div>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=92x92&data=${encodeURIComponent(qrHash)}&format=png&margin=2" crossorigin="anonymous" alt="QR" style="width:92px;height:92px;background:#ffffff;border-radius:12px;padding:7px;box-shadow:0 12px 28px rgba(0,0,0,.26);" />
          <div style="margin-top:7px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,.56);">Scan to read</div>
        </div>
        <div style="min-width:0;max-width:330px;text-align:right;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:3px;color:rgba(255,255,255,.58);">Card No.</div>
          <div style="margin-top:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:14px;font-weight:800;letter-spacing:1px;line-height:1.35;overflow-wrap:anywhere;">${escapeHtml(formatCardNumber(cardNumber))}</div>
        </div>
      </div>`;
  }

  face.appendChild(content);
  container.appendChild(face);
  document.body.appendChild(container);
  return container;
}

function WritingCardFace({
  cardNumber,
  title,
  summary,
  issueDate,
  wordCount,
  imageUrl,
  side,
  qrHash,
}: {
  cardNumber: string;
  title: string;
  summary?: string | null;
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
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55">Article Note</div>
            <div className="mt-2 text-lg font-black leading-snug text-white drop-shadow">{summary || 'No summary written for this card.'}</div>
          </div>
          <div className="flex items-end justify-between gap-4">
            {qrHash ? (
              <div>
                <QRCodeImage value={qrHash} />
                <div className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/55">Scan to read</div>
              </div>
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-white/20 bg-black/25 text-center text-[10px] uppercase tracking-[0.2em] text-white/55">
                QR Locked
              </div>
            )}
            <div className="min-w-0 max-w-[12rem] text-right">
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/55">Card No.</div>
              <div className="mt-1 break-words font-mono text-xs font-bold leading-snug tracking-wide">{formatCardNumber(cardNumber)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CardSpinner({ card, onOpen }: { card: ReadWritingCard; onOpen: () => void }) {
  return (
    <div className="mx-auto max-w-sm" style={{ perspective: '1100px' }}>
      <motion.div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onOpen();
        }}
        initial={{ rotateY: -90, y: 30, opacity: 0, scale: 0.86 }}
        animate={{ rotateY: 360, y: 0, opacity: 1, scale: 1 }}
        transition={{ rotateY: { duration: 12, repeat: Infinity, ease: 'linear' }, opacity: { duration: 0.4 }, scale: { duration: 0.6 }, y: { duration: 0.6 } }}
        style={{ transformStyle: 'preserve-3d' }}
        className="relative aspect-[3/2] cursor-pointer outline-none transition hover:scale-[1.02] focus-visible:ring-4 focus-visible:ring-teal-300"
      >
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
          <WritingCardFace
            cardNumber={card.card_number}
            title={card.title}
            summary={card.summary}
            issueDate={card.issue_date}
            wordCount={card.word_count}
            imageUrl={card.front_image}
            side="front"
          />
        </div>
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
          <WritingCardFace
            cardNumber={card.card_number}
            title={card.title}
            summary={card.summary}
            issueDate={card.issue_date}
            wordCount={card.word_count}
            imageUrl={card.back_image}
            side="back"
          />
        </div>
      </motion.div>
    </div>
  );
}

function WritingCardSpinPreview({
  cardNumber,
  title,
  summary,
  issueDate,
  wordCount,
  frontImage,
  backImage,
  qrHash,
  duration,
}: {
  cardNumber: string;
  title: string;
  summary: string;
  issueDate: string;
  wordCount: number;
  frontImage: string | null;
  backImage: string | null;
  qrHash?: string;
  duration: number;
}) {
  return (
    <div className="mx-auto max-w-sm py-5" style={{ perspective: '1100px' }}>
      <motion.div
        animate={{ rotateY: 360 }}
        transition={{ duration, repeat: Infinity, ease: 'linear' }}
        style={{ transformStyle: 'preserve-3d' }}
        className="relative aspect-[3/2]"
      >
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
          <WritingCardFace cardNumber={cardNumber} title={title} summary={summary} issueDate={issueDate} wordCount={wordCount} imageUrl={frontImage} side="front" />
        </div>
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
          <WritingCardFace cardNumber={cardNumber} title={title} summary={summary} issueDate={issueDate} wordCount={wordCount} imageUrl={backImage} side="back" qrHash={qrHash} />
        </div>
      </motion.div>
    </div>
  );
}

function WritingProgressDashboard({
  logs,
  cards,
  drafts,
  currentTitle,
  currentWordCount,
  activeDraftId,
}: {
  logs: WritingProgressLog[];
  cards: WritingProgressCard[];
  drafts: WritingDraft[];
  currentTitle: string;
  currentWordCount: number;
  activeDraftId: string | null;
}) {
  const today = dateKey(new Date());
  const visual = useMemo(() => {
    const snapshots = logs.map((log) => ({
      projectId: log.card_id ?? log.draft_id ?? log.id,
      title: log.title || '未命名文章',
      date: dateKey(log.created_at),
      time: log.created_at,
      wordCount: Number(log.word_count ?? 0),
      eventType: log.event_type,
      draftId: log.draft_id,
      cardId: log.card_id,
    }));

    if (currentWordCount > 0) {
      snapshots.push({
        projectId: activeDraftId ?? 'live-editor',
        title: currentTitle.trim() || '当前编辑',
        date: today,
        time: new Date().toISOString(),
        wordCount: currentWordCount,
        eventType: 'live',
        draftId: activeDraftId,
        cardId: null,
      });
    }

    for (const card of cards) {
      const hasLog = snapshots.some((snapshot) => snapshot.cardId === card.id);
      if (!hasLog) {
        snapshots.push({
          projectId: card.id,
          title: card.title,
          date: dateKey(card.created_at),
          time: card.created_at,
          wordCount: Number(card.word_count ?? 0),
          eventType: 'legacy_card',
          draftId: null,
          cardId: card.id,
        });
      }
    }

    const perDayProject = new Map<string, Map<string, number>>();
    for (const snapshot of snapshots) {
      if (!perDayProject.has(snapshot.date)) perDayProject.set(snapshot.date, new Map());
      const projectMap = perDayProject.get(snapshot.date)!;
      projectMap.set(snapshot.projectId, Math.max(projectMap.get(snapshot.projectId) ?? 0, snapshot.wordCount));
    }

    const chartDays = Array.from({ length: 30 }, (_, index) => dateKey(addDays(new Date(), index - 29)));
    const chartData = chartDays.map((day, index) => {
      const total = Array.from(perDayProject.get(day)?.values() ?? []).reduce((sum, value) => sum + value, 0);
      const prevDay = chartDays[index - 1];
      const prevTotal = prevDay ? Array.from(perDayProject.get(prevDay)?.values() ?? []).reduce((sum, value) => sum + value, 0) : 0;
      return {
        date: day,
        label: formatShortDate(day),
        words: total,
        gain: Math.max(0, total - prevTotal),
      };
    });

    const heatmapDays = Array.from({ length: 56 }, (_, index) => {
      const day = dateKey(addDays(new Date(), index - 55));
      const words = Array.from(perDayProject.get(day)?.values() ?? []).reduce((sum, value) => sum + value, 0);
      const intensity = words >= CARD_TARGET_WORDS ? 4 : words >= 1200 ? 3 : words >= 600 ? 2 : words > 0 ? 1 : 0;
      return { date: day, words, intensity };
    });

    const timelines = cards.slice(0, 8).map((card) => {
      const openedLog = snapshots.find((snapshot) => snapshot.cardId === card.id);
      const related = snapshots
        .filter((snapshot) => snapshot.cardId === card.id || (openedLog?.draftId && snapshot.draftId === openedLog.draftId))
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      const points = related.length ? related : [{
        projectId: card.id,
        title: card.title,
        date: dateKey(card.created_at),
        time: card.created_at,
        wordCount: card.word_count,
        eventType: 'legacy_card',
        draftId: null,
        cardId: card.id,
      }];
      return { id: card.id, title: card.title, cardNumber: card.card_number, points };
    });

    const draftTimelines = drafts.slice(0, 4).map((draft) => {
      const points = snapshots
        .filter((snapshot) => snapshot.draftId === draft.id)
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      if (!points.length) {
        points.push({
          projectId: draft.id,
          title: draft.title || '未命名草稿',
          date: dateKey(draft.updated_at),
          time: draft.updated_at,
          wordCount: draft.word_count,
          eventType: 'draft',
          draftId: draft.id,
          cardId: null,
        });
      }
      return { id: draft.id, title: draft.title || '未命名草稿', cardNumber: 'DRAFT', points };
    });

    return {
      chartData,
      heatmapDays,
      timelines: [...draftTimelines, ...timelines].slice(0, 10),
      totalCards: cards.length,
      activeDrafts: drafts.length,
      bestDay: [...perDayProject.entries()]
        .map(([date, values]) => ({ date, words: Array.from(values.values()).reduce((sum, value) => sum + value, 0) }))
        .sort((a, b) => b.words - a.words)[0],
    };
  }, [activeDraftId, cards, currentTitle, currentWordCount, drafts, logs, today]);

  const heatColors = ['bg-stone-200/80', 'bg-amber-200', 'bg-orange-300', 'bg-orange-500', 'bg-red-600'];

  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-[#fffaf1]/80 p-5 shadow-xl shadow-stone-900/5 backdrop-blur-xl">
      <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.24em] text-amber-600/70">Writing Telemetry</div>
          <h3 className="mt-1 text-2xl font-black text-stone-950">每天进度可视化</h3>
          <p className="mt-1 text-sm font-semibold text-stone-500">保存草稿和铸卡时会记录快照，删除草稿后时间线仍保留。</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-white/70 px-3 py-2">
            <div className="text-lg font-black text-stone-950">{visual.totalCards}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Cards</div>
          </div>
          <div className="rounded-2xl bg-white/70 px-3 py-2">
            <div className="text-lg font-black text-stone-950">{visual.activeDrafts}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Drafts</div>
          </div>
          <div className="rounded-2xl bg-white/70 px-3 py-2">
            <div className="text-lg font-black text-stone-950">{visual.bestDay?.words.toLocaleString() ?? 0}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Best Day</div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-3xl border border-white/70 bg-white/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-black text-stone-800">近 30 天字数折线</div>
            <div className="text-xs font-bold text-stone-400">当天最高草稿快照汇总</div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={visual.chartData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7dcc8" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#78716c' }} interval={4} />
                <YAxis tick={{ fontSize: 11, fill: '#78716c' }} />
                <Tooltip
                  formatter={(value: number, name) => [Number(value).toLocaleString(), name === 'words' ? '当日字数' : '新增字数']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
                />
                <Line type="monotone" dataKey="words" stroke="#1c1917" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="gain" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl border border-white/70 bg-stone-950 p-4 text-white">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-black">写作热图</div>
            <div className="text-xs font-bold text-white/45">近 56 天</div>
          </div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
            {visual.heatmapDays.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.words.toLocaleString()} 字`}
                className={cn('aspect-square rounded-[0.45rem] ring-1 ring-white/10', heatColors[day.intensity])}
              />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs font-bold text-white/45">
            <span>Less</span>
            <div className="flex gap-1">
              {heatColors.map((color) => <span key={color} className={cn('h-3 w-3 rounded-sm', color)} />)}
            </div>
            <span>More</span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {visual.timelines.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white/50 p-6 text-sm font-semibold text-stone-400">
            还没有可视化数据。保存一次草稿后，这里就会开始长出轨迹。
          </div>
        ) : visual.timelines.map((timeline) => {
          const last = timeline.points[timeline.points.length - 1];
          const pct = Math.min(100, (last.wordCount / CARD_TARGET_WORDS) * 100);
          return (
            <div key={`${timeline.cardNumber}-${timeline.id}`} className="rounded-3xl border border-white/70 bg-white/65 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-black text-stone-900">{timeline.title}</div>
                  <div className="mt-1 font-mono text-xs text-stone-400">{timeline.cardNumber}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-stone-950">{last.wordCount.toLocaleString()}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">words</div>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-stone-950" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-3 flex items-center gap-1 overflow-hidden">
                {timeline.points.slice(-10).map((point, index) => (
                  <div key={`${point.time}-${index}`} className="flex min-w-0 flex-1 flex-col items-center">
                    <div className={cn('h-3 w-3 rounded-full', point.eventType === 'card_opened' ? 'bg-stone-950' : 'bg-amber-400')} />
                    <div className="mt-1 max-w-full truncate text-[10px] font-bold text-stone-400">{formatShortDate(point.date)}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function WritingCards({ userTrustLevel = 1 }: WritingCardsProps) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [cards, setCards] = useState<WritingCard[]>([]);
  const [drafts, setDrafts] = useState<WritingDraft[]>([]);
  const [progressLogs, setProgressLogs] = useState<WritingProgressLog[]>([]);
  const [progressCards, setProgressCards] = useState<WritingProgressCard[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedWritingCard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [exported, setExported] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [revealedHashes, setRevealedHashes] = useState<Record<string, string>>({});
  const [readCode, setReadCode] = useState('');
  const [readCard, setReadCard] = useState<ReadWritingCard | null>(null);
  const [articleCard, setArticleCard] = useState<ReadWritingCard | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isPreviewingMarkdown, setIsPreviewingMarkdown] = useState(false);
  const [previewMode, setPreviewMode] = useState<'static' | 'spin'>('static');
  const [spinPreviewDuration, setSpinPreviewDuration] = useState(14);
  const [isImmersiveWriting, setIsImmersiveWriting] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frontRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLDivElement | null>(null);
  const latestDraftRef = useRef({
    title: '',
    summary: '',
    content: '',
    wordCount: 0,
    frontImage: null as string | null,
    backImage: null as string | null,
  });
  const wordCount = useMemo(() => countWritingWords(content), [content]);
  const progress = Math.min(100, (wordCount / CARD_TARGET_WORDS) * 100);
  const canOpenCard = wordCount >= CARD_TARGET_WORDS && title.trim() && content.trim();
  const browserCanScan = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

  const loadWritingData = async () => {
    setIsLoading(true);
    try {
      const [cardData, draftData, progressData] = await Promise.all([
        apiGet<{ cards: WritingCard[] }>('/writing/cards'),
        apiGet<{ drafts: WritingDraft[] }>('/writing/drafts'),
        apiGet<{ logs: WritingProgressLog[]; cards: WritingProgressCard[] }>('/writing/progress'),
      ]);
      setCards(cardData.cards);
      setDrafts(draftData.drafts);
      setProgressLogs(progressData.logs);
      setProgressCards(progressData.cards);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载写作卡失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadWritingData();
  }, []);

  useEffect(() => {
    latestDraftRef.current = { title, summary, content, wordCount, frontImage, backImage };
  }, [title, summary, content, wordCount, frontImage, backImage]);

  useEffect(() => {
    if (!isImmersiveWriting) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isImmersiveWriting]);

  const saveAutoDraft = async () => {
    const snapshot = latestDraftRef.current;
    const hasContent = snapshot.title.trim() || snapshot.summary.trim() || snapshot.content.trim() || snapshot.frontImage || snapshot.backImage;
    if (!hasContent) return;
    setIsAutoSaving(true);
    try {
      await apiPost<{ ok: boolean; id: string }>('/writing/drafts', {
        id: AUTO_DRAFT_ID,
        title: snapshot.title.trim() || '自动存档的草稿',
        summary: snapshot.summary.trim(),
        content: snapshot.content,
        wordCount: snapshot.wordCount,
        frontImage: snapshot.frontImage,
        backImage: snapshot.backImage,
      });
      setLastAutoSavedAt(new Date().toISOString());
      const draftData = await apiGet<{ drafts: WritingDraft[] }>('/writing/drafts');
      setDrafts(draftData.drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : '自动存档失败');
    } finally {
      setIsAutoSaving(false);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      void saveAutoDraft();
    }, AUTO_SAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!scannerOpen) return;
    if (!browserCanScan) {
      setError('当前浏览器不支持原生二维码扫码。可以用系统相机/微信扫码后，把识别出的哈希码粘贴到输入框。');
      setScannerOpen(false);
      return;
    }
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

  const clearEditor = () => {
    setActiveDraftId(null);
    setTitle('');
    setSummary('');
    setContent('');
    setFrontImage(null);
    setBackImage(null);
    setExported(false);
    setCreated(null);
    setIsPreviewingMarkdown(false);
    setPreviewMode('static');
  };

  const saveDraft = async () => {
    setIsSavingDraft(true);
    setError('');
    try {
      const data = await apiPost<{ ok: boolean; id: string }>('/writing/drafts', {
        id: activeDraftId,
        title: title.trim(),
        summary: summary.trim(),
        content,
        wordCount,
        frontImage,
        backImage,
      });
      setActiveDraftId(data.id);
      const draftData = await apiGet<{ drafts: WritingDraft[] }>('/writing/drafts');
      setDrafts(draftData.drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存草稿失败');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const loadDraft = (draft: WritingDraft) => {
    setActiveDraftId(draft.id);
    setTitle(draft.title);
    setSummary(draft.summary ?? '');
    setContent(draft.content);
    setFrontImage(draft.front_image);
    setBackImage(draft.back_image);
    setCreated(null);
    setExported(false);
  };

  const deleteDraft = async (draftId: string) => {
    if (!window.confirm('确定删除这份草稿吗？')) return;
    setError('');
    try {
      await apiDelete(`/writing/drafts/${draftId}`);
      setDrafts((current) => current.filter((draft) => draft.id !== draftId));
      if (activeDraftId === draftId) clearEditor();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除草稿失败');
    }
  };

  const openWritingCard = async () => {
    if (!canOpenCard || isOpening) return;
    setIsOpening(true);
    setError('');
    try {
      const qrSecret = createQrSecret();
      const qrHashVerifier = await sha256Hex(qrSecret);
      const encrypted = await encryptArticleContent(content, qrSecret);
      const data = await apiPost<Omit<CreatedWritingCard, 'qrHash'> & { qrHash?: string | null }>('/writing/cards', {
        title: title.trim(),
        summary: summary.trim(),
        wordCount,
        frontImage,
        backImage,
        encryptedContent: encrypted.encryptedContent,
        contentIv: encrypted.contentIv,
        encryptionVersion: 1,
        qrHashVerifier,
        draftId: activeDraftId,
      });
      setCreated({ ...data, qrHash: qrSecret });
      setExported(false);
      setPreviewMode('static');
      await loadWritingData();
    } catch (e) {
      setError(e instanceof Error ? e.message : '开卡失败');
    } finally {
      setIsOpening(false);
    }
  };

  const exportCreatedCard = async () => {
    if (!created) return;
    setIsExporting(true);
    try {
      const zip = new JSZip();
      for (const side of ['front', 'back'] as const) {
        const element = createExportCardFace({
          side,
          cardNumber: created.cardNumber,
          title: title || 'Untitled Article',
          summary,
          issueDate: created.issueDate,
          wordCount,
          imageUrl: side === 'front' ? frontImage : backImage,
          qrHash: created.qrHash,
        });
        try {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          const canvas = await html2canvas(element, {
            backgroundColor: '#f8fafc',
            scale: 2.6,
            useCORS: true,
            allowTaint: true,
            width: 600,
            height: 400,
          });
          const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
          zip.file(`${created.cardNumber}-${side}.png`, blob);
        } finally {
          document.body.removeChild(element);
        }
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
    setActiveDraftId(null);
    setTitle('');
    setSummary('');
    setContent('');
    setFrontImage(null);
    setBackImage(null);
    setExported(false);
    setPreviewMode('static');
    await loadWritingData();
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

  const deleteWritingCard = async (cardId: string) => {
    if (!adminPassword) {
      setError('请输入管理员密码后再删除卡片');
      return;
    }
    if (!window.confirm('确定删除这张写作卡和对应文章吗？这个操作不能撤销。')) return;
    setError('');
    try {
      const res = await fetch(`/api/writing/cards/${cardId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      if (!res.ok) throw new Error(await res.text());
      setCards((current) => current.filter((card) => card.id !== cardId));
      setRevealedHashes((current) => {
        const next = { ...current };
        delete next[cardId];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除写作卡失败');
    }
  };

  const readWritingCard = async () => {
    if (!readCode.trim()) return;
    setIsReading(true);
    setError('');
    try {
      const data = await apiPost<{ card: ReadWritingCard }>('/writing/read', { code: readCode.trim() });
      let card = data.card;
      if ((card.encryption_version ?? 0) >= 1) {
        if (!card.encrypted_content || !card.content_iv) throw new Error('Encrypted article payload is incomplete');
        const decrypted = await decryptArticleContent(card.encrypted_content, card.content_iv, readCode.trim());
        card = { ...card, content: decrypted };
      }
      setReadCard(card);
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

  if (articleCard) {
    return (
      <div className="relative min-h-full overflow-hidden rounded-[2rem] bg-[#f4efe6] p-4 text-stone-950 lg:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(245,158,11,.28),transparent_26%),radial-gradient(circle_at_88%_16%,rgba(20,184,166,.2),transparent_30%),linear-gradient(135deg,rgba(255,255,255,.75),transparent_48%)]" />
        <article className="relative z-10 mx-auto max-w-5xl">
          <button
            type="button"
            onClick={() => setArticleCard(null)}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/75 px-4 py-2 text-sm font-black text-stone-700 shadow-sm transition hover:bg-white"
          >
            <ArrowLeft size={16} />返回读卡
          </button>
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
            className="rounded-[2rem] border border-white/70 bg-[#fffaf1]/90 p-5 shadow-2xl shadow-stone-900/10 backdrop-blur lg:p-8"
          >
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="text-center text-xs uppercase tracking-[0.22em] text-stone-400">
              {articleCard.card_number} · {articleCard.issue_date}
            </motion.div>
            <motion.h2 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="mt-3 text-center text-4xl font-black tracking-tight text-stone-950 lg:text-6xl">
              {articleCard.title}
            </motion.h2>
            {articleCard.summary && (
              <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }} className="mx-auto mt-4 max-w-3xl text-center text-lg font-bold leading-8 text-stone-600">
                {articleCard.summary}
              </motion.p>
            )}
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }} className="mt-4 text-center text-sm text-stone-500">
              {articleCard.word_count.toLocaleString()} counted words · article id {articleCard.article_id.slice(0, 8)}
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42, duration: 0.5 }} className="mt-8">
              <MarkdownContent content={articleCard.content} />
            </motion.div>
          </motion.div>
        </article>
      </div>
    );
  }

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

        {isImmersiveWriting && createPortal(
          <div className="fixed inset-0 z-[1000] h-dvh overflow-hidden bg-stone-950/55 p-3 backdrop-blur-xl lg:p-6">
            <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-[#fffaf1]/90 p-4 shadow-2xl shadow-stone-950/30 backdrop-blur-2xl lg:p-6">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-amber-600">Immersive Writing</div>
                  <div className="mt-1 text-2xl font-black text-stone-950">{wordCount.toLocaleString()} / {CARD_TARGET_WORDS}</div>
                  <div className="mt-2 h-2 w-56 max-w-full overflow-hidden rounded-full bg-stone-200">
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-teal-500" animate={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void saveDraft()} disabled={isSavingDraft} className="inline-flex items-center gap-2 rounded-full bg-stone-950 px-4 py-2 text-xs font-black text-white transition hover:bg-stone-800 disabled:opacity-50">
                    {isSavingDraft ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}保存草稿
                  </button>
                  <button type="button" onClick={() => void saveAutoDraft()} disabled={isAutoSaving} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-700 transition hover:bg-amber-100 disabled:opacity-50">
                    {isAutoSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}自动存档一次
                  </button>
                  <button type="button" onClick={() => setIsImmersiveWriting(false)} className="rounded-full border border-stone-200 bg-white/75 px-4 py-2 text-xs font-black text-stone-700 transition hover:bg-white">
                    退出沉浸
                  </button>
                </div>
              </div>
              <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_1.1fr]">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="文章标题 / 卡片标题"
                  className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-lg font-bold outline-none backdrop-blur-xl transition focus:border-amber-400"
                />
                <input
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  maxLength={90}
                  placeholder="卡片背面摘要"
                  className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm font-semibold outline-none backdrop-blur-xl transition focus:border-amber-400"
                />
              </div>
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsPreviewingMarkdown((value) => !value)}
                  className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-black text-stone-600 transition hover:bg-amber-50"
                >
                  {isPreviewingMarkdown ? '编辑 Markdown' : '预览 Markdown'}
                </button>
              </div>
              {isPreviewingMarkdown ? (
                <div className="min-h-0 flex-1 overflow-y-auto rounded-3xl border border-white/70 bg-white/50 p-4 backdrop-blur-xl">
                  {content.trim() ? <MarkdownContent content={content} /> : <div className="flex h-72 items-center justify-center text-sm font-semibold text-stone-400">还没有内容可以预览</div>}
                </div>
              ) : (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="在这里专心写 Markdown..."
                  className="min-h-0 flex-1 resize-none rounded-3xl border border-white/70 bg-white/50 px-4 py-4 text-base leading-8 outline-none backdrop-blur-xl transition focus:border-amber-400"
                />
              )}
              <div className="mt-3 text-xs font-bold text-stone-500">
                {isAutoSaving ? '自动存档中...' : lastAutoSavedAt ? `上次自动存档 ${new Date(lastAutoSavedAt).toLocaleTimeString()}` : '自动存档将在编辑时每 30 秒覆盖一次'}
              </div>
            </div>
          </div>,
          document.body
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,.9fr)]">
          <section className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/45 p-5 shadow-2xl shadow-stone-900/8 backdrop-blur-2xl">
            <div className="pointer-events-none absolute -right-20 top-10 z-0 w-[28rem] rotate-6 opacity-25 blur-[1px] saturate-125">
              <WritingCardFace
                cardNumber={createdPreview?.cardNumber ?? activeDraftId?.slice(0, 16).toUpperCase() ?? 'WRDRAFT000000'}
                title={title || '草稿卡片'}
                summary={summary}
                issueDate={new Date().toISOString().slice(0, 10)}
                wordCount={wordCount}
                imageUrl={frontImage}
                side="front"
              />
            </div>
            <div className="absolute inset-0 z-0 bg-white/45 backdrop-blur-xl" />
            <div className="relative z-10 mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div className="flex items-center gap-2">
                <PenLine className="text-amber-600" />
                <h3 className="text-xl font-black">写作页</h3>
                {activeDraftId && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-700">草稿中</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void saveDraft()} disabled={isSavingDraft} className="inline-flex items-center gap-2 rounded-full bg-stone-950 px-4 py-2 text-xs font-black text-white transition hover:bg-stone-800 disabled:opacity-50">
                  {isSavingDraft ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}保存草稿
                </button>
                <button type="button" onClick={() => setIsImmersiveWriting(true)} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/80 px-4 py-2 text-xs font-black text-amber-700 transition hover:bg-amber-100">
                  <PenLine size={14} />沉浸写作
                </button>
                <button type="button" onClick={clearEditor} className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/75 px-4 py-2 text-xs font-black text-stone-600 transition hover:bg-white">
                  <FileText size={14} />新草稿
                </button>
              </div>
            </div>
            <div className="relative z-10 mb-3 rounded-2xl border border-white/70 bg-white/45 px-4 py-2 text-xs font-bold text-stone-500 backdrop-blur-xl">
              {isAutoSaving ? '自动存档中...' : lastAutoSavedAt ? `自动存档: ${new Date(lastAutoSavedAt).toLocaleTimeString()}` : '自动存档每 30 秒覆盖“自动存档的草稿”'}
            </div>
            <div className="relative z-10 mb-4 rounded-3xl border border-white/70 bg-white/45 p-3 shadow-inner shadow-stone-900/5 backdrop-blur-xl">
              <div className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-stone-400">Drafts</div>
              {drafts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-200 bg-white/45 p-4 text-sm font-semibold text-stone-400">还没有草稿，写一半可以先保存。</div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {drafts.map((draft) => (
                    <div key={draft.id} className={cn('rounded-2xl border p-3 transition', activeDraftId === draft.id ? 'border-amber-300 bg-amber-50/80' : 'border-white/70 bg-white/55 hover:bg-white/80')}>
                      <button type="button" onClick={() => loadDraft(draft)} className="block w-full text-left">
                        <div className="truncate text-sm font-black text-stone-800">
                          {draft.id === AUTO_DRAFT_ID ? '自动存档的草稿' : draft.title || '未命名草稿'}
                        </div>
                        <div className="mt-1 text-xs text-stone-500">{draft.word_count.toLocaleString()} 字 · {new Date(draft.updated_at).toLocaleString()}</div>
                      </button>
                      <button type="button" onClick={() => void deleteDraft(draft.id)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-600">
                        <Trash2 size={13} />删除草稿
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="文章标题 / 卡片标题"
              className="relative z-10 w-full rounded-2xl border border-white/70 bg-white/65 px-4 py-3 text-lg font-bold outline-none backdrop-blur-xl transition focus:border-amber-400"
            />
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={90}
              placeholder="卡片背面摘要：写一句话，像这张卡的题记"
              className="relative z-10 mt-3 w-full rounded-2xl border border-white/70 bg-white/65 px-4 py-3 text-sm font-semibold outline-none backdrop-blur-xl transition focus:border-amber-400"
            />
            <div className="relative z-10 mt-4 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsPreviewingMarkdown((value) => !value)}
                className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-black text-stone-600 transition hover:bg-amber-50"
              >
                {isPreviewingMarkdown ? '编辑 Markdown' : '预览 Markdown'}
              </button>
            </div>
            {isPreviewingMarkdown ? (
              <div className="relative z-10 mt-3 min-h-[360px] rounded-2xl border border-white/70 bg-[#fffaf1]/65 p-4 backdrop-blur-xl">
                {content.trim() ? <MarkdownContent content={content} /> : <div className="flex h-72 items-center justify-center text-sm font-semibold text-stone-400">还没有内容可以预览</div>}
              </div>
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="在这里写 Markdown。标点和符号不会计入开卡字数。"
                className="relative z-10 mt-3 min-h-[360px] w-full resize-y rounded-2xl border border-white/70 bg-[#fffaf1]/65 px-4 py-4 leading-7 outline-none backdrop-blur-xl transition focus:border-amber-400"
              />
            )}
            <div className="relative z-10 mt-4 grid gap-3 md:grid-cols-2">
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
                'relative z-10 mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-black text-white shadow-xl transition',
                canOpenCard ? 'bg-stone-950 hover:-translate-y-0.5 hover:bg-stone-800' : 'bg-stone-300'
              )}
            >
              {isOpening ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
              满 2000 字后开卡
            </button>
          </section>

          <section className="space-y-5">
            <div className="rounded-[2rem] border border-stone-900/10 bg-stone-950 p-5 text-white shadow-2xl shadow-stone-950/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-amber-200/70">Card Preview</div>
                  <h3 className="text-xl font-black">开卡预览</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewMode((mode) => mode === 'static' ? 'spin' : 'static')}
                    className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black text-white transition hover:bg-white/20"
                  >
                    {previewMode === 'static' ? '旋转预览' : '静态预览'}
                  </button>
                  {created ? <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-black text-stone-950">Hash visible once</span> : <Lock className="text-white/45" />}
                </div>
              </div>
              {previewMode === 'spin' ? (
                <div>
                  <WritingCardSpinPreview
                    cardNumber={createdPreview?.cardNumber ?? 'WR00000000000000'}
                    title={title || 'Untitled Article'}
                    summary={summary}
                    issueDate={createdPreview?.issueDate ?? new Date().toISOString().slice(0, 10)}
                    wordCount={wordCount}
                    frontImage={frontImage}
                    backImage={backImage}
                    qrHash={createdPreview?.qrHash}
                    duration={spinPreviewDuration}
                  />
                  <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="mb-2 flex items-center justify-between text-xs font-black text-white/70">
                      <span>旋转速度</span>
                      <span>{spinPreviewDuration.toFixed(1)} 秒 / 圈</span>
                    </div>
                    <input
                      type="range"
                      min="4"
                      max="24"
                      step="0.5"
                      value={spinPreviewDuration}
                      onChange={(e) => setSpinPreviewDuration(Number(e.target.value))}
                      className="w-full accent-amber-300"
                    />
                    <div className="mt-1 flex justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                      <span>Fast</span>
                      <span>Slow</span>
                    </div>
                  </div>
                </div>
              ) : (
              <div className="space-y-4">
                <div ref={frontRef}>
                  <WritingCardFace cardNumber={createdPreview?.cardNumber ?? 'WR00000000000000'} title={title || '未命名文章'} summary={summary} issueDate={createdPreview?.issueDate ?? new Date().toISOString().slice(0, 10)} wordCount={wordCount} imageUrl={frontImage} side="front" />
                </div>
                <div ref={backRef}>
                  <WritingCardFace cardNumber={createdPreview?.cardNumber ?? 'WR00000000000000'} title={title || '未命名文章'} summary={summary} issueDate={createdPreview?.issueDate ?? new Date().toISOString().slice(0, 10)} wordCount={wordCount} imageUrl={backImage} side="back" qrHash={createdPreview?.qrHash} />
                </div>
              </div>
              )}
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

        <WritingProgressDashboard
          logs={progressLogs}
          cards={progressCards}
          drafts={drafts}
          currentTitle={title}
          currentWordCount={wordCount}
          activeDraftId={activeDraftId}
        />

        <div className="grid gap-6">
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
            <button onClick={() => setScannerOpen((v) => !v)} className="mt-3 flex items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-bold text-teal-700">
              <Camera size={16} />{scannerOpen ? '关闭摄像头' : '打开摄像头扫码'}
            </button>
            {scannerOpen && <video ref={videoRef} className="mt-3 aspect-video w-full rounded-2xl bg-black object-cover" muted playsInline />}
            <AnimatePresence mode="wait">
              {readCard && (
                <motion.div key={readCard.id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }} className="mt-6">
                  <CardSpinner card={readCard} onOpen={() => setArticleCard(readCard)} />
                  <div className="mt-4 text-center text-sm font-semibold text-stone-500">卡片已识别。点击旋转卡片进入文章页。</div>
                </motion.div>
              )}
            </AnimatePresence>
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
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button onClick={() => revealHash(card.id)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 px-3 py-2 text-sm font-bold text-stone-700 transition hover:bg-stone-50">
                        {revealedHashes[card.id] ? <EyeOff size={16} /> : <Eye size={16} />}查看哈希
                      </button>
                      <button onClick={() => void deleteWritingCard(card.id)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 px-3 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50">
                        <Trash2 size={16} />删除
                      </button>
                    </div>
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
