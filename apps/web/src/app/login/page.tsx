'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth, User } from '@/lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') ?? '/projects';
  const { setAuthSession } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const data = await apiFetch<{
        accessToken: string;
        refreshToken: string;
        user: User;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
        }),
      });
      setAuthSession({ accessToken: data.accessToken, refreshToken: data.refreshToken }, data.user);
      router.push(redirectPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-[var(--dl-muted)]">
          Welcome back to Delayance AI Document Workspace
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--dl-accent)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Password
          <input
            name="password"
            type="password"
            required
            placeholder="••••••••"
            className="rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--dl-accent)]"
          />
        </label>
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded border border-[var(--dl-accent)] bg-[var(--dl-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="text-sm text-[var(--dl-muted)]">
        No account? <Link href="/register" className="text-[var(--dl-accent)] underline">Register</Link>
      </p>
    </main>
  );
}

