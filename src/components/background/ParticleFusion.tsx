'use client';

import { useEffect, useRef } from 'react';
import {
  BOKEH_LEVELS,
  bokehSprite,
  hashRandom,
  meteorSprite,
  onFieldSeed,
  onFrame,
  pointer,
  rgba,
  curlFlow,
  smoothstep,
  starTone,
  TONE_COUNT,
  trackPointer,
  warp,
  type FieldSeed,
  type Rgb,
} from '@/lib/particleField';
import { useResolvedTheme } from '@/lib/useResolvedTheme';

/** How far the cursor's attention reaches into the field. */
const REACH = 240;
/** Stars inside that reach link up; the constellation exists only under the cursor. */
const LINK = 118;

/* The cursor displaces the cloud; it never accumulates into it.
 *
 * Integrating a force into velocity is what hollows the nebula out. An outward
 * push obviously does. So does a pure swirl, less obviously: circular motion
 * needs a centripetal force to stay circular, there isn't one, so particles
 * spiral outward and leave an even wider void.
 *
 * So the cursor's effect is expressed as a bounded *offset* built from a
 * rotation about the cursor plus a translation along its travel. Both are
 * isometries, so the local density cannot change no matter how long the cursor
 * rests. Each particle eases toward its own offset, and that lag is what still
 * reads as wind. */
const SWIRL_ANGLE = 0.85;
const DOWNWIND = 0.55;
const OFFSET_EASE = 0.055;
/**
 * The wide, very faint pass that gave the field a hazy body.
 *
 * Off. Side by side it looked prettier in isolation and worse on the page: the
 * haze sits in the same tonal range as body text, so everything written over it
 * loses contrast. Points stay points; the colour depth comes from the nebula
 * layer in CSS, which sits far enough back not to fight the type.
 */
const CLOUD_HALO = 0;
/** A tight glow, on the nearest few only, so the field is not flat. */
const STAR_HALO = 0.34;
const STAR_HALO_FROM = 0.74;

/* The field steps back under the middle of the screen, where the content
   column lives, and runs at full strength out in the margins. This is what
   lets a dense background and readable body text coexist.

   It is done here rather than with a CSS mask on the canvas: lightningcss
   drops `mask-image` gradients during the build, taking the whole rule with
   them, so the mask silently did nothing in production. */
const CLEARING_DIM = 0.34;

/** Amplitude of the ambient drift, in pixels of displacement. */
const DRIFT = 13000;

type Star = {
  x: number; y: number;
  /** Bounded displacement from the cursor, eased. Never integrated. */
  ox: number; oy: number;
  /** How readily this particle is carried by the ambient flow. */
  flow: number;
  /** 0 = far away and faint, 1 = near and bright. Drives size, speed and parallax. */
  depth: number;
  radius: number; alpha: number;
  tone: number;
  twinkle: number; twinkleRate: number;
};

type Drifting = FieldSeed & { life: number };

/**
 * The page background: a deep particle field, and the same material the noise
 * over each logo is made of.
 *
 * Depth is the organising idea. Every star carries a `depth` from 0 to 1, and
 * that one number drives its size, brightness, drift speed, how far it
 * parallaxes with the cursor, and how strongly the cursor can push it. Far
 * stars are a dense, almost static haze; near ones are few, bright and
 * responsive. Nothing here is a flat plane of dots.
 */
