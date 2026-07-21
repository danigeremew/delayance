'use client';

import { Command } from 'cmdk';

type Action =
  | 'toggle-left'
  | 'toggle-right'
  | 'print-layout'
  | 'continuous'
  | 'insert-section';

export function CommandPalette({
  open,
  onOpenChange,
  onAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: Action) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[20vh]">
      <div className="w-full max-w-md border border-[var(--dl-border)] bg-[var(--dl-panel)] shadow-lg">
        <Command
          className="text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onOpenChange(false);
          }}
        >
          <Command.Input
            autoFocus
            placeholder="Type a command…"
            className="w-full border-b border-[var(--dl-border)] bg-transparent px-3 py-2 outline-none"
          />
          <Command.List className="max-h-64 overflow-auto p-1">
            <Command.Empty className="px-3 py-2 text-[var(--dl-muted)]">No results</Command.Empty>
            {(
              [
                ['toggle-left', 'Toggle left panel'],
                ['toggle-right', 'Toggle right panel'],
                ['continuous', 'Continuous layout'],
                ['print-layout', 'Print layout'],
                ['insert-section', 'Insert section'],
              ] as const
            ).map(([id, label]) => (
              <Command.Item
                key={id}
                value={label}
                onSelect={() => {
                  onAction(id);
                  onOpenChange(false);
                }}
                className="cursor-pointer px-3 py-2 aria-selected:bg-[var(--dl-bg)]"
              >
                {label}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
        <button
          type="button"
          className="w-full border-t border-[var(--dl-border)] px-3 py-2 text-left text-xs text-[var(--dl-muted)]"
          onClick={() => onOpenChange(false)}
        >
          Esc to close
        </button>
      </div>
    </div>
  );
}
