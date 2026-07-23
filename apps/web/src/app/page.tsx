'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '@/lib/api';
import { ThemeSwitcher } from '@/components/theme-switcher';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:48722';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    if (getAccessToken()) {
      router.replace('/projects');
    }
  }, [router]);

  return (
    <div className="dl-home">
      <header className="dl-home-top">
        <div className="dl-home-brand">
          <span className="dl-home-logo">Delayance</span>
        </div>
        <ThemeSwitcher />
      </header>
      <main className="dl-home-main dl-landing">
        <h1 className="dl-home-title">AI document workspace</h1>
        <p className="dl-home-subtitle">
          Structured documents with deterministic numbering, Word-compatible export, and local
          Ollama AI by default.
        </p>
        <div className="dl-landing-actions">
          <Link href="/login" className="dl-home-primary-btn no-underline">
            Sign in
          </Link>
          <Link href="/register" className="dl-home-ghost-btn no-underline">
            Create account
          </Link>
        </div>
        <p className="dl-home-muted" style={{ marginTop: '2rem', fontSize: '0.75rem' }}>
          API: {apiUrl}
        </p>
      </main>
    </div>
  );
}
