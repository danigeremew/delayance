'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuthGuard } from '@/lib/use-auth-guard';
import { BrandLogo } from '@/components/brand-logo';

export default function AccountPage() {
  const { user, updateProfile, logout } = useAuthGuard({ requireAuth: true });
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (user) {
      setName(user.name);
    }
  }, [user]);
  if (!user)
    return (
      <main className="mx-auto flex min-h-screen items-center justify-center p-6 text-sm text-[var(--dl-muted)]">
        Loading account information…
      </main>
    );
  async function save(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      await updateProfile({ name });
      setMessage('Profile updated successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Profile update failed');
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <div className="flex items-center justify-between border-b border-[var(--dl-border)] pb-6">
        <div className="flex items-center gap-3">
          <BrandLogo href="/projects" className="dl-account-brand" />
          <div>
            <h1 className="text-2xl font-bold">Account Settings</h1>
            <p className="mt-1 text-sm text-[var(--dl-muted)]">
              Manage your Delayance profile and identity session.
            </p>
          </div>
        </div>
        <Link
          href="/projects"
          className="rounded border border-[var(--dl-border)] px-4 py-2 text-xs"
        >
          ← Go to Projects
        </Link>
      </div>
      <section className="rounded-lg border border-[var(--dl-border)] bg-[var(--dl-panel)] p-6">
        <h2 className="text-lg font-semibold">Profile Information</h2>
        <form onSubmit={save} className="mt-4 flex max-w-md flex-col gap-4">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Full Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="rounded border border-[var(--dl-border)] bg-[var(--dl-bg)] px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Email Address
            <input
              value={user.email}
              readOnly
              className="rounded border border-[var(--dl-border)] bg-[var(--dl-bg)] px-3 py-2 text-sm opacity-70"
            />
          </label>
          {message ? <p className="text-xs text-[var(--dl-muted)]">{message}</p> : null}
          <button
            disabled={loading}
            className="w-fit rounded bg-[var(--dl-accent)] px-4 py-2 text-xs text-white"
          >
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </section>
      <section className="rounded-lg border border-[var(--dl-border)] bg-[var(--dl-panel)] p-6">
        <h2 className="text-lg font-semibold">Security</h2>
        <p className="mt-1 text-xs text-[var(--dl-muted)]">
          Passwords are stored by Keycloak. Use Delayance recovery to change yours.
        </p>
        <Link
          href="/forgot-password"
          className="mt-4 inline-block text-xs text-[var(--dl-accent)] underline"
        >
          Reset password
        </Link>
      </section>
      <button
        type="button"
        onClick={() => {
          void logout();
        }}
        className="w-fit rounded border border-red-600 bg-red-600 px-4 py-2 text-xs text-white"
      >
        Sign Out of Account
      </button>
    </main>
  );
}
