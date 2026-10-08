'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthField, AuthShell } from '@/components/auth/auth-shell';
import { submitAuth } from '@/lib/auth-forms';
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      await submitAuth('/auth/forgot-password', { email });
      setStatus('If an account exists, a reset link will be sent.');
    } catch {
      setStatus('If an account exists, a reset link will be sent.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we’ll send you a reset link."
    >
      <form onSubmit={submit}>
        <AuthField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@yourdomain.com"
        />
        {status && (
          <p className="auth-message" role="status">
            {status}
          </p>
        )}
        <button className="primary-btn" type="submit" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
        <p className="signup">
          <Link href="/login">Back to sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
