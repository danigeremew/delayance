'use client';

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

export function SidebarResizeHandle({
  side,
  onResize,
}: {
  side: 'left' | 'right';
  onResize: (nextWidth: number) => void;
}) {
  const startX = useRef(0);
  const startWidth = useRef(0);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const aside = e.currentTarget.parentElement;
    if (!aside) return;
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = aside.getBoundingClientRect().width;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      const next =
        side === 'left' ? startWidth.current + delta : startWidth.current - delta;
      onResize(next);
    },
    [onResize, side],
  );

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side} sidebar`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`absolute top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-[var(--dl-accent)]/30 active:bg-[var(--dl-accent)]/40 ${
        side === 'left' ? 'right-0' : 'left-0'
      }`}
    />
  );
}
