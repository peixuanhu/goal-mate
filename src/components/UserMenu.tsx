'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  username: string;
}

export default function UserMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
    }
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });
      
      if (response.ok) {
        router.push('/login');
        router.refresh();
      }
    } catch (error) {
      console.error('退出登录失败:', error);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="用户菜单"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-stone-700 shadow-sm transition-colors hover:bg-stone-50"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-sm font-medium text-white">
          {user.username.charAt(0).toUpperCase()}
        </div>
        <span className="hidden max-w-[120px] truncate text-sm font-medium text-stone-700 sm:inline">
          {user.username}
        </span>
        <svg 
          aria-hidden="true"
          className={`h-4 w-4 text-stone-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-48 rounded-xl border border-stone-200 bg-white py-1 shadow-xl" role="menu">
          <div className="border-b border-stone-100 px-4 py-2 text-sm text-stone-500">
            登录为: {user.username}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full px-4 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
            role="menuitem"
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
