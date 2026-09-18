'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { onFrame, warp } from '@/lib/particleField';

/**
 * Scroll past the end of a page and you fly to the next one.
 *
 * The gesture is continuous rather than a trigger: overscroll accumulates into
 * `warp.level`, the starfield stretches into streaks in proportion, and a
 * sustained push crosses the line and navigates. Ease off and it falls back to
 * rest, so a stray flick at the bottom of a page costs nothing.
 */

/** Accumulated scroll, in CSS pixels, that amounts to a full jump. */
const TRAVEL = 400;
/** How fast an unattended charge bleeds away, in pixels per 60fps frame. */
const DECAY = 2.0;
/** Below this the field is at rest and the prompt is hidden. */
const WAKE = 0.05;
/**
 * Quiet needed before a new gesture counts, in ms.
 *
 * A trackpad flick keeps emitting wheel events long after the fingers have
 * lifted, and the page you just arrived on starts at the top — which is exactly
 * the condition the backwards jump looks for. Without this, one flick upward
 * carried straight through two pages: projects to publications to about.
 * Momentum has no gaps in it, so a real pause is what separates one gesture
 * from the next.
 */
const GESTURE_GAP = 220;

/**
 * Wheel deltas are not all in pixels: a classic mouse reports lines, and some
 * report pages. Left unnormalised, a line-mode wheel sends ~3 per notch, so the
 * charge could never reach TRAVEL and the jump simply never fired.
 */
function pixels(event: WheelEvent) {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * window.innerHeight;
  return event.deltaY;
}

export default function WarpNav({ pages }: { pages: { title: string; href: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const hintRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLElement>(null);

  const charge = useRef(0);
  const target = useRef<string | null>(null);
  const launched = useRef(false);
  const zoom = useRef(0);
  // Disarmed on arrival; re-armed by the first wheel event after a real pause.
  const armed = useRef(true);
  const lastWheelAt = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const here = () => {
      const path = pathname.replace(/\/+$/, '') || '/';
      return pages.findIndex(p => (p.href.replace(/\/+$/, '') || '/') === path);
    };

    const onWheel = (event: WheelEvent) => {
      if (launched.current) return;

      const now = performance.now();
      const gap = now - lastWheelAt.current;
      lastWheelAt.current = now;
      if (!armed.current) {
        // Still the tail of the flick that brought us here: swallow it.
        if (gap < GESTURE_GAP) { charge.current = 0; target.current = null; return; }
        armed.current = true;
      }

      const doc = document.documentElement;
      const delta = pixels(event);
      const atBottom = window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
      const atTop = window.scrollY <= 1;
      const index = here();
      if (index < 0) return;

      const forward = delta > 0 && atBottom && index < pages.length - 1;
      const back = delta < 0 && atTop && index > 0;
      if (!forward && !back) {
        charge.current = 0;
        target.current = null;
        return;
      }

      const next = pages[index + (forward ? 1 : -1)];
      if (target.current !== next.href) charge.current = 0;
      target.current = next.href;
      charge.current = Math.min(TRAVEL, charge.current + Math.abs(delta));

      if (charge.current >= TRAVEL) {
        launched.current = true;
        // Let the field reach full flight before the page swaps underneath it.
        window.setTimeout(() => router.push(next.href), 300);
      }
    };

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { charge.current = 0; } };

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);

    let shownLabel = '';
    const stop = onFrame((_now, delta) => {
      const wanted = launched.current ? 1 : charge.current / TRAVEL;
      // Slow to fall away: the meteors must still be streaming while the
      // incoming page settles, or the two motions read as unrelated.
      const ease = wanted > warp.level ? 0.18 : 0.035;
      warp.level += (wanted - warp.level) * Math.min(1, ease * delta);
      if (!launched.current) charge.current = Math.max(0, charge.current - DECAY * delta);

      // Written straight to the DOM rather than through React state. Driving a
      // component re-render on every animation frame is what made this feel
      // heavy: reconciliation was competing with the canvas for the same frame.
      // The page zoom is a separate signal from the meteors. `warp.level`
      // lingers on purpose so the streaks are still flying while the next page
      // settles; if the container transform rode the same value, the outgoing
      // zoom would still be unwinding as the incoming page expanded, and the
      // two would cancel into no movement at all.
      const zoomWanted = launched.current ? 1 : charge.current / TRAVEL;
      zoom.current += (zoomWanted - zoom.current) * Math.min(1, 0.2 * delta);
      const root = document.documentElement;
      if (zoom.current > 0.004) {
        root.dataset.warping = 'true';
        // The final numbers are computed here, not in the stylesheet:
        // lightningcss cannot validate `scale(calc(1 + var(...) * n))` and
        // silently drops the whole rule that contains it.
        root.style.setProperty('--warp-scale', (1 + zoom.current * 0.42).toFixed(4));
        root.style.setProperty('--warp-fade', (1 - zoom.current * 0.92).toFixed(4));
      } else if (root.dataset.warping) {
        // Removed entirely rather than set to zero: a `transform` of any value
        // makes the element a containing block, which would break the
        // position:fixed modality rails on the projects page.
        delete root.dataset.warping;
        root.style.removeProperty('--warp-scale');
        root.style.removeProperty('--warp-fade');
      }

      const hint = hintRef.current;
      if (!hint) return;
      // Once launched, hold the prompt at full for the moment before the page
      // swaps: freezing it mid-bar reads as the gesture having stalled.
      if (launched.current) {
        if (barRef.current) barRef.current.style.transform = 'scaleX(1)';
        return;
      }

      const active = warp.level > WAKE && target.current !== null;
      hint.dataset.on = String(active);
      if (!active) return;

      const label = pages.find(p => p.href === target.current)?.title ?? '';
      if (label !== shownLabel && labelRef.current) {
        shownLabel = label;
        labelRef.current.textContent = `Keep scrolling to ${label}`;
      }
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${(charge.current / TRAVEL).toFixed(3)})`;
      }
    });

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      stop();
      warp.level = 0;
      delete document.documentElement.dataset.warping;
      document.documentElement.style.removeProperty('--warp-scale');
      document.documentElement.style.removeProperty('--warp-fade');
    };
  }, [pages, router, pathname]);

  // A new page has mounted: bring the field back out of flight.
  useEffect(() => {
    launched.current = false;
    charge.current = 0;
    target.current = null;
    // The next page has to be asked for deliberately, not coasted into.
    armed.current = false;
    lastWheelAt.current = performance.now();
    // Drop the zoom instantly on arrival so the incoming page can expand from
    // its own starting scale rather than inheriting the outgoing one.
    zoom.current = 0;
    const root = document.documentElement;
    delete root.dataset.warping;
    root.style.removeProperty('--warp-scale');
    root.style.removeProperty('--warp-fade');
  }, [pathname]);

  return (
    <div ref={hintRef} className="warp-hint" data-on="false" aria-hidden="true">
      <span ref={labelRef} />
      <i ref={barRef} />
    </div>
  );
}
