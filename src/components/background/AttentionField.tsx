'use client';

import { useEffect } from 'react';
import { onFrame, pointer, trackPointer } from '@/lib/particleField';

/**
 * Attention, applied to the page itself.
 *
 * Every card on screen is a key; the cursor is the query. Each frame we score
 * the cards by distance, run a softmax over the scores, and hand each card its
 * own weight as `--attn`. The card the cursor is attending to lights up and
 * lifts; the rest recede — not by a hard :hover switch, but by a distribution
 * that always sums to one, the way attention actually behaves.
 *
 * All of the rendering is CSS. This only supplies the numbers.
 */

/** Softmax temperature, in pixels. Lower = sharper focus on one card. */
const TEMPERATURE = 230;

export default function AttentionField() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce), (hover: none)').matches) return;

    const root = document.documentElement;
    let nodes: HTMLElement[] = [];
    let rects: DOMRect[] = [];
    let stale = true;
    let wasActive = false;
    let written: Array<{ attn: string; mx: string; my: string } | undefined> = [];

    const invalidate = () => { stale = true; };
    const observer = new MutationObserver(invalidate);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', invalidate, { passive: true, capture: true });
    window.addEventListener('resize', invalidate);

    const untrack = trackPointer();
    const stop = onFrame(() => {
      // The pointer check comes before the re-measure on purpose. Anything that
      // touches the DOM marks the rects stale — and the page types its own
      // headings in a character at a time, streams text, and repaints canvases —
      // so re-measuring first meant a querySelectorAll plus a forced layout per
      // card on almost every frame, to feed an effect that does nothing at all
      // until the cursor is on the page.
      if (!pointer.active) {
        if (wasActive) {
          wasActive = false;
          root.style.setProperty('--focus', '0');
          for (const node of nodes) node.style.setProperty('--attn', '0');
          written = [];
        }
        return;
      }

      if (stale) {
        stale = false;
        nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-attend]'));
        rects = nodes.map(n => n.getBoundingClientRect());
        written = [];
      }
      if (!nodes.length) return;

      wasActive = true;
      root.style.setProperty('--focus', '1');

      // Read first, write after: interleaving the two would force a layout
      // recalculation per card, every frame.
      let best = 0;
      const weights = rects.map(rect => {
        const dx = Math.max(rect.left - pointer.x, 0, pointer.x - rect.right);
        const dy = Math.max(rect.top - pointer.y, 0, pointer.y - rect.bottom);
        const w = Math.exp(-Math.hypot(dx, dy) / TEMPERATURE);
        if (w > best) best = w;
        return w;
      });

      for (let i = 0; i < nodes.length; i++) {
        const rect = rects[i];
        // Normalised by the largest weight rather than the sum, so whatever the
        // cursor is nearest always reaches full strength.
        const attn = (weights[i] / (best || 1)).toFixed(3);
        const mx = `${Math.round(pointer.x - rect.left)}px`;
        const my = `${Math.round(pointer.y - rect.top)}px`;
        // Writing a custom property invalidates style for that subtree even
        // when the value is unchanged, and far-off cards round to the same
        // numbers frame after frame. Only write what actually moved.
        const node = nodes[i];
        const last = written[i];
        if (last && last.attn === attn && last.mx === mx && last.my === my) continue;
        written[i] = { attn, mx, my };
        node.style.setProperty('--attn', attn);
        node.style.setProperty('--mx', mx);
        node.style.setProperty('--my', my);
      }
    });

    return () => {
      stop();
      untrack();
      observer.disconnect();
      window.removeEventListener('scroll', invalidate, true);
      window.removeEventListener('resize', invalidate);
      root.style.removeProperty('--focus');
    };
  }, []);

  return null;
}
