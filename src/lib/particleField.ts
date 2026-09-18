'use client';

/**
 * One particle field, shared by every layer of the site.
 *
 * The background wash, the noise that covers each logo, and the curves on the
 * projects page are deliberately not three effects: they are three states of
 * the same field. They share this palette, this pointer, this frame clock, and
 * they hand particles to each other through `seedField`, so noise that a cursor
 * clears off a logo drifts away into the page background instead of just
 * vanishing.
 */

export type Rgb = readonly [number, number, number];

/** Modality tones, in the order the projects page lists them:
 *  video, audio, image, text, documents. */
const TONES: Record<'light' | 'dark', Rgb[]> = {
  light: [[74, 131, 232], [149, 105, 239], [82, 170, 128], [203, 148, 55], [128, 147, 186]],
  dark: [[111, 157, 240], [156, 140, 240], [104, 192, 150], [220, 170, 85], [154, 172, 208]],
};

/** The colour a signal resolves to once the noise is gone. */
const INK: Record<'light' | 'dark', Rgb> = {
  light: [15, 23, 42],
  dark: [226, 232, 240],
};

export const TONE_COUNT = TONES.light.length;

export function tone(index: number, dark: boolean): Rgb {
  return TONES[dark ? 'dark' : 'light'][((index % TONE_COUNT) + TONE_COUNT) % TONE_COUNT];
}

export function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * amount),
    Math.round(a[1] + (b[1] - a[1]) * amount),
    Math.round(a[2] + (b[2] - a[2]) * amount),
  ];
}

/** Noise reads as noise, not confetti: mostly ink, tinted by one modality. */
export function noiseTone(index: number, dark: boolean): Rgb {
  return mix(INK[dark ? 'dark' : 'light'], tone(index, dark), 0.34);
}

/**
 * Starlight: mostly luminous, faintly tinted.
 *
 * At five hundred particles a fully saturated palette reads as confetti. A real
 * field is close to white with colour only at the edge of perception, so each
 * star keeps its modality hue but is pulled most of the way to light (on dark)
 * or to slate (on white, where white would be invisible).
 */
const STARLIGHT: Rgb = [237, 244, 255];
const STARSLATE: Rgb = [92, 108, 134];

export function starTone(index: number, dark: boolean): Rgb {
  return dark
    ? mix(tone(index, true), STARLIGHT, 0.62)
    : mix(tone(index, false), STARSLATE, 0.5);
}

export const rgba = (c: Rgb, alpha: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;

/* -------------------------------------------------------------------------
 * Shared frame clock
 *
 * Every layer subscribes to one rAF loop rather than starting its own. A page
 * can hold a dozen noise patches; a dozen independent loops would drift out of
 * step with each other and with the background, which is exactly the seam we
 * are trying to remove.
 * ---------------------------------------------------------------------- */

type Ticker = (now: number, delta: number) => void;
const tickers = new Set<Ticker>();
let frame = 0;
let last = 0;

function loop(now: number) {
  frame = requestAnimationFrame(loop);
  // Clamp so a backgrounded tab does not resume with one enormous step.
  const delta = last ? Math.min((now - last) / 16.667, 3) : 1;
  last = now;
  decayPointerVelocity(delta);
  for (const tick of tickers) tick(now, delta);
}

function startClock() {
  if (frame || typeof window === 'undefined') return;
  last = 0;
  frame = requestAnimationFrame(loop);
}

function stopClock() {
  if (!frame) return;
  cancelAnimationFrame(frame);
  frame = 0;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopClock();
    else if (tickers.size) startClock();
  });
}

export function onFrame(tick: Ticker): () => void {
  tickers.add(tick);
  startClock();
  return () => {
    tickers.delete(tick);
    if (!tickers.size) stopClock();
  };
}

/* -------------------------------------------------------------------------
 * Shared pointer, in viewport coordinates
 * ---------------------------------------------------------------------- */

/**
 * `vx`/`vy` are the cursor's own velocity in px per 60fps frame. They are what
 * makes the interaction read as a gust rather than a repulsor field: particles
 * are pushed the way the hand is moving, not merely away from a point.
 */
export const pointer = { x: -9999, y: -9999, vx: 0, vy: 0, active: false };

let pointerRefs = 0;
let lastMove = 0;

