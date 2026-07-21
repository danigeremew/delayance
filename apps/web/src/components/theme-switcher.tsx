'use client';

import type { AppTheme } from '@delayance/design-system';
import { useWorkspaceStore } from '@/lib/workspace-store';

const THEMES: AppTheme[] = ['light', 'dark', 'system', 'sepia', 'high-contrast'];

export function ThemeSwitcher() {
  const theme = useWorkspaceStore((s) => s.theme);
  const setTheme = useWorkspaceStore((s) => s.setTheme);

  return (
    <label className="flex items-center gap-2 text-sm text-[var(--dl-muted)]">
      Theme
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as AppTheme)}
        className="border border-[var(--dl-border)] bg-[var(--dl-panel)] px-2 py-1 text-sm text-[var(--dl-fg)]"
      >
        {THEMES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}
