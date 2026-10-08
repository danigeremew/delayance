'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading) router.replace(isAuthenticated ? '/projects' : '/login');
  }, [isAuthenticated, loading, router]);

  return null;
}