const onPointerMove = (event: PointerEvent) => {
  if (event.pointerType === 'touch') return;
  const now = performance.now();

  if (pointer.active) {
    // Clamped: a long gap between events, or a jump from a re-entering cursor,
    // must not translate into an implausible gust.
    const step = Math.min(64, Math.max(8, now - lastMove));
    const vx = ((event.clientX - pointer.x) / step) * 16.667;
    const vy = ((event.clientY - pointer.y) / step) * 16.667;
    pointer.vx += (Math.max(-45, Math.min(45, vx)) - pointer.vx) * 0.35;
    pointer.vy += (Math.max(-45, Math.min(45, vy)) - pointer.vy) * 0.35;
  }

  lastMove = now;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.active = true;
};

const onPointerGone = () => {
  pointer.active = false;
  pointer.x = -9999;
  pointer.y = -9999;
  pointer.vx = 0;
  pointer.vy = 0;
};

/** The gust decays on its own, so a cursor that stops moving stops blowing.
 *  Driven once per frame by the shared clock above. */
function decayPointerVelocity(delta: number) {
  const damp = Math.pow(0.88, delta);
  pointer.vx *= damp;
  pointer.vy *= damp;
}

export function trackPointer(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (++pointerRefs === 1) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerGone);
    window.addEventListener('blur', onPointerGone);
  }
  return () => {
    if (--pointerRefs === 0) {
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('pointerleave', onPointerGone);
      window.removeEventListener('blur', onPointerGone);
    }
  };
}

/* -------------------------------------------------------------------------
 * Warp
 *
 * How hard the field is currently travelling. 0 is at rest; 1 is full flight,
 * with every particle stretched into a streak radiating from the middle of the
 * screen. The scroll handler drives it up as you push past the end of a page,
 * so the motion is a direct read-out of the gesture rather than a canned
 * animation that plays afterwards.
 * ---------------------------------------------------------------------- */

export const warp = { level: 0 };

/* -------------------------------------------------------------------------
 * Particle hand-off
 *
 * A noise patch that has just been cleared pushes its particles here; the
 * background field picks them up and lets them drift off. This is the join
 * that makes the two layers read as one system.
 * ---------------------------------------------------------------------- */

export type FieldSeed = {
  x: number; y: number; // viewport coordinates
  vx: number; vy: number;
  radius: number;
  color: Rgb;
  alpha: number;
};

const sinks = new Set<(seeds: FieldSeed[]) => void>();

export function onFieldSeed(sink: (seeds: FieldSeed[]) => void): () => void {
  sinks.add(sink);
  return () => { sinks.delete(sink); };
}

export function seedField(seeds: FieldSeed[]) {
  if (!seeds.length) return;
  for (const sink of sinks) sink(seeds);
}

/* -------------------------------------------------------------------------
 * Small helpers
 * ---------------------------------------------------------------------- */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Smooth ramp; keeps every transition in the field on the same curve. */
export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

/**
 * Deterministic per-index noise, so particles survive re-renders and SSR.
 *
 * This was `fract(sin(seed * 127.1) * 43758.5)`, the usual shader one-liner.
 * It is fine for a handful of values but it correlates badly across sequential
 * integer seeds, which is exactly how it is used here — the result was visible
 * clumping and bare patches in a field that was supposed to be even. This is an
 * integer avalanche hash (xorshift-multiply), which decorrelates properly.
 */
