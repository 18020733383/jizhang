import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, Minus, Plus, RotateCcw, RotateCw, X } from 'lucide-react';

const OUTPUT_WIDTH = 1011;
const OUTPUT_HEIGHT = 638;

type Offset = { x: number; y: number };

function imageMetrics(image: HTMLImageElement, rotation: number, zoom: number) {
  const turned = rotation % 180 !== 0;
  const rotatedWidth = turned ? image.naturalHeight : image.naturalWidth;
  const rotatedHeight = turned ? image.naturalWidth : image.naturalHeight;
  const scale = Math.max(OUTPUT_WIDTH / rotatedWidth, OUTPUT_HEIGHT / rotatedHeight) * zoom;
  return {
    scale,
    width: rotatedWidth * scale,
    height: rotatedHeight * scale,
  };
}

function clampOffset(image: HTMLImageElement, rotation: number, zoom: number, offset: Offset): Offset {
  const metrics = imageMetrics(image, rotation, zoom);
  const maxX = Math.max(0, (metrics.width - OUTPUT_WIDTH) / 2);
  const maxY = Math.max(0, (metrics.height - OUTPUT_HEIGHT) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, offset.x)),
    y: Math.max(-maxY, Math.min(maxY, offset.y)),
  };
}

function drawCrop(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  rotation: number,
  zoom: number,
  offset: Offset,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持图片裁切');
  const { scale } = imageMetrics(image, rotation, zoom);
  ctx.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  ctx.save();
  ctx.translate(OUTPUT_WIDTH / 2 + offset.x, OUTPUT_HEIGHT / 2 + offset.y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  ctx.restore();
}

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('裁切后的图片生成失败'));
        return;
      }
      resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }));
    }, 'image/jpeg', 0.94);
  });
}

export default function ImageCropper({
  source,
  label,
  onCancel,
  onConfirm,
}: {
  source: File;
  label: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; offset: Offset } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(source);
    const nextImage = new Image();
    let active = true;
    nextImage.onload = () => {
      if (!active) return;
      setImage(nextImage);
      setError(null);
    };
    nextImage.onerror = () => {
      if (active) setError('图片读取失败，请换一张图片重试');
    };
    nextImage.src = url;
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [source]);

  useEffect(() => {
    if (canvasRef.current && image) drawCrop(canvasRef.current, image, rotation, zoom, offset);
  }, [image, rotation, zoom, offset]);

  const updateZoom = useCallback((value: number) => {
    if (!image) return;
    const next = Math.max(1, Math.min(4, value));
    setZoom(next);
    setOffset((current) => clampOffset(image, rotation, next, current));
  }, [image, rotation]);

  const rotate = () => {
    if (!image) return;
    setRotation((current) => (current + 90) % 360);
    setOffset({ x: 0, y: 0 });
  };

  const reset = () => {
    setRotation(0);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!image) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset };
  };

  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!image || !dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = OUTPUT_WIDTH / rect.width;
    setOffset(clampOffset(image, rotation, zoom, {
      x: dragRef.current.offset.x + (event.clientX - dragRef.current.x) * scale,
      y: dragRef.current.offset.y + (event.clientY - dragRef.current.y) * scale,
    }));
  };

  const pointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const confirm = async () => {
    if (!canvasRef.current || !image) return;
    setSaving(true);
    setError(null);
    try {
      drawCrop(canvasRef.current, image, rotation, zoom, offset);
      const baseName = source.name.replace(/\.[^.]+$/, '') || 'photo-card';
      onConfirm(await canvasToFile(canvasRef.current, `${baseName}-cropped.jpg`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/90 p-4 backdrop-blur-md">
      <div className="mx-auto my-4 max-w-4xl rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-900 sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">调整{label}</p>
            <h4 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">拖动图片选择卡片中的区域</h4>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">框内内容就是最终预览和导出的画面，可缩放或按 90° 旋转。</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="关闭裁切"><X size={22} /></button>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-slate-950 shadow-inner">
          {!image && !error && <div className="absolute inset-0 z-10 flex items-center justify-center"><Loader2 className="animate-spin text-white" size={28} /></div>}
          <canvas
            ref={canvasRef}
            width={OUTPUT_WIDTH}
            height={OUTPUT_HEIGHT}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            className="block aspect-[1011/638] w-full cursor-grab touch-none active:cursor-grabbing"
            aria-label={`${label}裁切区域，可拖动图片`}
          />
          <div className="pointer-events-none absolute inset-3 rounded-xl border border-white/70 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.3)]" />
          <span className="pointer-events-none absolute bottom-5 left-5 rounded-full bg-slate-950/65 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur">拖动调整位置</span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-slate-600 dark:text-slate-300"><span>缩放</span><span>{zoom.toFixed(2)}×</span></div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => updateZoom(zoom - 0.1)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="缩小"><Minus size={17} /></button>
              <input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(event) => updateZoom(Number(event.target.value))} className="w-full accent-indigo-600" aria-label="图片缩放" />
              <button type="button" onClick={() => updateZoom(zoom + 0.1)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="放大"><Plus size={17} /></button>
            </div>
          </div>
          <div className="flex gap-2 sm:pt-6">
            <button type="button" onClick={rotate} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><RotateCw size={17} /> 旋转 90°</button>
            <button type="button" onClick={reset} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><RotateCcw size={17} /> 重置</button>
          </div>
        </div>

        {error && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-5 py-3 font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">取消</button>
          <button type="button" disabled={!image || saving} onClick={() => void confirm()} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
            使用这个裁切
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
