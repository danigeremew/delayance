'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/lib/use-auth-guard';
import {
  changePasswordApi,
  getSessionsApi,
  revokeAllSessionsApi,
  revokeSessionApi,
  apiFetch,
} from '@/lib/api';

interface Session {
  id: string;
  createdAt: string;
  expiresAt: string;
}

export default function AccountPage() {
  const router = useRouter();
  const { user, updateProfile, logout } = useAuthGuard({ requireAuth: true });

  // Profile Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Sessions State
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Ping worker test state
  const [pingResult, setPingResult] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user]);

  async function loadSessions() {
    setSessionsLoading(true);
    try {
      const list = await getSessionsApi();
      setSessions(list);
    } catch {
      // ignore
    } finally {
      setSessionsLoading(false);
    }
  }

  async function handleUpdateProfile(e: FormEvent) {
    e.preventDefault();
    setProfileLoading(true);
    setProfileMsg(null);
    try {
      await updateProfile({ name, email });
      setProfileMsg({ text: 'Profile updated successfully!' });
    } catch (err) {
      setProfileMsg({
        text: err instanceof Error ? err.message : 'Failed to update profile',
        error: true,
      });
    } finally {
      setProfileLoading(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword.length < 8) {
      setPasswordMsg({ text: 'New password must be at least 8 characters', error: true });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: 'Passwords do not match', error: true });
      return;
    }

    setPasswordLoading(true);
    try {
      await changePasswordApi({ currentPassword, newPassword });
      setPasswordMsg({ text: 'Password changed successfully! Other sessions have been signed out.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      loadSessions();
    } catch (err) {
      setPasswordMsg({
        text: err instanceof Error ? err.message : 'Failed to change password',
        error: true,
      });
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleRevokeSession(id: string) {
    try {
      await revokeSessionApi(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // ignore
    }
  }

  async function handleRevokeAllSessions() {
    try {
      await revokeAllSessionsApi();
      await loadSessions();
    } catch {
      // ignore
    }
  }

  async function enqueuePing() {
    try {
      const data = await apiFetch<{ jobId: string }>('/jobs/ping', { method: 'POST' });
      setPingResult(`Queued worker job ${data.jobId}`);
    } catch (err) {
      setPingResult(err instanceof Error ? err.message : 'Failed to queue job');
    }
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center p-6 text-sm text-[var(--dl-muted)]">
        Loading account information…
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <div className="flex items-center justify-between border-b border-[var(--dl-border)] pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Account Settings</h1>
          <p className="mt-1 text-sm text-[var(--dl-muted)]">
            Manage your profile details, password, and active authentication sessions.
          </p>
        </div>
        <Link
          href="/projects"
          className="rounded border border-[var(--dl-border)] px-4 py-2 text-xs font-medium text-[var(--dl-fg)] hover:bg-[var(--dl-panel)]"
        >
          ← Go to Projects
        </Link>
      </div>

      {/* 1. Profile Card */}
      <section className="rounded-lg border border-[var(--dl-border)] bg-[var(--dl-panel)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Profile Information</h2>
        <p className="mt-1 text-xs text-[var(--dl-muted)]">Update your name and email address.</p>
        <form onSubmit={handleUpdateProfile} className="mt-4 flex flex-col gap-4 max-w-md">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Full Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="rounded border border-[var(--dl-border)] bg-[var(--dl-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--dl-accent)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Email Address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded border border-[var(--dl-border)] bg-[var(--dl-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--dl-accent)]"
            />
          </label>
          {profileMsg ? (
            <div
              className={`rounded p-3 text-xs ${
                profileMsg.error
                  ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
                  : 'border border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300'
              }`}
            >
              {profileMsg.text}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={profileLoading}
            className="w-fit rounded border border-[var(--dl-accent)] bg-[var(--dl-accent)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {profileLoading ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </section>

      {/* 2. Security / Password Card */}
      <section className="rounded-lg border border-[var(--dl-border)] bg-[var(--dl-panel)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Security & Password</h2>
        <p className="mt-1 text-xs text-[var(--dl-muted)]">
          Ensure your account stays safe with a strong password.
        </p>
        <form onSubmit={handleChangePassword} className="mt-4 flex flex-col gap-4 max-w-md">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Current Password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="rounded border border-[var(--dl-border)] bg-[var(--dl-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--dl-accent)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            New Password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
              className="rounded border border-[var(--dl-border)] bg-[var(--dl-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--dl-accent)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Confirm New Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
              className="rounded border border-[var(--dl-border)] bg-[var(--dl-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--dl-accent)]"
            />
          </label>
          {passwordMsg ? (
            <div
              className={`rounded p-3 text-xs ${
                passwordMsg.error
                  ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
                  : 'border border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300'
              }`}
            >
              {passwordMsg.text}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={passwordLoading}
            className="w-fit rounded border border-[var(--dl-accent)] bg-[var(--dl-accent)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {passwordLoading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </section>

      {/* 3. Active Sessions Card */}
      <section className="rounded-lg border border-[var(--dl-border)] bg-[var(--dl-panel)] p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Active Sessions</h2>
            <p className="mt-1 text-xs text-[var(--dl-muted)]">
              Devices and refresh tokens currently logged in to your account.
            </p>
          </div>
          {sessions.length > 1 ? (
            <button
              type="button"
              onClick={handleRevokeAllSessions}
              className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
            >
              Sign Out All Devices
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {sessionsLoading ? (
            <p className="text-xs text-[var(--dl-muted)]">Loading sessions…</p>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-[var(--dl-muted)]">No active sessions found.</p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded border border-[var(--dl-border)] bg-[var(--dl-bg)] p-3 text-xs"
              >
                <div>
                  <p className="font-mono text-[11px] text-[var(--dl-muted)]">Session {s.id.slice(0, 8)}…</p>
                  <p className="mt-0.5 text-[var(--dl-fg)]">
                    Created: {new Date(s.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevokeSession(s.id)}
                  className="rounded border border-[var(--dl-border)] px-2.5 py-1 text-xs font-medium text-[var(--dl-fg)] hover:bg-[var(--dl-panel)]"
                >
                  Revoke
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 4. Worker Integration Check */}
      <section className="rounded-lg border border-[var(--dl-border)] bg-[var(--dl-panel)] p-6 shadow-sm">
        <h2 className="text-base font-semibold">Background Jobs Diagnostic</h2>
        <p className="mt-1 text-xs text-[var(--dl-muted)]">
          Queue a ping job to verify Redis/BullMQ worker processing for this account.
        </p>
        <div className="mt-3 flex items-center gap-4">
          <button
            type="button"
            onClick={enqueuePing}
            className="rounded border border-[var(--dl-border)] bg-[var(--dl-bg)] px-3 py-1.5 text-xs font-medium text-[var(--dl-fg)] hover:bg-[var(--dl-panel)]"
          >
            Enqueue Worker Ping
          </button>
          {pingResult ? <span className="text-xs font-mono text-[var(--dl-muted)]">{pingResult}</span> : null}
        </div>
      </section>

      {/* 5. Account Logout Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-[var(--dl-border)]">
        <button
          type="button"
          onClick={async () => {
            await logout();
            router.push('/login');
          }}
          className="rounded border border-red-600 bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700"
        >
          Sign Out of Account
        </button>
      </div>
    </main>
  );
}

