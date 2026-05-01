import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, Check, Key, Loader2, RefreshCw, Power, PowerOff } from 'lucide-react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';

interface ApiToken {
  id: string;
  name: string;
  token: string;
  is_active: number;
  is_admin: number;
  created_at: string;
  last_used_at: string | null;
}

interface ApiTokensProps {
  userTrustLevel?: number;
}

export default function ApiTokens({ userTrustLevel = 1 }: ApiTokensProps) {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTokenName, setNewTokenName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => { loadTokens(); }, []);

  const loadTokens = async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ tokens: ApiToken[] }>('/admin/tokens', true);
      setTokens(data.tokens || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!newTokenName.trim() || creating) return;
    setCreating(true);
    try {
      const data = await apiPost<{ ok: boolean; token: string; name: string }>('/admin/tokens', { name: newTokenName.trim() }, true);
      setNewTokenName('');
      setNewToken({ name: data.name, token: data.token });
      await loadTokens();
    } catch (e) { alert(e instanceof Error ? e.message : '创建失败'); }
    finally { setCreating(false); }
  };

  const handleRevoke = async (id: string, active: boolean) => {
    try {
      await apiPatch(`/admin/tokens/${id}`, { isActive: active }, true);
      await loadTokens();
    } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要永久删除此 Token 吗？')) return;
    try {
      await apiDelete(`/admin/tokens/${id}`, true);
      await loadTokens();
    } catch (e) { alert(e instanceof Error ? e.message : '删除失败'); }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-500" size={32} /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Key className="w-8 h-8" />
              API Token 管理
            </h2>
          </div>
          <button onClick={loadTokens} className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors">
            <RefreshCw size={18} />
          </button>
        </div>
        <p className="text-sm text-purple-200 mt-3">
          生成 Token 后可通过 HTTP 调用记账 API，支持 AI 工具接入（如 OpenClaw、Claude Code 等）
        </p>
      </div>

      {/* Create Token */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
        <h3 className="font-medium mb-4">创建新 Token</h3>
        <div className="flex gap-3">
          <input
            type="text"
            value={newTokenName}
            onChange={e => setNewTokenName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Token 名称，如：OpenClaw接入"
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newTokenName.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            生成
          </button>
        </div>

        {newToken && (
          <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
              新 Token 已生成，请立即复制保存。关闭此页面后将无法再次查看完整 Token！
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg text-sm font-mono break-all">
                {newToken.token}
              </code>
              <button
                onClick={() => copyToClipboard(newToken.token, 'new')}
                className="p-2 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
              >
                {copiedId === 'new' ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
              </button>
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">名称: {newToken.name}</p>
          </div>
        )}
      </div>

      {/* Token List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-slate-700">
          <h3 className="font-medium">已创建的 Token ({tokens.length})</h3>
        </div>
        {tokens.length === 0 ? (
          <div className="p-8 text-center text-gray-400 dark:text-slate-500 text-sm">
            还没有创建任何 Token
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {tokens.map(t => (
              <div key={t.id} className="p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      <span className={t.is_active ? "text-green-500 text-xs" : "text-gray-400 text-xs"}>
                        {t.is_active ? '● 启用' : '○ 已吊销'}
                      </span>
                      {!!t.is_admin && <span className="text-xs text-purple-500 bg-purple-50 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">管理员</span>}
                    </div>
                    <code className="text-xs font-mono text-gray-400 break-all">{t.token}</code>
                    <div className="text-xs text-gray-400">
                      创建于 {new Date(t.created_at).toLocaleString('zh-CN')}
                      {t.last_used_at && ` · 最后调用 ${new Date(t.last_used_at).toLocaleString('zh-CN')}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4 shrink-0">
                    <button
                      onClick={() => copyToClipboard(t.token, t.id)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      title="复制"
                    >
                      {copiedId === t.id ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                    </button>
                    <button
                      onClick={() => handleRevoke(t.id, !t.is_active)}
                      className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                      title={t.is_active ? '吊销' : '启用'}
                    >
                      {t.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
