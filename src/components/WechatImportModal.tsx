import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Upload,
  FileSpreadsheet,
  Loader2,
  SkipForward,
  Check,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';
import {
  parseWechatBillBuffer,
  matchBillAgainstExisting,
  type ParsedBillRow,
  type ImportMatchResult,
} from '../lib/wechatImport';

interface Props {
  onClose: () => void;
}

type Step = 'upload' | 'review' | 'done';

interface DraftItem {
  row: ParsedBillRow;
  note: string;
  poolId: string;
  /** 用户选择跳过 */
  skipped: boolean;
}

export default function WechatImportModal({ onClose }: Props) {
  const { pools, transactions, addTransaction, baseCurrency } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<ImportMatchResult | null>(null);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [defaultPoolId, setDefaultPoolId] = useState(pools[0]?.id || '');
  const [importIncome, setImportIncome] = useState(true);
  const [importExpense, setImportExpense] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const nonCardPools = useMemo(
    () => pools.filter((p) => !p.isCardPool),
    [pools]
  );

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setParsing(true);
      try {
        const buffer = await file.arrayBuffer();
        const { rows, skippedByStatus } = parseWechatBillBuffer(buffer);
        if (rows.length === 0) {
          throw new Error('未解析到有效账单记录，请检查文件是否为微信账单导出。');
        }

        const filtered = rows.filter((r) => {
          if (r.type === 'income' && !importIncome) return false;
          if (r.type === 'expense' && !importExpense) return false;
          return true;
        });

        const result = matchBillAgainstExisting(
          filtered,
          transactions.map((t) => ({
            date: t.date,
            amount: t.amount,
            type: t.type,
          })),
          skippedByStatus
        );
        setMatchResult(result);

        const poolFallback = defaultPoolId || nonCardPools[0]?.id || pools[0]?.id || '';
        setDrafts(
          result.unmatched.map((row) => ({
            row,
            note: row.suggestedNote,
            poolId: poolFallback,
            skipped: false,
          }))
        );
        setStep('review');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setParsing(false);
      }
    },
    [defaultPoolId, importExpense, importIncome, nonCardPools, pools, transactions]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const updateDraft = (key: string, patch: Partial<DraftItem>) => {
    setDrafts((prev) => prev.map((d) => (d.row.key === key ? { ...d, ...patch } : d)));
  };

  const applyDefaultPoolToAll = () => {
    if (!defaultPoolId) return;
    setDrafts((prev) =>
      prev.map((d) => (d.row.type === 'expense' && !d.skipped ? { ...d, poolId: defaultPoolId } : d))
    );
  };

  const skipAllEmptyNote = () => {
    setDrafts((prev) =>
      prev.map((d) => (!d.note.trim() ? { ...d, skipped: true } : d))
    );
  };

  const pendingCount = drafts.filter((d) => !d.skipped).length;
  const emptyNoteCount = drafts.filter((d) => !d.skipped && !d.note.trim()).length;
  const missingPoolCount = drafts.filter(
    (d) => !d.skipped && d.row.type === 'expense' && !d.poolId
  ).length;

  const handleImport = async () => {
    if (submitting) return;
    if (missingPoolCount > 0) {
      setError('还有支出未选择资金池，请补全或跳过。');
      return;
    }
    if (emptyNoteCount > 0) {
      const ok = window.confirm(
        `还有 ${emptyNoteCount} 条没有项目名称，将以空白备注导入。确定继续？`
      );
      if (!ok) return;
    }

    const toImport = drafts.filter((d) => !d.skipped);
    if (toImport.length === 0) {
      setImportSummary({ imported: 0, skipped: drafts.length, failed: 0 });
      setStep('done');
      return;
    }

    setSubmitting(true);
    setError(null);
    setProgress({ done: 0, total: toImport.length });
    let imported = 0;
    let failed = 0;

    // 顺序写入，避免并发刷爆 balance 计算
    for (const d of toImport) {
      try {
        if (d.row.type === 'expense') {
          await addTransaction({
            type: 'expense',
            amount: d.row.amount,
            originalAmount: d.row.amount,
            currency: baseCurrency,
            date: d.row.date,
            note: d.note.trim(),
            poolId: d.poolId,
          });
        } else {
          // 收入默认全部进第一个选中池或默认池
          const poolId = d.poolId || defaultPoolId || pools[0]?.id;
          if (!poolId) throw new Error('没有可用资金池');
          await addTransaction({
            type: 'income',
            amount: d.row.amount,
            originalAmount: d.row.amount,
            currency: baseCurrency,
            date: d.row.date,
            note: d.note.trim(),
            allocations: [{ poolId, amount: d.row.amount }],
          });
        }
        imported += 1;
      } catch {
        failed += 1;
      }
      setProgress({ done: imported + failed, total: toImport.length });
    }

    setImportSummary({
      imported,
      skipped: drafts.filter((d) => d.skipped).length + (matchResult?.matched.length ?? 0),
      failed,
    });
    setStep('done');
    setSubmitting(false);
  };

  // 必须 portal 到 body：页面 Tab 动画容器带 transform，会把 fixed 弹窗裁切掉
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-100 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
              微信账单一键导入
            </h2>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              按「日期 + 金额 + 类型」与已有记录去重，只补录新条目
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'upload' && (
            <>
              <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 p-4 text-sm text-blue-900 dark:text-blue-200 space-y-2">
                <p className="font-medium">如何导出微信账单 Excel</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-800/90 dark:text-blue-200/90">
                  <li>打开微信 → 我 → 服务 → 钱包 → 账单</li>
                  <li>右上角「常见问题」→「下载账单」→ 用于个人对账</li>
                  <li>选择时间范围，通过邮件收取压缩包，解压得到 Excel/CSV</li>
                  <li>将文件拖到下方区域，或点击选择文件</li>
                </ol>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                    默认资金池（支出）
                  </label>
                  <select
                    value={defaultPoolId}
                    onChange={(e) => setDefaultPoolId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl text-sm"
                  >
                    {(nonCardPools.length ? nonCardPools : pools).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                    导入类型
                  </label>
                  <div className="flex flex-wrap gap-4 pt-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={importExpense}
                        onChange={(e) => setImportExpense(e.target.checked)}
                        className="rounded"
                      />
                      支出
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={importIncome}
                        onChange={(e) => setImportIncome(e.target.checked)}
                        className="rounded"
                      />
                      收入
                    </label>
                  </div>
                </div>
              </div>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors',
                  'border-gray-200 dark:border-slate-600 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                />
                {parsing ? (
                  <div className="flex flex-col items-center gap-3 text-gray-500">
                    <Loader2 className="animate-spin" size={32} />
                    <p>正在解析账单…</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-slate-400">
                    <div className="w-14 h-14 rounded-2xl bg-green-50 dark:bg-green-950/40 flex items-center justify-center text-green-600">
                      <FileSpreadsheet size={28} />
                    </div>
                    <p className="font-medium text-gray-700 dark:text-slate-200">
                      拖拽或点击上传微信账单
                    </p>
                    <p className="text-xs">支持 .xlsx / .xls / .csv</p>
                  </div>
                )}
              </div>
            </>
          )}

          {step === 'review' && matchResult && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="账单有效条数" value={matchResult.total} />
                <StatCard
                  label="已存在（跳过）"
                  value={matchResult.matched.length}
                  tone="muted"
                />
                <StatCard
                  label="待补录"
                  value={matchResult.unmatched.length}
                  tone="accent"
                />
              </div>
              {matchResult.skippedByStatus > 0 && (
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  另有 {matchResult.skippedByStatus} 条因退款/失败/不计收支等原因已自动忽略。
                </p>
              )}

              {drafts.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-slate-400">
                  <Check className="mx-auto mb-3 text-emerald-500" size={36} />
                  <p className="font-medium">账单里的记录都已在库中</p>
                  <p className="text-sm mt-1">没有需要补录的新条目</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={applyDefaultPoolToAll}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700"
                    >
                      全部用默认资金池
                    </button>
                    <button
                      type="button"
                      onClick={skipAllEmptyNote}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700"
                    >
                      空项目名全部跳过
                    </button>
                    <span className="text-xs text-gray-400 ml-auto">
                      将导入 {pendingCount} 条
                      {emptyNoteCount > 0 && ` · ${emptyNoteCount} 条无项目名`}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {drafts.map((d) => (
                      <div
                        key={d.row.key}
                        className={cn(
                          'rounded-xl border p-4 transition-opacity',
                          d.skipped
                            ? 'border-gray-100 dark:border-slate-800 opacity-50 bg-gray-50 dark:bg-slate-900/50'
                            : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                        )}
                      >
                        <div className="flex flex-wrap items-start gap-3 justify-between mb-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                                {d.row.date}
                              </span>
                              {d.row.datetime.length > 10 && (
                                <span className="text-xs text-gray-400">
                                  {d.row.datetime.slice(11)}
                                </span>
                              )}
                              <span
                                className={cn(
                                  'text-xs px-2 py-0.5 rounded-full font-medium',
                                  d.row.type === 'expense'
                                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300'
                                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300'
                                )}
                              >
                                {d.row.type === 'expense' ? '支出' : '收入'}
                              </span>
                              <span
                                className={cn(
                                  'text-sm font-bold tabular-nums',
                                  d.row.type === 'expense'
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-emerald-600 dark:text-emerald-400'
                                )}
                              >
                                {d.row.type === 'expense' ? '-' : '+'}
                                {d.row.amount.toFixed(2)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 truncate">
                              {[d.row.counterparty, d.row.product]
                                .filter((x) => x && x !== '/')
                                .join(' · ') || '无对方/商品信息'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => updateDraft(d.row.key, { skipped: !d.skipped })}
                            className={cn(
                              'flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg shrink-0',
                              d.skipped
                                ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
                                : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300'
                            )}
                          >
                            <SkipForward size={14} />
                            {d.skipped ? '已跳过（点恢复）' : '跳过'}
                          </button>
                        </div>

                        {!d.skipped && (
                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">
                                项目名称 / 备注
                                {!d.note.trim() && (
                                  <span className="text-amber-500 ml-1">（待填写）</span>
                                )}
                              </label>
                              <input
                                type="text"
                                value={d.note}
                                onChange={(e) => updateDraft(d.row.key, { note: e.target.value })}
                                placeholder="例如：午餐、地铁、房租…"
                                className={cn(
                                  'w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-blue-500',
                                  'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-600',
                                  !d.note.trim() && 'border-amber-300 dark:border-amber-700'
                                )}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">
                                资金池
                              </label>
                              <select
                                value={d.poolId}
                                onChange={(e) => updateDraft(d.row.key, { poolId: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg text-sm bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600"
                              >
                                {pools.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {step === 'done' && importSummary && (
            <div className="text-center py-10 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600">
                <Check size={32} />
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900 dark:text-slate-100">导入完成</p>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">
                  成功 {importSummary.imported} 条 · 跳过 {importSummary.skipped} 条
                  {importSummary.failed > 0 && ` · 失败 ${importSummary.failed} 条`}
                </p>
              </div>
            </div>
          )}

          {submitting && (
            <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-slate-300">
              <Loader2 className="animate-spin shrink-0" size={18} />
              正在导入 {progress.done}/{progress.total}…
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-700 flex flex-wrap justify-end gap-2 shrink-0">
          {step === 'upload' && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
            >
              取消
            </button>
          )}
          {step === 'review' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setStep('upload');
                  setMatchResult(null);
                  setDrafts([]);
                  setError(null);
                }}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                重新上传
              </button>
              <button
                type="button"
                onClick={() => {
                  if (drafts.length === 0 || pendingCount === 0) {
                    setImportSummary({
                      imported: 0,
                      skipped:
                        drafts.filter((d) => d.skipped).length +
                        (matchResult?.matched.length ?? 0),
                      failed: 0,
                    });
                    setStep('done');
                    return;
                  }
                  void handleImport();
                }}
                disabled={submitting}
                className={cn(
                  'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white',
                  'bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {submitting ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Upload size={16} />
                )}
                {drafts.length === 0
                  ? '完成'
                  : pendingCount === 0
                    ? '全部已跳过，完成'
                    : `确认导入 ${pendingCount} 条`}
                {!submitting && drafts.length > 0 && pendingCount > 0 && (
                  <ChevronRight size={16} />
                )}
              </button>
            </>
          )}
          {step === 'done' && (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              关闭
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'muted' | 'accent';
}) {
  return (
    <div
      className={cn(
        'rounded-xl p-3 border',
        tone === 'accent'
          ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/40'
          : tone === 'muted'
            ? 'bg-gray-50 dark:bg-slate-800/50 border-gray-100 dark:border-slate-700'
            : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-700'
      )}
    >
      <p className="text-xs text-gray-500 dark:text-slate-400">{label}</p>
      <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-slate-100 mt-0.5">
        {value}
      </p>
    </div>
  );
}
