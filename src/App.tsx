/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Login, { useAuth } from './components/Login';

interface User {
  id: string;
  username: string;
  trustLevel: number;
}

const guestUser: User = {
  id: 'guest',
  username: '游客',
  trustLevel: 1,
};

export default function App() {
  const { user, isLoading, login, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (showLogin) {
    return <Login onLogin={(u: User) => { login(u); setShowLogin(false); }} />;
  }

  return <Layout user={user || guestUser} onLogout={logout} onShowLogin={() => setShowLogin(true)} />;
}

export type { User };
