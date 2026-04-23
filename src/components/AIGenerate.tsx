import React, { useState } from 'react';
import { Sparkles, Download, Loader2, CreditCard, RotateCw, Image } from 'lucide-react';
import { cn } from '../lib/utils';
import { uploadImage } from '../lib/image';

interface AIGenerateProps {
  userTrustLevel?: number;
}

interface GeneratedImage {
  url: string;
  side: 'front' | 'back';
  prompt: string;
}

const stylePresets = [
  { label: '自定义', value: '__custom__' },
  { label: '水彩画', value: 'watercolor painting style, soft colors, artistic brush strokes' },
  { label: '赛博朋克', value: 'cyberpunk neon style, dark background with glowing accents, futuristic' },
  { label: '中国水墨', value: 'Chinese ink wash painting style, elegant, traditional artistic' },
  { label: '极简主义', value: 'minimalist design, clean lines, subtle gradients, modern' },
  { label: '动漫风格', value: 'anime illustration style, vibrant colors, Japanese animation aesthetic' },
  { label: '油画风格', value: 'oil painting style, rich textures, classical art feel' },
  { label: '自然风景', value: 'natural landscape, mountains or ocean, serene scenery' },
  { label: '星空宇宙', value: 'cosmic space theme, stars and galaxies, deep blue and purple' },
  { label: '复古怀旧', value: 'vintage retro style, warm tones, aged paper texture' },
  { label: '科技几何', value: 'geometric tech patterns, modern abstract, blue and silver' },
];

