import type { WordcraftLayout } from '@delayance/validation';

export type { WordcraftLayout } from '@delayance/validation';

/** Fit without changing the user's persisted panel choices. */
export function fitWorkspacePanels(
  width: number,
  left: number,
  right: number,
): { left: number; right: number } {
  const available = Math.max(0, width - 480);
  return {
    left: left <= available ? left : 0,
    right: left + right <= available ? right : 0,
  };
}

/** Union of visible native regions. SVG clip paths also limit iframe pointer hit testing. */
export function editorRegions(layout: WordcraftLayout) {
  const { width, height, top, bottom, center, overlays, blocking } = layout;
  if (blocking) return [{ x: 0, y: 0, width, height }];
  return [
    { x: 0, y: 0, width, height: top },
    center,
    { x: 0, y: height - Math.min(bottom, height), width, height: bottom },
    ...overlays,
  ];
}
