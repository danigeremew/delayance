'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export function UserMenu() {
  const { user, logout, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="text-xs font-medium text-[var(--dl-muted)] hover:text-[var(--dl-fg)]"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded border border-[var(--dl-accent)] bg-[var(--dl-accent)] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
        >
          Register
        </Link>
      </div>
    );
  }

  const initial = user.name ? user.name.charAt(0).toUpperCase() : 'U';

  async function handleLogout() {
    setOpen(false);
    await logout();
    router.push('/login');
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center justify-center h-8 w-8 rounded-full bg-[var(--dl-accent)] text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[var(--dl-accent)] focus:ring-offset-2"
        title={user.name}
      >
        {initial}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-56 rounded-md border border-[var(--dl-border)] bg-[var(--dl-panel)] py-1 shadow-lg ring-1 ring-black/5 z-50">
          <div className="border-b border-[var(--dl-border)] px-4 py-2 text-xs">
            <p className="font-semibold text-[var(--dl-fg)] truncate">{user.name}</p>
            <p className="text-[var(--dl-muted)] truncate">{user.email}</p>
          </div>
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-xs text-[var(--dl-fg)] hover:bg-[var(--dl-bg)]"
          >
            Account Settings
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-[var(--dl-bg)]"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
