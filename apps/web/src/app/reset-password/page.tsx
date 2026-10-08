'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { AuthField, AuthShell } from '@/components/auth/auth-shell';
import { submitAuth } from '@/lib/auth-forms';
export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    setToken(value);
    if (value) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setMessage('Passwords do not match');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      await submitAuth('/auth/reset-password', { token, password, confirmPassword });
      setDone(true);
      setMessage('Password updated. You can now sign in.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthShell
      title="Choose a new password"
      description="Create a strong password for your Delayance account."
    >
      {!token && !done ? (
        <p className="auth-message" role="alert">
          This reset link is missing or invalid.{' '}
          <Link href="/forgot-password">Request another link</Link>.
        </p>
      ) : (
        <form onSubmit={submit}>
          {!done && (
            <>
              <AuthField
                id="password"
                label="New password"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
              <AuthField
                id="confirmPassword"
                label="Confirm password"
                type="password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
              />
            </>
          )}
          {message && (
            <p className="auth-message" role={done ? 'status' : 'alert'}>
              {message}
            </p>
          )}
          {!done && (
            <button className="primary-btn" type="submit" disabled={loading}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
          )}
          <p className="signup">
            <Link href="/login">Back to sign in</Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