export default function AIGenerate({ userTrustLevel = 1 }: AIGenerateProps) {
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState(stylePresets[0].value);
  const [generatingSide, setGeneratingSide] = useState<'front' | 'back' | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);
  const [error, setError] = useState('');

  const handleGenerate = async (side: 'front' | 'back') => {
    const actualPrompt = selectedStyle === '__custom__' ? prompt : selectedStyle;
    if (!actualPrompt) {
      setError(selectedStyle === '__custom__' ? '请输入自定义风格描述' : '请先选择风格');
      return;
    }
    
    setGeneratingSide(side);
    setError('');
    
    try {
      const userId = localStorage.getItem('userId') || '';
      const res = await fetch('/api/ai-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        body: JSON.stringify({
          prompt: actualPrompt,
          side,
        }),
      });
      
      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error || '生成失败');
      }
      
      const data = await res.json() as { ok: boolean; content: string; urls: string[] };
      
      // Use AI proxy to avoid CORS
      const proxyUrls = (data.urls || []).map((url: string) => `/api/ai-image?url=${encodeURIComponent(url)}`);
      
      if (proxyUrls.length === 0) {
        // Show raw content so user can see what AI returned
        throw new Error(data.content ? `AI 未返回图片链接。原始回复:\n\n${data.content.substring(0, 500)}` : 'AI 未返回图片链接，请重试');
      }
      
      const newImage: GeneratedImage = {
        url: proxyUrls[0],
        side,
        prompt: actualPrompt,
      };
      
      setGeneratedImages(prev => {
        const filtered = prev.filter(img => img.side !== side);
        return [...filtered, newImage];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setGeneratingSide(null);
    }
  };

  const handleDownload = (image: GeneratedImage) => {
    const a = document.createElement('a');
    a.href = image.url;
    a.download = `card_${image.side}_${Date.now()}.png`;
    a.target = '_blank';
    a.click();
  };

  const handleUseAsCardImage = async (image: GeneratedImage) => {
    try {
      const res = await fetch(image.url);
      const blob = await res.blob();
      const file = new File([blob], `ai_card_${image.side}_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = await uploadImage(file);
      await navigator.clipboard.writeText(url);
      alert(`图片已上传并复制URL到剪贴板！\n\n${url}\n\n在开卡或编辑卡片时可以粘贴此URL。`);
    } catch (e) {
      alert('保存失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const frontImage = generatedImages.find(img => img.side === 'front');
  const backImage = generatedImages.find(img => img.side === 'back');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles size={24} className="text-purple-500" />
        <h2 className="text-lg font-semibold">AI 生成卡图</h2>
      </div>

      {/* Style presets */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">选择风格</label>
        <div className="flex flex-wrap gap-2">
          {stylePresets.map((preset) => (
            <button
              key={preset.value}
              onClick={() => {
                setSelectedStyle(preset.value);
                if (preset.value !== '__custom__') setPrompt('');
              }}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm transition-all border",
                selectedStyle === preset.value
                  ? "bg-purple-100 dark:bg-purple-900/40 border-purple-300 dark:border-purple-600 text-purple-700 dark:text-purple-300"
                  : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-purple-300"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom prompt */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
          {selectedStyle === '__custom__' ? '输入自定义风格描述（英文效果更好）' : '补充描述（可选）'}
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={selectedStyle === '__custom__' ? '例如：watercolor with soft pink flowers, dreamy atmosphere...' : '例如：一只可爱的猫咪坐在金币堆上，背后是樱花树...'}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
          rows={3}
        />
        <p className="text-xs text-gray-400">{selectedStyle === '__custom__' ? '输入你想要的画面风格描述（建议用英文），AI 会生成对应的银行卡背景图' : '选择风格后可以补充描述来微调效果；提示词会自动加上银行卡尺寸和比例信息'}</p>
      </div>

      {/* Generate buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => handleGenerate('front')}
          disabled={generatingSide !== null}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
        >
          {generatingSide === 'front' ? (
            <><Loader2 size={18} className="animate-spin" />生成正面中...</>
          ) : (
            <><CreditCard size={18} />生成正面</>
          )}
        </button>
        <button
          onClick={() => handleGenerate('back')}
          disabled={generatingSide !== null}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
        >
          {generatingSide === 'back' ? (
            <><Loader2 size={18} className="animate-spin" />生成背面中...</>
          ) : (
            <><RotateCw size={18} />生成背面</>
          )}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Preview */}
      {(frontImage || backImage) && (
        <div className="space-y-4">
          <h3 className="font-medium text-gray-700 dark:text-slate-300">生成结果</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Front preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-slate-400 flex items-center gap-1">
                  <CreditCard size={14} /> 正面
                </span>
                {frontImage && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleUseAsCardImage(frontImage)}
                      className="p-1.5 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                      title="保存到卡图"
                    >
                      <Image size={14} />
                    </button>
                    <button
                      onClick={() => handleDownload(frontImage)}
                      className="p-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      title="下载"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div
                className="aspect-[3/2] bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl overflow-hidden cursor-pointer relative"
                onClick={() => frontImage && setPreviewImage(frontImage)}
              >
                {frontImage ? (
                  <img src={frontImage.url} alt="正面" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30">
                    <div className="text-center">
                      <CreditCard size={48} className="mx-auto mb-2" />
                      <p className="text-sm">点击"生成正面"</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Back preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-slate-400 flex items-center gap-1">
                  <RotateCw size={14} /> 背面
                </span>
                {backImage && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleUseAsCardImage(backImage)}
                      className="p-1.5 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                      title="保存到卡图"
                    >
                      <Image size={14} />
                    </button>
                    <button
                      onClick={() => handleDownload(backImage)}
                      className="p-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      title="下载"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div
                className="aspect-[3/2] bg-gradient-to-br from-indigo-700 to-pink-600 rounded-2xl overflow-hidden cursor-pointer relative"
                onClick={() => backImage && setPreviewImage(backImage)}
              >
                {backImage ? (
                  <img src={backImage.url} alt="背面" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30">
                    <div className="text-center">
                      <RotateCw size={48} className="mx-auto mb-2" />
                      <p className="text-sm">点击"生成背面"</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Full preview */}
          {previewImage && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPreviewImage(null)}>
              <div className="max-w-2xl w-full" onClick={e => e.stopPropagation()}>
                <div className="aspect-[3/2] rounded-2xl overflow-hidden shadow-2xl">
                  <img src={previewImage.url} alt={previewImage.side === 'front' ? '正面' : '背面'} className="w-full h-full object-cover" />
                </div>
                <div className="mt-4 flex justify-center gap-3">
                  <button onClick={() => handleDownload(previewImage)} className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors">
                    <Download size={16} />下载图片
                  </button>
                  <button onClick={() => handleUseAsCardImage(previewImage)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors">
                    <Image size={16} />保存到卡图
                  </button>
                  <button onClick={() => setPreviewImage(null)} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors">
                    关闭
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}