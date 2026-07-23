'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './auth-context';

export function useAuthGuard(options?: { requireAuth?: boolean; requireGuest?: boolean }) {
  const auth = useAuth();
  const { loading, isAuthenticated } = auth;
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    if (options?.requireAuth && !isAuthenticated) {
      const redirectUrl = encodeURIComponent(pathname);
      router.push(`/login?redirect=${redirectUrl}`);
    } else if (options?.requireGuest && isAuthenticated) {
      router.push('/projects');
    }
  }, [loading, isAuthenticated, options?.requireAuth, options?.requireGuest, pathname, router]);

  return auth;
}

