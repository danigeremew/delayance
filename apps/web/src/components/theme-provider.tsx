'use client';

import { useEffect } from 'react';
import { resolveTheme, useWorkspaceStore } from '@/lib/workspace-store';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useWorkspaceStore((s) => s.theme);

  useEffect(() => {
    const apply = () => {
      document.documentElement.setAttribute('data-theme', resolveTheme(theme));
    };
    apply();
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  return children;
}