export function hashRandom(seed: number) {
  let h = Math.imul(seed | 0, 0x9e3779b1) ^ 0x85ebca6b;
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * A slow, divergence-free flow field.
 *
 * Velocity is the curl of a scalar potential built from a couple of sines, so
 * it has no sources and no sinks: particles are carried around forever without
 * ever piling up or leaving a hole behind. That property is the whole point —
 * a field that simply pushes outward from the cursor evacuates a bubble, which
 * is exactly what a nebula must never do.
 *
 * Writes into `out` to keep this allocation-free at a couple of thousand
 * particles per frame.
 */
const F1 = 0.0017, F2 = 0.0023, F3 = 0.0041, F4 = 0.0034;

export function curlFlow(x: number, y: number, t: number, scale: number, out: { x: number; y: number }) {
  const a1 = x * F1 + t * 0.11;
  const b1 = y * F2 - t * 0.08;
  const a2 = x * F3 - t * 0.17;
  const b2 = y * F4 + t * 0.13;

  // psi = sin(a1)cos(b1) + 0.45 sin(a2)cos(b2);  v = (dpsi/dy, -dpsi/dx)
  const dpsiDy = -F2 * Math.sin(a1) * Math.sin(b1) - 0.45 * F4 * Math.sin(a2) * Math.sin(b2);
  const dpsiDx = F1 * Math.cos(a1) * Math.cos(b1) + 0.45 * F3 * Math.cos(a2) * Math.cos(b2);

  out.x = dpsiDy * scale;
  out.y = -dpsiDx * scale;
}

/**
 * A ladder of bokeh sprites, pre-rendered once per tone.
 *
 * The thing that separates real bokeh from a pile of blurred circles is that
 * size, blur, speed and core brightness all come off one depth value. Size and
 * speed were already keyed to depth here; blur and core were not, so every
 * particle had the same hard little edge no matter how near it was meant to be.
 *
 * `soft` runs 0 (far: small, crisp, tinted) to 1 (near: wide, hazy, with a core
 * that blows out toward white, the way an out-of-focus highlight does).
 */
const WHITE: Rgb = [255, 255, 255];
/** What an out-of-focus highlight blows out *to* on a white page. Blowing out
 *  toward white there would simply erase it, which is what used to happen. */
const DEEP: Rgb = [46, 62, 96];

export function bokehSprite(
  color: Rgb,
  soft: number,
  radius: number,
  dpr: number,
  dark = true,
): HTMLCanvasElement {
  const r = Math.max(1, radius) * dpr;
  const size = Math.ceil(r * 4);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const c = size / 2;
    const core = dark
      ? mix(color, WHITE, 0.2 + soft * 0.62)
      : mix(color, DEEP, 0.18 + soft * 0.5);
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, size / 2);
    gradient.addColorStop(0, rgba(core, 1));
    gradient.addColorStop(0.16 + soft * 0.26, rgba(core, 0.86 - soft * 0.26));
    gradient.addColorStop(0.46 + soft * 0.22, rgba(color, 0.36 - soft * 0.14));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return canvas;
}

/** How many rungs the ladder has. More is smoother; six is already plenty. */
export const BOKEH_LEVELS = 6;

/**
 * A meteor, pre-rendered once per tone: a bright head at the right edge fading
 * to nothing along the tail.
 *
 * Drawn as a stretched, rotated sprite rather than a stroked line. A line is
 * one flat colour end to end, which reads as a scratch on the glass; and
 * building a linear gradient per particle per frame — at sixteen hundred
 * particles — would cost more than the whole rest of the frame.
 */
export function meteorSprite(color: Rgb, dpr: number): HTMLCanvasElement {
  const w = Math.round(160 * dpr);
  const h = Math.round(14 * dpr);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Tail: a long, translucent taper running back from the head.
    const tail = ctx.createLinearGradient(0, 0, w, 0);
    tail.addColorStop(0, rgba(color, 0));
    tail.addColorStop(0.55, rgba(color, 0.12));
    tail.addColorStop(0.88, rgba(color, 0.4));
    tail.addColorStop(1, rgba(color, 0.75));
    ctx.fillStyle = tail;
    // Narrow at the tail, full height at the head.
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h * 0.12);
    ctx.lineTo(w, h * 0.88);
    ctx.closePath();
    ctx.fill();

    // Head: a soft bright core where the particle actually is.
    const head = ctx.createRadialGradient(w - h / 2, h / 2, 0, w - h / 2, h / 2, h / 2);
    head.addColorStop(0, rgba(mix(color, [255, 255, 255], 0.55), 1));
    head.addColorStop(0.5, rgba(color, 0.6));
    head.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = head;
    ctx.fillRect(w - h, 0, h, h);
  }
  return canvas;
}

/**
 * A dot, pre-rendered once per tone.
 *
 * Building a radial gradient per particle per frame is what made the original
 * noise expensive; at density 30 a single icon was allocating several hundred
 * gradients every frame. One sprite drawn with globalAlpha looks the same.
 */
export function dotSprite(color: Rgb, radius: number, dpr: number): HTMLCanvasElement {
  const r = Math.max(1, radius) * dpr;
  const size = Math.ceil(r * 4);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const c = size / 2;
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, size / 2);
    gradient.addColorStop(0, rgba(color, 1));
    gradient.addColorStop(0.45, rgba(color, 0.72));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return canvas;
}
