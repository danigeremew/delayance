'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthField, AuthShell } from '@/components/auth/auth-shell';
import { submitAuth, type AuthResult } from '@/lib/auth-forms';
import { useAuth } from '@/lib/auth-context';

export default function RegisterPage() {
  const router = useRouter();
  const { setAuthSession } = useAuth();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const result = await submitAuth<AuthResult>('/auth/register', {
        email,
        firstName,
        lastName,
        password,
        confirmPassword,
      });
      setAuthSession(result.accessToken, result.user);
      router.replace('/projects');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthShell
      title="Create your account"
      description="Set up your Delayance workspace and start writing."
    >
      <form onSubmit={submit}>
        <div className="registration-fields">
          <AuthField
            id="firstName"
            label="First name"
            value={firstName}
            onChange={setFirstName}
            autoComplete="given-name"
          />
          <AuthField
            id="lastName"
            label="Last name"
            value={lastName}
            onChange={setLastName}
            autoComplete="family-name"
          />
          <div className="full">
            <AuthField
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="you@yourdomain.com"
            />
          </div>
          <AuthField
            id="password"
            label="Password"
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
        </div>
        {error && (
          <p className="auth-message" role="alert">
            {error}
          </p>
        )}
        <button className="primary-btn" type="submit" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
        <p className="signup">
          Already registered? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
