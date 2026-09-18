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

    const invalidate = () => { stale = true; };
    const observer = new MutationObserver(invalidate);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', invalidate, { passive: true, capture: true });
    window.addEventListener('resize', invalidate);

    const untrack = trackPointer();
    const stop = onFrame(() => {
      if (stale) {
        stale = false;
        nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-attend]'));
        rects = nodes.map(n => n.getBoundingClientRect());
      }
      if (!nodes.length) return;

      if (!pointer.active) {
        if (wasActive) {
          wasActive = false;
          root.style.setProperty('--focus', '0');
          for (const node of nodes) node.style.setProperty('--attn', '0');
        }
        return;
      }
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
        nodes[i].style.setProperty('--attn', (weights[i] / (best || 1)).toFixed(3));
        nodes[i].style.setProperty('--mx', `${Math.round(pointer.x - rect.left)}px`);
        nodes[i].style.setProperty('--my', `${Math.round(pointer.y - rect.top)}px`);
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
