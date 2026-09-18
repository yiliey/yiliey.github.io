'use client';

import { useEffect, useId, useRef } from 'react';
import {
  dotSprite,
  curlFlow,
  hashRandom,
  noiseTone,
  onFrame,
  pointer,
  seedField,
  smoothstep,
  TONE_COUNT,
  trackPointer,
  type FieldSeed,
} from '@/lib/particleField';
import { useCalmMode, useResolvedTheme } from '@/lib/useResolvedTheme';

interface NoiseRevealProps {
  children: React.ReactNode;
  className?: string;
  /** Dots per 1000px². The background sky runs about 0.4; staying near that
   *  is what keeps the two layers reading as one material. */
  density?: number;
  /** How far away the cursor starts clearing the patch, in px. */
  radius?: number;
  /** Dot radius in px. */
  dotSize?: number;
  /** Which modality tints this patch. Defaults to a stable per-instance pick. */
  tone?: number;
  /** Force the signal through — used where the page already says "active". */
  revealed?: boolean;
}

/** Soft overhang, so the patch never reads as a rectangle pasted on the page. */
const PAD = 14;

/* The gust. `SWEEP` blows dots away from the cursor, `DOWNWIND` carries them
 * along its travel, `SPRING` draws them home and `DRAG` is the air they move
 * through. Tuned so a passing cursor scatters the patch and it drifts back
 * together over roughly a second. */
const GUST_REACH = 130;
const SWIRL = 0.34;
const SWEEP = 0.30;
const DOWNWIND = 0.075;
const SPRING = 0.009;
const DRAG = 0.92;
const SCATTER_FADE = 46;
/** The same ambient flow the background rides, so a patch is never still. */
const FLOW = 96;

