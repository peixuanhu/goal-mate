'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Target } from 'lucide-react';

export default function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (data.success) {
        router.push('/');
        router.refresh();
      } else {
        setError(data.error || '登录失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-stone-50 px-4 py-10">
      <div aria-hidden="true" className="absolute -left-24 top-[-8rem] h-72 w-72 rounded-full bg-violet-100/70 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-32 right-[-5rem] h-80 w-80 rounded-full bg-rose-100/50 blur-3xl" />

      <div className="relative w-full max-w-sm rounded-3xl border border-stone-200/80 bg-white p-7 shadow-[0_24px_70px_rgba(28,25,23,0.10)] sm:p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200">
            <Target aria-hidden="true" className="h-6 w-6" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Goal Mate</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">欢迎回来</h1>
          <p className="mt-2 text-sm text-stone-500">登录后继续推进今天最重要的事</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="username" className="mb-2 block text-sm font-medium text-stone-700">
              用户名
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
              placeholder="请输入用户名"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-stone-700">
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
              placeholder="请输入密码"
              required
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-violet-600 px-4 py-3 font-medium text-white shadow-sm shadow-violet-200 transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-violet-300 disabled:shadow-none"
          >
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
