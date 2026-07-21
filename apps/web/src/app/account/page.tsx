'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Me {
  id: string;
  email: string;
  name: string;
}

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setError('Not signed in');
      return;
    }
    fetch(`${apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'Failed to load profile');
        setMe(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'));
  }, []);

  async function enqueuePing() {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    const res = await fetch(`${apiUrl}/jobs/ping`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setPingResult(res.ok ? `Queued job ${data.jobId}` : data.message);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Account</h1>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {me ? (
        <div className="border border-[var(--dl-border)] bg-[var(--dl-panel)] p-4 text-sm">
          <p>
            <span className="text-[var(--dl-muted)]">Name:</span> {me.name}
          </p>
          <p>
            <span className="text-[var(--dl-muted)]">Email:</span> {me.email}
          </p>
        </div>
      ) : null}
      <button
        type="button"
        onClick={enqueuePing}
        className="w-fit border border-[var(--dl-border)] px-3 py-2 text-sm"
      >
        Enqueue worker ping
      </button>
      {pingResult ? <p className="text-sm text-[var(--dl-muted)]">{pingResult}</p> : null}
      <Link href="/" className="text-sm">
        Home
      </Link>
    </main>
  );
}
