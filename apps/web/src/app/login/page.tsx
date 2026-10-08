'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthField, AuthShell } from '@/components/auth/auth-shell';
import { submitAuth, type AuthResult } from '@/lib/auth-forms';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { setAuthSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await submitAuth<AuthResult>('/auth/login', { email, password });
      setAuthSession(result.accessToken, result.user);
      router.replace('/projects');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthShell
      title="Welcome back"
      description="Access your documents, notes, and writing workspace."
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
        <AuthField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="Enter your password"
        />
        <Link className="forgot" href="/forgot-password">
          Forgot password?
        </Link>
        {error && (
          <p className="auth-message" role="alert">
            {error}
          </p>
        )}
        <button className="primary-btn" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
        <p className="signup">
          New user? <Link href="/register">Create account</Link>
        </p>
      </form>
    </AuthShell>
  );
}