export default function ParticleFusion() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useResolvedTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dark = theme === 'dark';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const tones: Rgb[] = Array.from({ length: TONE_COUNT }, (_, i) => starTone(i, dark));
    // One sprite per tone per depth rung: near rungs are wide and hazy with a
    // near-white core, far rungs are small and crisp.
    const ladder = tones.map(c =>
      Array.from({ length: BOKEH_LEVELS }, (_, l) =>
        bokehSprite(c, l / (BOKEH_LEVELS - 1), 1, dpr, dark)));
    const meteors = tones.map(c => meteorSprite(c, dpr));
    const lineInk: Rgb = dark ? [148, 163, 184] : [90, 106, 132];

    // The light theme needs more signal than the dark one, not less: dark dots
    // on white are perceptually far weaker than light dots on near-black, so
    // matching the numbers would leave the light page looking empty.
    const exposure = dark ? 0.92 : 0.86;

    let width = 0, height = 0;
    let stars: Star[] = [];
    let drifting: Drifting[] = [];

    // Smoothed cursor, so parallax glides instead of snapping.
    let px = 0, py = 0, tracking = false;

    const build = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Roughly one star per 800px² — the same order of density as the noise
      // that gathers over a logo, so the two are plainly the same material.
      const target = Math.min(2400, Math.max(320, Math.round((width * height) / 800)));

      // Stratified, not random. Independent uniform positions are Poisson, and
      // Poisson visibly clumps: it leaves crowded corners and bare patches,
      // which is what this looked like. One particle per jittered grid cell
      // covers evenly while still reading as scattered.
      const cols = Math.max(1, Math.round(Math.sqrt(target * width / height)));
      const rows = Math.max(1, Math.round(target / cols));
      const cellW = width / cols, cellH = height / rows;
      const count = cols * rows;

      stars = Array.from({ length: count }, (_, i) => {
        // Golden-ratio sequence rather than another random draw: it spreads the
        // few large, bright particles evenly over the grid instead of letting
        // several land in one cell and blow it out.
        const depth = Math.pow((i * 0.6180339887498949) % 1, 3);

        const x = ((i % cols) + hashRandom(i * 5 + 2)) * cellW;
        const y = (Math.floor(i / cols) + hashRandom(i * 5 + 3)) * cellH;

        return {
          x, y, depth,
          radius: 0.2 + Math.pow(hashRandom(i * 71 + 47), 2.2) * 0.7 + depth * 3.6,
          // Brighter across the board, and the nearest stars carry real
          // luminance rather than being slightly-less-grey dots.
          alpha: (0.14 + depth * 0.88) * exposure,
          tone: Math.floor(hashRandom(i * 7 + 4) * TONE_COUNT),
          ox: 0, oy: 0,
          flow: 0.55 + hashRandom(i * 11 + 5) * 0.9,
          twinkle: hashRandom(i * 17 + 7) * Math.PI * 2,
          twinkleRate: 0.4 + hashRandom(i * 19 + 8) * 1.3,
        };
      });
    };

    // Rendered positions, reused by the constellation pass.
    const flow = { x: 0, y: 0 };
    let rx = new Float32Array(0);
    let ry = new Float32Array(0);
    let ra = new Float32Array(0);
    let near: number[] = [];

    const tick = (now: number, delta: number) => {
      ctx.clearRect(0, 0, width, height);

      if (pointer.active) {
        if (!tracking) { px = pointer.x; py = pointer.y; tracking = true; }
        px += (pointer.x - px) * Math.min(1, 0.1 * delta);
        py += (pointer.y - py) * Math.min(1, 0.1 * delta);
      } else {
        tracking = false;
      }

      // Parallax is measured from the middle of the screen, so the field leans
      // toward the cursor as a whole and the depth separation becomes visible.
      const leanX = tracking ? (px - width / 2) / width : 0;
      const leanY = tracking ? (py - height / 2) / height : 0;

      if (rx.length !== stars.length) {
        rx = new Float32Array(stars.length);
        ry = new Float32Array(stars.length);
        ra = new Float32Array(stars.length);
      }
      near.length = 0;

      const seconds = now / 1000;
      // The canvas is fixed, so shifting particles against the scroll is what
      // creates parallax: near layers slide, the far haze barely does.
      const scrolled = window.scrollY;
      const wrap = height + 80;

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        // Ambient drift, as a *displacement of the fixed base position* rather
        // than a velocity that is integrated frame by frame.
        //
        // The curl field has zero divergence on paper, so it should never
        // change local density. Stepping it forward each frame does though:
        // Euler integration accumulates error, and the faster the flow the
        // faster particles creep along it and pile into bright knots. Sampling
        // the field at the base position instead means each particle only
        // wobbles around its own stratified cell, so the field cannot clump —
        // however long the page is left open.
        let driftX = 0, driftY = 0;
        if (!reduced) {
          curlFlow(star.x, star.y, seconds, DRIFT * (0.45 + star.depth), flow);
          driftX = flow.x * star.flow;
          driftY = flow.y * star.flow;
        }

        // Near stars shift far more than distant ones: that difference is depth.
        const shift = star.depth * 62;
        let x = star.x + driftX - leanX * shift;
        let y = star.y + driftY - leanY * shift - scrolled * (0.02 + star.depth * 0.55);
        // Wrap, so parallax never runs the field off the top of the screen.
        y = ((y + 40) % wrap + wrap) % wrap - 40;

        // A slow, per-star shimmer keeps the sky from looking printed on.
        const shimmer = reduced ? 1 : 0.78 + Math.sin(seconds * star.twinkleRate + star.twinkle) * 0.22;

        // Distance from the centre of the screen, normalised so 1 is roughly
        // the edge of the content column.
        const ex = (x / width - 0.5) / 0.58;
        const ey = (y / height - 0.44) / 0.62;
        const clearing = CLEARING_DIM + (1 - CLEARING_DIM) * smoothstep(0.34, 1.08, Math.hypot(ex, ey));

        let alpha = star.alpha * shimmer * clearing;

        let wantX = 0, wantY = 0;
        if (tracking && !reduced) {
          const dx = x - px;
          const dy = y - py;
          const distance = Math.hypot(dx, dy);
          if (distance < REACH) {
            const influence = smoothstep(REACH, 0, distance);
            // Nearer particles are carried further; the far haze barely stirs.
            const carry = influence * (0.18 + star.depth * 0.9);

            // Where a rotation about the cursor would put this particle.
            const a = SWIRL_ANGLE * carry;
            const sinA = Math.sin(a), cosA = Math.cos(a);
            wantX = (dx * cosA - dy * sinA) - dx + pointer.vx * DOWNWIND * carry;
            wantY = (dx * sinA + dy * cosA) - dy + pointer.vy * DOWNWIND * carry;

            // Presence without displacement: gas the cursor touches lights up.
            alpha += influence * (0.34 + star.depth * 0.62) * exposure;
            if (star.depth > 0.5 && near.length < 70) near.push(i);
          }
        }

        // The lag between where the particle is and where the cursor wants it
        // is the whole feel of the thing: it trails in, and drifts back out.
        const ease = Math.min(1, OFFSET_EASE * delta);
        star.ox += (wantX - star.ox) * ease;
        star.oy += (wantY - star.oy) * ease;
        x += star.ox;
        y += star.oy;

        rx[i] = x; ry[i] = y; ra[i] = alpha;

        const sprite = ladder[star.tone][Math.min(BOKEH_LEVELS - 1, (star.depth * BOKEH_LEVELS) | 0)];
        const unit = sprite.width / dpr;

        // Flight: everything rushes outward from the centre of the screen and
        // smears into a streak, near layers hardest — the same depth value
        // driving the parallax now drives the speed.
        if (warp.level > 0.015) {
          const w = warp.level;
          let ax = x - width / 2, ay = y - height / 2;
          const reach = Math.hypot(ax, ay) || 1;
          ax /= reach; ay /= reach;
          const push = w * w * (70 + star.depth * 300) * (0.35 + reach / width);
          x += ax * push;
          y += ay * push;

          // A stretched, rotated meteor sprite: bright head where the particle
          // is, translucent tail trailing back toward the centre.
          const streak = w * (34 + star.depth * 210);
          const thick = Math.max(2.2, star.radius * 3.4);
          const meteor = meteors[star.tone];
          ctx.globalAlpha = Math.min(1, alpha * (0.45 + w * 0.75));
          ctx.setTransform(dpr * ax, dpr * ay, -dpr * ay, dpr * ax, dpr * x, dpr * y);
          ctx.drawImage(meteor, -streak, -thick / 2, streak, thick);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.globalAlpha = 1;
          if (w > 0.45) continue; // past this the meteor replaces the dot
        }

        // Two halo passes. The wide one is what turns a field of dots into
        // cloud: individually invisible, but a thousand of them overlapping
        // give the nebula its body. The tight one is the star's own glow.
        // Set either to 0 for bare points.
        if (CLOUD_HALO > 0) {
          const wide = unit * (6.5 + star.radius * 1.8);
          ctx.globalAlpha = Math.min(1, alpha) * CLOUD_HALO;
          ctx.drawImage(sprite, x - wide / 2, y - wide / 2, wide, wide);
        }

        if (STAR_HALO > 0 && star.depth > STAR_HALO_FROM) {
          const halo = unit * star.radius * 3.2;
          ctx.globalAlpha = Math.min(1, alpha) * STAR_HALO * star.depth;
          ctx.drawImage(sprite, x - halo / 2, y - halo / 2, halo, halo);
        }

        const size = unit * star.radius;
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;

      // The constellation exists only where the cursor is looking. Restricting
      // it to the stars already collected above keeps this pass tiny even
      // though the field itself is dense.
      if (near.length > 1) {
        ctx.lineWidth = 0.65;
        for (let a = 0; a < near.length; a++) {
          for (let b = a + 1; b < near.length; b++) {
            const i = near[a], j = near[b];
            const dx = rx[i] - rx[j];
            const dy = ry[i] - ry[j];
            const distance = Math.hypot(dx, dy);
            if (distance >= LINK) continue;
            const strength = (1 - distance / LINK) * (dark ? 0.22 : 0.16) * exposure;
            ctx.strokeStyle = rgba(lineInk, strength);
            ctx.beginPath();
            ctx.moveTo(rx[i], ry[i]);
            ctx.lineTo(rx[j], ry[j]);
            ctx.stroke();
          }
        }
      }

      // Particles handed over by a logo the cursor just cleared.
      if (drifting.length) {
        for (let i = drifting.length - 1; i >= 0; i--) {
          const seed = drifting[i];
          seed.x += seed.vx * delta;
          seed.y += seed.vy * delta;
          seed.vx *= 0.985;
          seed.vy *= 0.985;
          seed.vy -= 0.006 * delta; // a slow lift, so they read as released
          seed.life -= 0.006 * delta;
          if (seed.life <= 0) { drifting.splice(i, 1); continue; }

          const size = 4 * seed.radius;
          ctx.globalAlpha = seed.alpha * seed.life;
          const gradient = ctx.createRadialGradient(seed.x, seed.y, 0, seed.x, seed.y, size / 2);
          gradient.addColorStop(0, rgba(seed.color, 1));
          gradient.addColorStop(1, rgba(seed.color, 0));
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(seed.x, seed.y, size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    };

    build();
    const untrack = trackPointer();
    const stopSeeds = onFieldSeed(seeds => {
      if (reduced) return;
      for (const seed of seeds) drifting.push({ ...seed, life: 1 });
      // Keep the handover bounded however fast the cursor sweeps the page.
      if (drifting.length > 160) drifting = drifting.slice(-160);
    });
    window.addEventListener('resize', build);
    const stop = onFrame(tick);

    return () => {
      stop();
      untrack();
      stopSeeds();
      window.removeEventListener('resize', build);
    };
  }, [theme]);

  return (
    <>
      {/* Colour haze behind the stars. Pure CSS: it drifts far too slowly to be
          worth a canvas pass, and it gives the field depth that dots alone
          cannot. */}
      <div aria-hidden="true" className="field-nebula" />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="fixed inset-0 -z-10 pointer-events-none"
      />
      {/* Above the stars, below everything else: the field falls off toward the
          edges of the screen instead of ending at them. */}
      <div aria-hidden="true" className="field-vignette" />
    </>
  );
}
