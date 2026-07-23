'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppTheme } from '@delayance/design-system';

type LayoutMode = 'continuous' | 'print';

/** Tools live on the left; AI is always on the right. */
export type LeftTab =
  | 'documents'
  | 'outline'
  | 'sources'
  | 'memory'
  | 'comments'
  | 'health'
  | 'layout'
  | 'io';

export const LEFT_TABS: { id: LeftTab; label: string }[] = [
  { id: 'documents', label: 'Documents' },
  { id: 'outline', label: 'Outline' },
  { id: 'sources', label: 'Sources' },
  { id: 'memory', label: 'Memory' },
  { id: 'comments', label: 'Comments' },
  { id: 'health', label: 'Health' },
  { id: 'layout', label: 'Layout' },
  { id: 'io', label: 'Export' },
];


export const SIDEBAR_MIN = 260;
export const SIDEBAR_MAX = 640;
export const LEFT_SIDEBAR_DEFAULT = 380;
export const RIGHT_SIDEBAR_DEFAULT = 400;

function clampSidebar(width: number) {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(width)));
}

interface WorkspaceState {
  theme: AppTheme;
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  leftTab: LeftTab;
  layoutMode: LayoutMode;
  saveStatus: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  selectedNodeId: string | null;
  setTheme: (theme: AppTheme) => void;
  setLeftOpen: (open: boolean) => void;
  setRightOpen: (open: boolean) => void;
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  setLeftTab: (tab: LeftTab) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setSaveStatus: (status: WorkspaceState['saveStatus']) => void;
  setSelectedNodeId: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      theme: 'system',
      leftOpen: true,
      rightOpen: true,
      leftWidth: LEFT_SIDEBAR_DEFAULT,
      rightWidth: RIGHT_SIDEBAR_DEFAULT,
      leftTab: 'documents',
      layoutMode: 'print',
      saveStatus: 'idle',
      selectedNodeId: null,
      setTheme: (theme) => set({ theme }),
      setLeftOpen: (leftOpen) => set({ leftOpen }),
      setRightOpen: (rightOpen) => set({ rightOpen }),
      setLeftWidth: (width) => set({ leftWidth: clampSidebar(width) }),
      setRightWidth: (width) => set({ rightWidth: clampSidebar(width) }),
      setLeftTab: (leftTab) => set({ leftTab }),
      setLayoutMode: (layoutMode) => set({ layoutMode }),
      setSaveStatus: (saveStatus) => set({ saveStatus }),
      setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
    }),
    {
      name: 'delayance-workspace',
      partialize: (s) => ({
        theme: s.theme,
        leftOpen: s.leftOpen,
        rightOpen: s.rightOpen,
        leftWidth: s.leftWidth,
        rightWidth: s.rightWidth,
        layoutMode: s.layoutMode,
        leftTab: s.leftTab,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<WorkspaceState>;
        const leftTab =
          p.leftTab && LEFT_TABS.some((t) => t.id === p.leftTab)
            ? p.leftTab
            : current.leftTab;
        return {
          ...current,
          ...p,
          leftTab,
        };
      },
    },
  ),
);

export function resolveTheme(theme: AppTheme): Exclude<AppTheme, 'system'> {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
