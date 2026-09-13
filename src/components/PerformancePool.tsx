import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CalendarDays,
  CheckCircle2,
  Edit2,
  Loader2,
  LockKeyhole,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';
import { useStore } from '../store/useStore';

type PerformanceEntry = {
  id: string;
  title: string;
  amount: number;
  entry_date: string;
  note: string;
  created_at: string;
  updated_at: string;
};

type PerformanceAllocation = {
  bet_id: string;
  title: string;
  status: 'active' | 'completed' | 'failed';
  performance_budget: number;
  start_date: string;
  end_date: string;
  completed_at: string | null;
  performance_redeemed_at: string | null;
  performance_pool_id: string | null;
  pool_name: string | null;
};

type DailyHistory = {
  day: string;
  total: number;
  locked: number;
  redeemed: number;
};

type PerformancePoolData = {
  total: number;
  reserved: number;
  eligible: number;
  redeemed: number;
  available: number;
  entries: PerformanceEntry[];
  allocations: PerformanceAllocation[];
  dailyHistory: DailyHistory[];
};

interface PerformancePoolProps {
  userTrustLevel?: number;
}

const emptyData: PerformancePoolData = {
  total: 0,
  reserved: 0,
  eligible: 0,
  redeemed: 0,
  available: 0,
  entries: [],
  allocations: [],
  dailyHistory: [],
};

