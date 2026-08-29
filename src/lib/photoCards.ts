import JSZip from 'jszip';

export interface PhotoCard {
  id: string;
  dayNumber: number;
  title: string;
  openedOn: string;
  frontText: string;
  backText: string;
  frontImageUrl: string | null;
  backImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

const CARD_WIDTH = 1011;
const CARD_HEIGHT = 638;

function drawFallback(ctx: CanvasRenderingContext2D, side: 'front' | 'back') {
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  if (side === 'front') {
    gradient.addColorStop(0, '#0f766e');
    gradient.addColorStop(0.55, '#0f172a');
    gradient.addColorStop(1, '#312e81');
  } else {
    gradient.addColorStop(0, '#312e81');
    gradient.addColorStop(0.55, '#581c87');
    gradient.addColorStop(1, '#9f1239');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`图片读取失败：${response.status}`);
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('图片解码失败'));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawImageCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement) {
  const scale = Math.max(CARD_WIDTH / image.naturalWidth, CARD_HEIGHT / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.drawImage(image, (CARD_WIDTH - width) / 2, (CARD_HEIGHT - height) / 2, width, height);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 4): string[] {
  const lines: string[] = [];
  let line = '';
  for (const char of Array.from(text)) {
    const candidate = line + char;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = char;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function formatCardDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${year}.${month}.${day}`;
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('卡片图片生成失败')), 'image/png');
  });
}

export async function renderPhotoCardSide(card: PhotoCard, side: 'front' | 'back'): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持卡片导出');

  const imageUrl = side === 'front' ? card.frontImageUrl : card.backImageUrl;
  if (imageUrl) drawImageCover(ctx, await loadImage(imageUrl));
  else drawFallback(ctx, side);

  const shade = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  shade.addColorStop(0, 'rgba(2, 6, 23, 0.24)');
  shade.addColorStop(0.52, 'rgba(2, 6, 23, 0.02)');
  shade.addColorStop(1, 'rgba(2, 6, 23, 0.58)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '600 20px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`DAY ${String(card.dayNumber).padStart(2, '0')}`, 48, 42);
  ctx.textAlign = 'right';
  ctx.font = '500 18px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(formatCardDate(card.openedOn), CARD_WIDTH - 48, 44);
  ctx.textAlign = 'left';

  if (side === 'front') {
    const headline = card.frontText || card.title || `第 ${card.dayNumber} 天`;
    ctx.font = '600 34px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    const lines = wrapText(ctx, headline, CARD_WIDTH * 0.68, 3);
    const lineHeight = 44;
    const titleSpace = card.title && card.frontText && card.title !== card.frontText ? 34 : 0;
    const startY = CARD_HEIGHT - 44 - titleSpace - lines.length * lineHeight;
    lines.forEach((line, index) => ctx.fillText(line, 48, startY + index * lineHeight));
    if (card.title && card.frontText && card.title !== card.frontText) {
      ctx.font = '500 18px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.68)';
      ctx.fillText(card.title, 48, CARD_HEIGHT - 42);
    }
  } else {
    const message = card.backText || '把今天好好收藏。';
    ctx.font = '500 30px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    const lines = wrapText(ctx, message, CARD_WIDTH * 0.68, 4);
    const lineHeight = 42;
    const startY = CARD_HEIGHT - 70 - lines.length * lineHeight;
    ctx.textAlign = 'right';
    lines.forEach((line, index) => {
      ctx.fillText(line, CARD_WIDTH - 48, startY + index * lineHeight);
    });
    ctx.font = '500 15px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.58)';
    ctx.fillText(card.title || `生活卡片 · ${card.dayNumber}/30`, CARD_WIDTH - 48, CARD_HEIGHT - 38);
    ctx.textAlign = 'left';
  }

  return canvasToBlob(canvas);
}

function safeFolderName(card: PhotoCard): string {
  const title = (card.title || '生活卡片').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  return `${String(card.dayNumber).padStart(2, '0')}_${card.openedOn}_${title}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportPhotoCardsZip(
  cards: PhotoCard[],
  onProgress?: (percent: number, label: string) => void
): Promise<void> {
  if (!cards.length) throw new Error('暂无可导出的卡片');
  const sorted = [...cards].sort((a, b) => a.dayNumber - b.dayNumber);
  const zip = new JSZip();
  for (let index = 0; index < sorted.length; index += 1) {
    const card = sorted[index];
    onProgress?.(Math.round((index / sorted.length) * 88), `正在生成第 ${card.dayNumber} 天`);
    const folder = zip.folder(safeFolderName(card));
    if (!folder) throw new Error('ZIP 文件夹创建失败');
    const [front, back] = await Promise.all([
      renderPhotoCardSide(card, 'front'),
      renderPhotoCardSide(card, 'back'),
    ]);
    folder.file('正面.png', front);
    folder.file('背面.png', back);
    folder.file('卡片信息.txt', [
      `第 ${card.dayNumber} 天`,
      `开卡日期：${card.openedOn}`,
      `标题：${card.title}`,
      `正面文字：${card.frontText}`,
      `背面文字：${card.backText}`,
    ].join('\r\n'));
  }
  onProgress?.(92, '正在打包 ZIP');
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'STORE' },
    (metadata) => onProgress?.(92 + Math.round(metadata.percent * 0.08), '正在打包 ZIP')
  );
  downloadBlob(blob, `生活卡片_${new Date().toISOString().slice(0, 10)}_${sorted.length}张.zip`);
  onProgress?.(100, '导出完成');
}