export default function NoiseReveal({
  children,
  className = '',
  density = 4,
  radius = 115,
  dotSize = 1.05,
  tone,
  revealed = false,
}: NoiseRevealProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useResolvedTheme();
  const calm = useCalmMode();
  const id = useId();

  // Read by the animation loop without restarting it.
  const revealedRef = useRef(revealed);
  revealedRef.current = revealed;

  // A stable per-instance tone, so a row of logos is tinted across the palette
  // rather than all the same colour.
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed += id.charCodeAt(i) * (i + 1);
  const toneIndex = tone ?? Math.floor(hashRandom(seed) * TONE_COUNT);

  useEffect(() => {
    if (calm) return;
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dark = theme === 'dark';
    const color = noiseTone(toneIndex, dark);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sprite = dotSprite(color, dotSize, dpr);

    type Dot = {
      /** Where it rests, and where the spring pulls it back to. */
      baseX: number; baseY: number;
      x: number; y: number;
      vx: number; vy: number;
      radius: number; alpha: number;
      /** Lighter dots are carried further by the same gust. */
      mass: number;
      drift: number; phase: number;
    };

    let dots: Dot[] = [];
    let width = 0, height = 0;
    let rect = root.getBoundingClientRect();
    let measure = true;
    let clear = 0;      // 0 = fully covered, 1 = fully revealed
    let seeded = false; // one hand-off to the background per reveal cycle
    let published = -1; // last --reveal written to the DOM

    const build = () => {
      rect = root.getBoundingClientRect();
      width = Math.round(rect.width) + PAD * 2;
      height = Math.round(rect.height) + PAD * 2;
      if (width <= PAD * 2 || height <= PAD * 2) { dots = []; return; }

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(80, Math.max(7, Math.round((width * height) / 1000 * density)));
      dots = Array.from({ length: count }, (_, i) => {
        const x = hashRandom(i * 3 + 1) * width;
        const y = hashRandom(i * 3 + 2) * height;
        return {
          baseX: x, baseY: y, x, y,
          vx: 0, vy: 0,
          // Sized like the stars behind them, not like grain.
          radius: 0.5 + hashRandom(i * 3 + 3) * 1.4,
          alpha: 0.34 + hashRandom(i * 5 + 7) * 0.42,
          mass: 0.6 + hashRandom(i * 7 + 11) * 0.8,
          drift: 0.5 + hashRandom(i * 17 + 19) * 1.2,
          phase: hashRandom(i * 19 + 23) * Math.PI * 2,
        };
      });
    };

    const invalidate = () => { measure = true; };

    // A page can carry a dozen of these; none of them should cost a frame while
    // they are scrolled out of sight.
    let onScreen = true;

    const tick = (now: number, delta: number) => {
      if (measure) { measure = false; build(); }
      if (!onScreen || !dots.length) return;

      // Distance from the cursor to the element itself (0 while it is inside).
      let target = 0;
      if (revealedRef.current || root.matches(':focus-within')) {
        target = 1;
      } else if (pointer.active) {
        const dx = Math.max(rect.left - pointer.x, 0, pointer.x - rect.right);
        const dy = Math.max(rect.top - pointer.y, 0, pointer.y - rect.bottom);
        target = smoothstep(radius, radius * 0.18, Math.hypot(dx, dy));
      }

      // Scatters quickly, settles back slowly: the noise feels like it is
      // drifting home rather than snapping back.
      const ease = target > clear ? 0.16 : 0.055;
      clear += (target - clear) * Math.min(1, ease * delta);

      if (Math.abs(clear - published) > 0.004) {
        published = clear;
        root.style.setProperty('--reveal', clear.toFixed(3));
      }

      // The cursor in canvas space. When the reveal is driven by focus or by
      // `revealed` rather than by a cursor, the gust blows outward from the
      // middle of the patch instead.
      const hasCursor = pointer.active;
      const originX = hasCursor ? pointer.x - rect.left + PAD : width / 2;
      const originY = hasCursor ? pointer.y - rect.top + PAD : height / 2;

      ctx.clearRect(0, 0, width, height);

      const handoff: FieldSeed[] = [];
      const wantsHandoff = !seeded && clear > 0.5;
      const drag = Math.pow(DRAG, delta);
      const flow = { x: 0, y: 0 };

      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];

        let dx = dot.x - originX;
        let dy = dot.y - originY;
        const distance = Math.hypot(dx, dy) || 1;
        dx /= distance; dy /= distance;

        // A gust, not a repulsor: part of the force pushes away from the
        // cursor, part of it carries the dot along the direction the cursor is
        // actually travelling. Light dots are taken further than heavy ones.
        const gust = smoothstep(GUST_REACH, 0, distance) * (clear * 0.65 + 0.35) / dot.mass;
        if (gust > 0.001) {
          // Swirl around the cursor as well as away from it, so the patch
          // unwinds rather than being blown into a ring.
          dot.vx += (-dy * SWIRL + dx * SWEEP + pointer.vx * DOWNWIND) * gust * delta;
          dot.vy += (dx * SWIRL + dy * SWEEP + pointer.vy * DOWNWIND) * gust * delta;
        }

        // Carried by the ambient flow even at rest: a covered logo should look
        // suspended in the field, not printed on top of it.
        curlFlow(rect.left + dot.x, rect.top + dot.y, now / 1000, FLOW, flow);
        dot.x += flow.x * dot.mass * delta;
        dot.y += flow.y * dot.mass * delta;

        // Always pulled home, always losing speed: it settles rather than stops.
        dot.vx = (dot.vx + (dot.baseX - dot.x) * SPRING * delta) * drag;
        dot.vy = (dot.vy + (dot.baseY - dot.y) * SPRING * delta) * drag;
        dot.x += dot.vx * delta;
        dot.y += dot.vy * delta;

        const x = dot.x;
        const y = dot.y;

        // The further it has been carried from home, the thinner it gets.
        const blown = Math.min(1, Math.hypot(dot.x - dot.baseX, dot.y - dot.baseY) / SCATTER_FADE);
        // Fade toward the edges of the patch so it has no hard border.
        const feather =
          smoothstep(0, PAD * 1.7, Math.min(x, width - x)) *
          smoothstep(0, PAD * 1.7, Math.min(y, height - y));
        const alpha = dot.alpha * (1 - blown) * (1 - clear * 0.55) * feather;
        if (alpha <= 0.01) continue;

        if (wantsHandoff && handoff.length < 10 && i % 5 === 0) {
          handoff.push({
            x: rect.left - PAD + x,
            y: rect.top - PAD + y,
            vx: dot.vx * 0.5, vy: dot.vy * 0.5,
            radius: dot.radius * dotSize,
            color,
            alpha: alpha * 0.9,
          });
        }

        const size = sprite.width / dpr * dot.radius;
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;

      // The dots the cursor pushed off the logo are released into the page
      // background instead of simply disappearing.
      if (wantsHandoff) { seeded = true; seedField(handoff); }
      if (clear < 0.18) seeded = false;
    };

    build();
    const untrack = trackPointer();
    const observer = new ResizeObserver(invalidate);
    observer.observe(root);
    const visibility = new IntersectionObserver(
      ([entry]) => { onScreen = entry.isIntersecting; },
      { rootMargin: '160px' },
    );
    visibility.observe(root);
    window.addEventListener('scroll', invalidate, { passive: true, capture: true });
    window.addEventListener('resize', invalidate);
    const stop = onFrame(tick);

    return () => {
      stop();
      untrack();
      observer.disconnect();
      visibility.disconnect();
      window.removeEventListener('scroll', invalidate, true);
      window.removeEventListener('resize', invalidate);
      root.style.removeProperty('--reveal');
    };
  }, [theme, calm, density, radius, dotSize, toneIndex]);

  // The wrapper renders identically whether or not the noise is running: only
  // the canvas and the `data-noise-active` flag come and go. Swapping the shape
  // of this tree would remount `children`, and anything holding a reference to
  // a wrapped node — the projects page measures its modality icons to draw the
  // flow curves — would be left pointing at a detached element.
  return (
    <span
      ref={rootRef}
      data-noise-reveal=""
      data-noise-active={calm ? undefined : ''}
      data-tone={toneIndex}
      className={`relative inline-flex ${className}`}
      style={{ '--reveal': 0 } as React.CSSProperties}
    >
      <span data-noise-content="">{children}</span>
      {!calm && (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{ left: -PAD, top: -PAD }}
        />
      )}
    </span>
  );
}