const money = (value: number) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PerformancePool({ userTrustLevel = 1 }: PerformancePoolProps) {
  const [data, setData] = useState<PerformancePoolData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PerformanceEntry | null>(null);
  const [redeeming, setRedeeming] = useState<PerformanceAllocation | null>(null);
  const pools = useStore((state) => state.pools);

  const load = async () => {
    setLoading(true);
    try {
      setData(await apiGet<PerformancePoolData>('/performance-pool'));
    } catch (error) {
      alert(error instanceof Error ? error.message : '绩效池加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const used = data.reserved + data.eligible + data.redeemed;
  const usedPct = data.total > 0 ? Math.min(100, (used / data.total) * 100) : 0;
  const redeemedPct = data.total > 0 ? Math.min(100, (data.redeemed / data.total) * 100) : 0;
  const reservedPct = data.total > 0 ? Math.min(100 - redeemedPct, (data.reserved / data.total) * 100) : 0;
  const eligiblePct = data.total > 0 ? Math.min(100 - redeemedPct - reservedPct, (data.eligible / data.total) * 100) : 0;
  const dailyHistory = useMemo(
    () => data.dailyHistory.map((item) => ({
      ...item,
      total: Number(item.total),
      locked: Number(item.locked),
      redeemed: Number(item.redeemed),
    })),
    [data.dailyHistory]
  );
  const allocationChart = useMemo(() => {
    const allocated = data.allocations
      .filter((item) => item.status !== 'failed')
      .map((item) => ({ name: item.title, value: Number(item.performance_budget) }));
    if (data.available > 0 || allocated.length === 0) allocated.push({ name: '尚未分配', value: data.available });
    return allocated;
  }, [data.allocations, data.available]);
  const allocationColors = ['#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#3b82f6', '#10b981', '#94a3b8'];

  const openAdd = () => {
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (entry: PerformanceEntry) => {
    setEditing(entry);
    setShowModal(true);
  };

  const saveEntry = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      title: String(formData.get('title') ?? ''),
      amount: Number(formData.get('amount') ?? 0),
      entryDate: String(formData.get('entryDate') ?? ''),
      note: String(formData.get('note') ?? ''),
    };
    setSaving(true);
    try {
      if (editing) await apiPatch(`/performance-pool/entries/${editing.id}`, payload);
      else await apiPost('/performance-pool/entries', payload);
      setShowModal(false);
      setEditing(null);
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry: PerformanceEntry) => {
    if (!confirm(`确定删除“${entry.title}”这笔绩效额度吗？`)) return;
    try {
      await apiDelete(`/performance-pool/entries/${entry.id}`);
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : '删除失败');
    }
  };

  const redeem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!redeeming) return;
    const poolId = String(new FormData(event.currentTarget).get('poolId') ?? '');
    setSaving(true);
    try {
      await apiPost(`/performance-pool/allocations/${redeeming.bet_id}/redeem`, { poolId });
      setRedeeming(null);
      await Promise.all([load(), useStore.getState().loadState()]);
    } catch (error) {
      alert(error instanceof Error ? error.message : '兑现失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-gray-500 dark:text-slate-400">
        <Loader2 className="mr-2 animate-spin" size={22} />加载绩效池...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-in fade-in duration-300">
      <section className="overflow-hidden rounded-lg bg-emerald-950 text-white shadow-sm">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-emerald-200">
              <Award size={20} />绩效奖励额度
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-4xl font-bold">{money(data.total)}</span>
              <span className="text-sm text-emerald-200">累计获得</span>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-100/80">
              节省与额外成果先进入这里，不直接计作收入。只有完成对应对赌协议后，其奖金才会兑现。
            </p>
          </div>
          {userTrustLevel >= 3 && (
            <button onClick={openAdd} className="flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 font-medium text-emerald-900 hover:bg-emerald-50">
              <Plus size={18} />增加绩效条目
            </button>
          )}
        </div>
        <div className="border-t border-white/10 bg-black/10 px-6 py-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>绩效额度使用</span>
            <span>{usedPct.toFixed(1)}%</span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-white/15">
            <div className="bg-amber-400" style={{ width: `${redeemedPct}%` }} />
            <div className="bg-violet-400" style={{ width: `${eligiblePct}%` }} />
            <div className="bg-cyan-400" style={{ width: `${reservedPct}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-emerald-100/80">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-cyan-400" />已锁定 {money(data.reserved)}</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-violet-400" />待兑现 {money(data.eligible)}</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400" />已兑现 {money(data.redeemed)}</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-white/30" />可分配 {money(data.available)}</span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon={Wallet} label="当前可分配" value={money(data.available)} tone="emerald" />
        <Stat icon={LockKeyhole} label="进行中协议锁定" value={money(data.reserved)} tone="cyan" />
        <Stat icon={Award} label="完成待兑现" value={money(data.eligible)} tone="violet" />
        <Stat icon={CheckCircle2} label="已完成兑现" value={money(data.redeemed)} tone="amber" />
        <Stat icon={Sparkles} label="绩效来源" value={`${data.entries.length} 条`} tone="violet" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 lg:col-span-2">
          <div className="mb-5 flex items-center gap-2">
            <TrendingUp size={19} className="text-emerald-600" />
            <h3 className="font-semibold">绩效池历史</h3>
          </div>
          {dailyHistory.length === 0 ? (
            <Empty text="增加绩效条目后，这里会显示每日状态变化。" />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyHistory} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(value) => String(value).slice(5)} minTickGap={28} />
                  <YAxis tick={{ fontSize: 11 }} width={64} tickFormatter={(value) => `¥${Number(value).toLocaleString()}`} />
                  <Tooltip
                    formatter={(value, name) => [money(Number(value)), String(name)]}
                    contentStyle={{ borderRadius: 8, borderColor: '#cbd5e1' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="total" name="绩效池总额度" stroke="#10b981" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="locked" name="已锁定额度" stroke="#06b6d4" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="redeemed" name="累计兑现额度" stroke="#f59e0b" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-semibold"><LockKeyhole size={19} className="text-cyan-600" />协议划分</h3>
            <span className="text-xs text-gray-500">尚未分配 {money(data.available)}</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allocationChart}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="48%"
                  innerRadius={58}
                  outerRadius={88}
                  paddingAngle={2}
                  stroke="none"
                >
                  {allocationChart.map((item, index) => (
                    <Cell key={`${item.name}-${index}`} fill={item.name === '尚未分配' ? '#cbd5e1' : allocationColors[index % (allocationColors.length - 1)]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => money(Number(value))} contentStyle={{ borderRadius: 8, borderColor: '#cbd5e1' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {data.allocations.length === 0 ? (
            <Empty text="对赌协议划拨奖金后会显示在这里。" />
          ) : (
            <div className="space-y-4">
              {data.allocations.map((allocation) => {
                const pct = data.total > 0 ? (Number(allocation.performance_budget) / data.total) * 100 : 0;
                const status = allocation.status === 'active'
                  ? '已锁定'
                  : allocation.status === 'failed'
                    ? '已释放'
                    : allocation.performance_redeemed_at
                      ? `已兑现至 ${allocation.pool_name ?? '资金池'}`
                      : '完成，待兑现';
                return (
                  <div key={allocation.bet_id}>
                    <div className="mb-1.5 flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{allocation.title}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{status} · {allocation.start_date} 至 {allocation.end_date}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold">{money(Number(allocation.performance_budget))}</p>
                        <p className="text-xs text-gray-500">{pct.toFixed(1)}%</p>
                      </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                      <div className={allocation.status === 'completed' ? 'h-full bg-amber-500' : allocation.status === 'failed' ? 'h-full bg-gray-400' : 'h-full bg-cyan-500'} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    {allocation.status === 'completed' && !allocation.performance_redeemed_at && userTrustLevel >= 3 && (
                      <button onClick={() => setRedeeming(allocation)} className="mt-2 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400">兑现为收入</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-slate-800">
          <h3 className="flex items-center gap-2 font-semibold"><CalendarDays size={19} className="text-violet-600" />绩效条目</h3>
          <span className="text-sm text-gray-500">共 {data.entries.length} 条</span>
        </div>
        {data.entries.length === 0 ? (
          <div className="p-8"><Empty text="记录省下的钱或额外成果，建立第一笔可奖励额度。" /></div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {data.entries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="font-medium">{entry.title}</p>
                    <span className="text-xs text-gray-500 dark:text-slate-400">{entry.entry_date}</span>
                  </div>
                  {entry.note && <p className="mt-1 truncate text-sm text-gray-500 dark:text-slate-400">{entry.note}</p>}
                </div>
                <p className="shrink-0 font-semibold text-emerald-600 dark:text-emerald-400">+{money(Number(entry.amount))}</p>
                {userTrustLevel >= 3 && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => openEdit(entry)} className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" title="编辑"><Edit2 size={16} /></button>
                    <button onClick={() => void deleteEntry(entry)} className="rounded-md p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40" title="删除"><Trash2 size={16} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editing ? '编辑绩效条目' : '增加绩效条目'}</h3>
              <button onClick={() => setShowModal(false)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"><XCircle size={20} /></button>
            </div>
            <form onSubmit={saveEntry} className="space-y-4">
              <Field label="绩效来源">
                <input name="title" required defaultValue={editing?.title} placeholder="如：退宿舍节省的费用" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="增加额度 (¥)">
                  <input name="amount" type="number" min="0.01" step="0.01" required defaultValue={editing?.amount} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800" />
                </Field>
                <Field label="记录日期">
                  <input name="entryDate" type="date" required defaultValue={editing?.entry_date ?? format(new Date(), 'yyyy-MM-dd')} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800" />
                </Field>
              </div>
              <Field label="说明">
                <textarea name="note" rows={3} defaultValue={editing?.note} placeholder="为什么获得这笔绩效额度" className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800" />
              </Field>
              <p className="rounded-md bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                这笔金额只增加奖励上限，不会进入收入或普通资金池。
              </p>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800">取消</button>
                <button disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 font-medium text-white hover:bg-emerald-800 disabled:opacity-60">
                  {saving && <Loader2 size={16} className="animate-spin" />}{editing ? '保存修改' : '加入绩效池'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {redeeming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="text-lg font-semibold">兑现绩效奖金</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">{redeeming.title} · {money(Number(redeeming.performance_budget))}</p>
            <form onSubmit={redeem} className="mt-5 space-y-4">
              <Field label="收入进入资金池">
                <select name="poolId" required defaultValue="" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                  <option value="" disabled>请选择资金池</option>
                  {pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.name}</option>)}
                </select>
              </Field>
              <p className="rounded-md bg-violet-50 p-3 text-xs leading-5 text-violet-800 dark:bg-violet-950/30 dark:text-violet-300">确认后会生成一笔正式收入流水，并增加所选资金池余额。</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setRedeeming(null)} className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 dark:border-slate-700">取消</button>
                <button disabled={saving} className="flex-1 rounded-lg bg-violet-700 px-4 py-2.5 font-medium text-white disabled:opacity-60">确认兑现</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: 'emerald' | 'cyan' | 'amber' | 'violet' }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    cyan: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  };
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-md ${colors[tone]}`}><Icon size={18} /></div>
      <p className="text-xs text-gray-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold sm:text-xl">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium">{label}</span>{children}</label>;
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-gray-400 dark:text-slate-500">{text}</p>;
}
