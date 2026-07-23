'use client';

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

const key = new PluginKey<DecorationSet>('printPageGaps');

/**
 * On-screen A4 (210×297mm at 96dpi ≈ 794×1123), scaled up so pages
 * read at a comfortable Docs-like size while keeping A4 proportions.
 * Each page is a fixed box — height does not shrink with content.
 */
const A4_SCALE = 1.25;
export const A4_PAGE_WIDTH = Math.round(794 * A4_SCALE); // 993
export const A4_PAGE_HEIGHT = Math.round(1123 * A4_SCALE); // 1404
export const PAGE_MARGIN_Y = Math.round(75 * A4_SCALE); // ~94
const PAGE_CONTENT_HEIGHT = A4_PAGE_HEIGHT - PAGE_MARGIN_Y * 2;
export const PAGE_GAP = Math.round(44 * A4_SCALE); // ~55

function isPrintMode(view: EditorView) {
  return Boolean(view.dom.closest('.dl-print-surface'));
}

const LEAF_BLOCKS = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'codeBlock',
  'table',
  'figure',
  'horizontalRule',
  'pageBreak',
  'sectionBreak',
  'equation',
]);

interface BlockTarget {
  pos: number;
  top: number;
  bottom: number;
  height: number;
  type: string;
}

interface GapSpec {
  pos: number;
  filler: number;
  kind: 'break' | 'trail';
}

function collectBlockTargets(view: EditorView): BlockTarget[] {
  const targets: BlockTarget[] = [];
  view.state.doc.descendants((node, pos) => {
    if (!node.isBlock) return false;
    if (node.type.name === 'doc') return true;
    if (node.type.name === 'section' || node.type.name === 'appendix') return true;
    if (!LEAF_BLOCKS.has(node.type.name)) return true;

    const dom = view.nodeDOM(pos) as HTMLElement | null;
    if (!dom || !(dom instanceof HTMLElement)) return false;

    const top = dom.offsetTop;
    const height = dom.offsetHeight;
    targets.push({
      pos,
      top,
      bottom: top + height,
      height,
      type: node.type.name,
    });
    return false;
  });
  return targets;
}

/** Content Y with existing auto-break widgets subtracted (stable across recomputes). */
function contentY(top: number, breaksAbove: { top: number; height: number }[]): number {
  let y = top;
  for (const b of breaksAbove) {
    if (b.top < top) y -= b.height;
  }
  return Math.max(0, y);
}

function createBreakWidget(gap: GapSpec, index: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className =
    gap.kind === 'trail'
      ? 'dl-auto-page-break dl-auto-page-break-trail'
      : 'dl-auto-page-break';
  wrap.contentEditable = 'false';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.dataset.pageGap = String(index + 1);
  wrap.dataset.kind = gap.kind;

  // Finish the current page's content band.
  if (gap.filler > 0) {
    const filler = document.createElement('div');
    filler.className = 'dl-auto-page-filler';
    filler.style.height = `${gap.filler}px`;
    wrap.appendChild(filler);
  }

  if (gap.kind === 'break') {
    const bottomPad = document.createElement('div');
    bottomPad.className = 'dl-auto-page-pad dl-auto-page-pad-bottom';
    bottomPad.style.height = `${PAGE_MARGIN_Y}px`;
    wrap.appendChild(bottomPad);

    const band = document.createElement('div');
    band.className = 'dl-auto-page-gap';
    band.style.height = `${PAGE_GAP}px`;
    wrap.appendChild(band);

    const topPad = document.createElement('div');
    topPad.className = 'dl-auto-page-pad dl-auto-page-pad-top';
    topPad.style.height = `${PAGE_MARGIN_Y}px`;
    wrap.appendChild(topPad);
  }

  // Always show one empty next page under the last page that has content.
  if (gap.kind === 'trail') {
    const bottomPad = document.createElement('div');
    bottomPad.className = 'dl-auto-page-pad dl-auto-page-pad-bottom';
    bottomPad.style.height = `${PAGE_MARGIN_Y}px`;
    wrap.appendChild(bottomPad);

    const band = document.createElement('div');
    band.className = 'dl-auto-page-gap';
    band.style.height = `${PAGE_GAP}px`;
    wrap.appendChild(band);

    const topPad = document.createElement('div');
    topPad.className = 'dl-auto-page-pad dl-auto-page-pad-top';
    topPad.style.height = `${PAGE_MARGIN_Y}px`;
    wrap.appendChild(topPad);

    const blank = document.createElement('div');
    blank.className = 'dl-auto-page-filler dl-auto-page-blank';
    blank.style.height = `${PAGE_CONTENT_HEIGHT}px`;
    wrap.appendChild(blank);
  }

  return wrap;
}

