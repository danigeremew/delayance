'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, setTokens } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const data = await apiFetch<{ accessToken: string; refreshToken: string }>(
        '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({
            name: form.get('name'),
            email: form.get('email'),
            password: form.get('password'),
          }),
        },
      );
      setTokens(data.accessToken, data.refreshToken);
      router.push('/projects');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold">Create account</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            name="name"
            required
            className="border border-[var(--dl-border)] bg-[var(--dl-panel)] px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            className="border border-[var(--dl-border)] bg-[var(--dl-panel)] px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            minLength={8}
            required
            className="border border-[var(--dl-border)] bg-[var(--dl-panel)] px-3 py-2"
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="border border-[var(--dl-accent)] bg-[var(--dl-accent)] px-4 py-2 text-white"
        >
          {loading ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="text-sm text-[var(--dl-muted)]">
        Already registered? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
