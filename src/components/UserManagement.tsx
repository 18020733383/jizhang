import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Loader2, Shield, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { apiGet, apiPost, apiDelete } from '../lib/api';

interface User {
  id: string;
  username: string;
  trust_level: number;
  created_at: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newTrustLevel, setNewTrustLevel] = useState(1);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<{ users: User[] }>('/auth/users');
      setUsers(data.users);
    } catch (e) {
      console.error('Failed to load users:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      await apiPost('/auth/users', {
        username: newUsername,
        password: newPassword,
        trustLevel: newTrustLevel,
      });
      await loadUsers();
      setShowCreateForm(false);
      setNewUsername('');
      setNewPassword('');
      setNewTrustLevel(1);
    } catch (e) {
      alert(e instanceof Error ? e.message : '创建失败');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteUser = async (id: string, username: string) => {
    if (!confirm(`确定要删除用户 "${username}" 吗？`)) return;
    try {
      await apiDelete(`/auth/users/${id}`);
      await loadUsers();
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleUpdateTrustLevel = async (userId: string, newLevel: number) => {
    try {
      await apiPost(`/auth/users/${userId}/trust`, { newLevel });
      await loadUsers();
    } catch (e) {
      alert(e instanceof Error ? e.message : '更新失败');
    }
  };

  const trustLevelNames: Record<number, string> = {
    1: 'Lv1 访客',
    2: 'Lv2 只读',
    3: 'Lv3 管理员',
  };

  const trustLevelColors: Record<number, string> = {
    1: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    2: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
    3: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 flex items-center gap-2">
          <Users size={24} />
          用户管理
        </h3>
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          <Plus size={18} />
          <span>添加用户</span>
        </button>
      </div>

      {/* Create User Form */}
      {showCreateForm && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
          <h4 className="text-md font-semibold mb-4">创建新用户</h4>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  用户名
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  密码
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  信任等级
                </label>
                <select
                  value={newTrustLevel}
                  onChange={(e) => setNewTrustLevel(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                >
                  <option value={1}>Lv1 访客</option>
                  <option value={2}>Lv2 只读</option>
                  <option value={3}>Lv3 管理员</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isCreating && <Loader2 size={16} className="animate-spin" />}
                创建
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users List */}
      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-500" />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  用户名
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  信任等级
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  创建时间
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                        <Shield size={16} className="text-white" />
                      </div>
                      <span className="font-medium text-gray-900 dark:text-white">{user.username}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={user.trust_level}
                      onChange={(e) => handleUpdateTrustLevel(user.id, Number(e.target.value))}
                      disabled={user.id === 'admin'}
                      className={cn(
                        "px-2 py-1 rounded-lg text-xs font-medium border-0 cursor-pointer",
                        trustLevelColors[user.trust_level]
                      )}
                    >
                      <option value={1}>Lv1 访客</option>
                      <option value={2}>Lv2 只读</option>
                      <option value={3}>Lv3 管理员</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(user.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    {user.id !== 'admin' && (
                      <button
                        onClick={() => handleDeleteUser(user.id, user.username)}
                        className="p-2 text-gray-400 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-200">权限说明</p>
            <ul className="mt-1 text-amber-700 dark:text-amber-300 space-y-1">
              <li><strong>Lv1 访客:</strong> 只能看到模糊展示的内容</li>
              <li><strong>Lv2 只读:</strong> 可以查看详细信息，但无法添加记录</li>
              <li><strong>Lv3 管理员:</strong> 完全访问，可管理隐私设置和用户</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
