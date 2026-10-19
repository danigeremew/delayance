import { describe, expect, it } from 'vitest';
import { wordcraftHostLayoutSchema, wordcraftLayoutSchema } from '@delayance/validation';
import { editorRegions, fitWorkspacePanels, type WordcraftLayout } from './workspace-layout';

const layout: WordcraftLayout = {
  embeddedLayout: 1,
  width: 1440,
  height: 900,
  top: 156,
  bottom: 28,
  center: { x: 380, y: 156, width: 660, height: 716 },
  overlays: [{ x: 80, y: 130, width: 240, height: 300 }],
  blocking: false,
  writable: true,
  canUndo: true,
  canRedo: false,
};

describe('integrated workspace layout', () => {
  it('collapses the assistant first and restores persisted widths when space returns', () => {
    expect(fitWorkspacePanels(1440, 380, 400)).toEqual({ left: 380, right: 400 });
    expect(fitWorkspacePanels(1100, 380, 400)).toEqual({ left: 380, right: 0 });
    expect(fitWorkspacePanels(700, 380, 400)).toEqual({ left: 0, right: 0 });
    expect(fitWorkspacePanels(1000, 0, 400)).toEqual({ left: 0, right: 400 });
    expect(fitWorkspacePanels(1440, 380, 400)).toEqual({ left: 380, right: 400 });
  });
  it('keeps ribbon/status full width and includes native popups above sidebars', () => {
    expect(editorRegions(layout)).toEqual([
      { x: 0, y: 0, width: 1440, height: 156 },
      layout.center,
      { x: 0, y: 872, width: 1440, height: 28 },
      ...layout.overlays,
    ]);
    expect(editorRegions({ ...layout, blocking: true })).toEqual([
      { x: 0, y: 0, width: 1440, height: 900 },
    ]);
  });
  it('rejects malformed, unbounded and outdated layout messages', () => {
    const parse = (Values: unknown) =>
      wordcraftLayoutSchema.safeParse({ MessageId: 'Delayance_Layout', Values }).success;
    expect(parse(layout)).toBe(true);
    expect(parse({ ...layout, embeddedLayout: 0 })).toBe(false);
    expect(parse({ ...layout, width: Infinity })).toBe(false);
    expect(parse({ ...layout, center: { ...layout.center, x: -1 } })).toBe(false);
    expect(parse({ ...layout, overlays: Array(129).fill(layout.center) })).toBe(false);
    expect(wordcraftHostLayoutSchema.safeParse({ left: -1, right: 0, theme: {} }).success).toBe(
      false,
    );
  });
});
