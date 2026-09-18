'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { hashRandom, onFrame } from '@/lib/particleField';

/**
 * The portrait arrives the way a diffusion model produces one: out of noise, at
 * a resolution that climbs step by step until the image resolves.
 *
 * The overlay is the real image repeatedly re-encoded — drawn down to a tiny
 * latent, perturbed, and drawn back up with smoothing off — rather than random
 * static faded over a photo. That is why it reads as *this* picture being
 * denoised rather than as a curtain being pulled off it.
 */
const STEPS = 14;
const DURATION = 2100;

export default function DenoisePortrait({
  src,
  alt,
  size = 256,
}: {
  src: string;
  alt: string;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setDone(true); return; }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);

    const latent = document.createElement('canvas');
    const lctx = latent.getContext('2d');
    const image = new window.Image();
    image.crossOrigin = 'anonymous';

    let stop = () => {};
    image.onload = () => {
      let start = 0;
      stop = onFrame(now => {
        if (!start) start = now;
        const t = Math.min(1, (now - start) / DURATION);
        // Discrete steps, so the resolution visibly ratchets up the way a
        // sampler's schedule does, instead of sliding smoothly.
        const step = Math.min(STEPS - 1, Math.floor(t * STEPS));
        const eased = Math.pow((step + 1) / STEPS, 2.1);
        const w = Math.max(3, Math.round(canvas.width * eased));
        const h = Math.max(3, Math.round(canvas.height * eased));

        latent.width = w;
        latent.height = h;
        if (!lctx) return;
        lctx.clearRect(0, 0, w, h);
        lctx.drawImage(image, 0, 0, w, h);

        // Perturb the latent itself, so the noise is coloured by the image.
        const noise = 1 - eased;
        if (noise > 0.01) {
          const frame = lctx.getImageData(0, 0, w, h);
          const px = frame.data;
          for (let i = 0; i < px.length; i += 4) {
            const jitter = (hashRandom(i + step * 7919) - 0.5) * 300 * noise;
            px[i] += jitter;
            px[i + 1] += jitter * 0.9;
            px[i + 2] += jitter * 1.15;
          }
          lctx.putImageData(frame, 0, 0);
        }

        ctx.imageSmoothingEnabled = eased > 0.45;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
        ctx.drawImage(latent, 0, 0, canvas.width, canvas.height);

        if (t >= 1) { stop(); setDone(true); }
      });
    };
    image.src = src;

    return () => stop();
  }, [src, size]);

  return (
    <div className="relative w-full h-full">
      <Image
        src={src}
        alt={alt}
        width={size}
        height={size}
        className="w-full h-full object-cover object-[32%_center]"
        priority
      />
      {!done && (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full"
        />
      )}
    </div>
  );
}