function buildGapDecorations(view: EditorView): { set: DecorationSet; sig: string } {
  if (!isPrintMode(view)) return { set: DecorationSet.empty, sig: 'off' };

  const pm = view.dom as HTMLElement;
  if (!pm.isConnected) return { set: DecorationSet.empty, sig: 'detached' };

  const existingBreaks = Array.from(
    pm.querySelectorAll('.dl-auto-page-break:not(.dl-auto-page-break-trail)'),
  ).map((el) => {
    const node = el as HTMLElement;
    return { top: node.offsetTop, height: node.offsetHeight };
  });

  const all = collectBlockTargets(view);
  // Include empty paragraphs — Enter/new lines must paginate onto the next page
  // instead of stretching the current page.
  const blocks = all.filter((b) => b.type !== 'pageBreak');
  const gaps: GapSpec[] = [];
  let pageEnd = PAGE_CONTENT_HEIGHT;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const y = contentY(block.top, existingBreaks);
    const yBottom = contentY(block.bottom, existingBreaks);

    if (i === 0) {
      while (pageEnd < yBottom - 12) {
        pageEnd += PAGE_CONTENT_HEIGHT;
      }
      continue;
    }

    const crosses = y < pageEnd && yBottom > pageEnd + 12;
    const past = y >= pageEnd;
    if (!crosses && !past) continue;

    // Pad from end of previous content (past) or from this block's top (crosses).
    const prevBottom = i > 0 ? contentY(blocks[i - 1]!.bottom, existingBreaks) : 0;
    const filler = Math.max(0, Math.round(pageEnd - (past ? prevBottom : y)));
    if (gaps[gaps.length - 1]?.pos !== block.pos) {
      gaps.push({ pos: block.pos, filler, kind: 'break' });
    }
    pageEnd += PAGE_CONTENT_HEIGHT;
  }

  // Pad the last content page to full A4, then always show one empty next page.
  const lastBottom = blocks.length
    ? contentY(blocks[blocks.length - 1]!.bottom, existingBreaks)
    : 0;
  const endFiller = Math.max(0, Math.round(pageEnd - lastBottom));
  gaps.push({
    pos: view.state.doc.content.size,
    filler: endFiller,
    kind: 'trail',
  });

  const sig = gaps.map((g) => `${g.kind}:${g.pos}:${g.filler}`).join('|');
  const set = DecorationSet.create(
    view.state.doc,
    gaps.map((gap, index) =>
      Decoration.widget(gap.pos, () => createBreakWidget(gap, index), {
        side: gap.kind === 'trail' ? 1 : -1,
        ignoreSelection: true,
        key: `print-gap-${gap.kind}-${index}-${gap.pos}-${gap.filler}`,
      }),
    ),
  );
  return { set, sig };
}

/**
 * Draws fixed-height A4 pages: content filler, top/bottom pads, desk gap,
 * and a trailing blank page under the last content page.
 */
export const PrintPageGaps = Extension.create({
  name: 'printPageGaps',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(key) as DecorationSet | undefined;
            if (meta !== undefined) return meta;
            if (tr.docChanged) return old.map(tr.mapping, tr.doc);
            return old;
          },
        },
        props: {
          decorations(state) {
            return key.getState(state) ?? DecorationSet.empty;
          },
        },
        view(editorView) {
          let raf = 0;
          let lastSig = '';
          let applying = false;

          const recompute = () => {
            if (applying) return;
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
              if (applying) return;
              const { set: next, sig } = buildGapDecorations(editorView);
              if (sig === lastSig) return;
              lastSig = sig;
              applying = true;
              const tr = editorView.state.tr.setMeta(key, next).setMeta('addToHistory', false);
              editorView.dispatch(tr);
              requestAnimationFrame(() => {
                applying = false;
              });
            });
          };

          const ro = new ResizeObserver(() => recompute());
          ro.observe(editorView.dom);

          const mo = new MutationObserver(() => recompute());
          const root = editorView.dom.closest('.dl-preview-desk') ?? editorView.dom.parentElement;
          if (root) {
            mo.observe(root, {
              attributes: true,
              subtree: true,
              attributeFilter: ['class'],
            });
          }

          recompute();

          return {
            update(view, prevState) {
              if (!view.state.doc.eq(prevState.doc)) recompute();
            },
            destroy() {
              cancelAnimationFrame(raf);
              ro.disconnect();
              mo.disconnect();
            },
          };
        },
      }),
    ];
  },
});
