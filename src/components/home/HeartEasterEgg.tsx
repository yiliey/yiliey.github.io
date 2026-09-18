'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Github } from 'lucide-react';
import { onFrame } from '@/lib/particleField';
import styles from './heart-easter-egg.module.css';

const HEART_LINK = 'https://jayden-xu.github.io/';
const GOLD = '240, 198, 116';
const HALO = '190, 202, 246';

type Vertex = { x: number; y: number; z: number; seed: number; gold: boolean };

const FORM_MS = 1150;

/**
 * One flat heart, turning on its own vertical axis.
 *
 * The whole heart curve lies in a single plane at z = 0, so a quarter turn
 * foreshortens it to an edge — which is the point: it reads as a cut-out being
 * spun rather than a solid. A hair of thickness on each particle keeps that
 * edge from disappearing into nothing at the crossing.
 *
 * Returned as nested outlines, scaled about the shape's own middle rather than
 * the origin (which sits low inside the heart, and would pull the inner rings
 * up toward the cleft). Drawing them as closed curves is what keeps the
 * silhouette legible; loose points alone read as a smudge.
 */
const HEART_MID_Y = -3.8;

function heartAt(t: number, scale: number) {
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return {
        x: 16 * Math.sin(t) ** 3 * scale,
        y: HEART_MID_Y + (y - HEART_MID_Y) * scale,
    };
}

function buildHeart(rings: number, samples: number): Vertex[][] {
    return Array.from({ length: rings }, (_, k) => {
        const scale = 1 - k * (0.84 / rings);
        // Fewer points on the inner rings, so the middle does not clot.
        const count = Math.max(14, Math.round(samples * scale));
        return Array.from({ length: count }, (_, i) => {
            const { x, y } = heartAt((i / count) * Math.PI * 2, scale);
            return {
                x, y,
                z: (Math.random() - 0.5) * 1.5,
                seed: Math.random() * Math.PI * 2,
                gold: Math.random() < 0.4,
            };
        });
    });
}

/**
 * A glowing dot, rendered once per colour and then stamped.
 *
 * The obvious way to draw these is an arc with `shadowBlur`, but that asks the
 * canvas for a fresh blur pass on every one of the several hundred dots, every
 * frame. A pre-rendered radial-gradient sprite looks the same and costs a
 * single `drawImage`.
 */
const glowCache = new Map<string, HTMLCanvasElement>();
function glow(tone: string) {
    const cached = glowCache.get(tone);
    if (cached) return cached;
    const size = 48;
    const sprite = document.createElement('canvas');
    sprite.width = size;
    sprite.height = size;
    const context = sprite.getContext('2d')!;
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, `rgba(${tone}, 1)`);
    gradient.addColorStop(0.16, `rgba(${tone}, 0.92)`);
    gradient.addColorStop(0.42, `rgba(${tone}, 0.26)`);
    gradient.addColorStop(1, `rgba(${tone}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    glowCache.set(tone, sprite);
    return sprite;
}

/** A double helix: two strands winding around the same axis, each taking its
 *  turn in front. Neither one is the centre the other goes around. */
function drawHelix(context: CanvasRenderingContext2D, width: number, height: number, elapsed: number, still: boolean) {
    const pad = 10;
    const span = width - pad * 2;
    const middle = height / 2;
    const amplitude = height * 0.3;
    const turns = 2.4;
    const steps = 110;
    const drift = still ? 0 : elapsed * 0.0019;

    context.clearRect(0, 0, width, height);

    for (let i = 0; i <= steps; i += 7) {
        const u = i / steps;
        const angle = u * Math.PI * 2 * turns - drift;
        const depth = (Math.cos(angle) + 1) / 2;
        const x = pad + u * span;
        context.globalAlpha = 0.08 + depth * 0.16;
        context.strokeStyle = `rgb(${HALO})`;
        context.lineWidth = 0.75;
        context.beginPath();
        context.moveTo(x, middle + Math.sin(angle) * amplitude);
        context.lineTo(x, middle - Math.sin(angle) * amplitude);
        context.stroke();
    }

    for (let strand = 0; strand < 2; strand += 1) {
        for (let i = 0; i <= steps; i += 1) {
            const u = i / steps;
            const angle = u * Math.PI * 2 * turns - drift + strand * Math.PI;
            const depth = (Math.cos(angle) + 1) / 2;
            context.globalAlpha = 0.22 + depth * 0.78;
            const spread = (0.8 + depth * 1.5) * 6;
            context.drawImage(
                glow(strand === 0 ? GOLD : HALO),
                pad + u * span - spread / 2,
                middle + Math.sin(angle) * amplitude - spread / 2,
                spread, spread,
            );
        }
    }
    context.globalAlpha = 1;
}

function useCanvas(
    draw: (context: CanvasRenderingContext2D, width: number, height: number, elapsed: number, still: boolean) => void,
    width: number,
    height: number,
    /** Held still while false — nothing here is worth a frame when it cannot be seen. */
    running = true,
) {
    const ref = useRef<HTMLCanvasElement>(null);
    const drawRef = useRef(draw);
    drawRef.current = draw;
    // Kept across pauses, so resuming picks the rotation up where it stopped
    // instead of snapping back to the start.
    const startRef = useRef(0);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas || !running) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        context.scale(dpr, dpr);

        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!startRef.current) startRef.current = performance.now();
        const start = startRef.current;
        // The site's shared frame clock rather than a private rAF loop: it is
        // already wired to stop the whole field when the tab goes to the
        // background, and a loop of our own would keep drawing there.
        return onFrame(now => drawRef.current(context, width, height, now - start, still));
    }, [width, height, running]);

    return ref;
}

function HelixMark() {
    const ref = useCanvas(drawHelix, 232, 76);
    return <canvas ref={ref} className={styles.helix} aria-hidden="true" />;
}

export default function HeartEasterEgg() {
    const [open, setOpen] = useState(false);
    const forming = useRef(0);
    const timer = useRef(0);
    const heart = useRef<Vertex[][]>([]);
    if (heart.current.length === 0) heart.current = buildHeart(5, 64);

    const size = 100;
    const canvasRef = useCanvas((context, width, height, elapsed, still) => {
        const shape = heart.current;
        // Winding up before the note opens: the spin quickens and the heart
        // swells, so the click has a run-up instead of a cut. Measured against
        // the wall clock, because `forming` is stamped with one — subtracting it
        // from `elapsed` (which is relative to the canvas starting) gave a large
        // negative charge, and a negative scale with it.
        const charge = forming.current
            ? Math.max(0, Math.min(1, (performance.now() - forming.current) / FORM_MS))
            : 0;

        const spin = still ? 0.7 : elapsed * 0.00068 + charge * charge * 8;
        const beatPhase = (elapsed % 1500) / 1500;
        const beat = still ? 0 : Math.exp(-beatPhase * 17) * 0.8 + Math.exp(-Math.max(0, beatPhase - 0.19) * 17) * 0.45;
        const scale = (width / 44) * (1 + beat * 0.04 + charge * 0.12);
        const centerX = width / 2;
        // The profile runs from y = -17 at the point to about y = +9.4 at the
        // lobes, so its middle sits below the origin; shift by that, not by half
        // the canvas, or the heart hangs high in the box.
        const centerY = height / 2 + HEART_MID_Y * scale;
        // Shallow focal and a slight downward tilt: dead-on and with a long
        // lens, a flat shape turning on a vertical axis only changes width, and
        // the near and far halves of it look identical.
        const focal = 300;
        const tilt = 0.14;
        const sin = Math.sin(spin);
        const cos = Math.cos(spin);
        const tiltSin = Math.sin(tilt);
        const tiltCos = Math.cos(tilt);

        context.clearRect(0, 0, width, height);
        context.lineCap = 'round';

        const outlines = shape.map(strand => {
            let sum = 0;
            const points = strand.map(vertex => {
                // Turn about the vertical axis: only x and z move, which is what
                // makes a flat shape foreshorten instead of tumbling.
                const spun = vertex.x * sin + vertex.z * cos;
                const y = vertex.y * tiltCos - spun * tiltSin;
                const z = vertex.y * tiltSin + spun * tiltCos;
                sum += z;
                const perspective = focal / (focal + z * scale);
                return {
                    vertex,
                    sx: centerX + (vertex.x * cos - vertex.z * sin) * scale * perspective,
                    sy: centerY - y * scale * perspective,
                    // 0 on the side turning away, 1 on the side coming forward.
                    front: Math.max(0, Math.min(1, 0.5 + (z / 20) * 0.5)),
                };
            });
            return { points, mid: sum / strand.length };
        });

        // Outer ring last, so the silhouette sits on top of its own infill.
        outlines.slice().reverse().forEach(({ points, mid }, index) => {
            const front = Math.max(0, Math.min(1, 0.5 + (mid / 20) * 0.5));
            const outer = index === outlines.length - 1;
            context.beginPath();
            points.forEach(({ sx, sy }, i) => (i ? context.lineTo(sx, sy) : context.moveTo(sx, sy)));
            context.closePath();
            context.strokeStyle = outer
                ? `rgba(${GOLD}, ${(0.2 + front * 0.3) * (0.75 + charge * 0.5)})`
                : `rgba(${HALO}, ${(0.05 + front * 0.16) * (0.75 + charge * 0.5)})`;
            context.lineWidth = outer ? 0.85 : 0.5;
            context.stroke();

            points.forEach(({ vertex, sx, sy, front: depth }) => {
                const twinkle = still ? 1 : 0.74 + Math.sin(elapsed * 0.0021 + vertex.seed) * 0.26;
                const alpha = (0.2 + depth * 0.74) * twinkle * (0.74 + beat * 0.15 + charge * 0.26);
                const spread = (0.6 + depth * 1.2) * (0.94 + beat * 0.1) * (outer ? 7 : 6);
                context.globalAlpha = Math.min(1, alpha);
                context.drawImage(glow(vertex.gold ? GOLD : HALO), sx - spread / 2, sy - spread / 2, spread, spread);
            });
        });
        context.globalAlpha = 1;
    }, size, size, !open);

    const activate = useCallback(() => {
        if (open || forming.current) return;
        forming.current = performance.now();
        timer.current = window.setTimeout(() => setOpen(true), FORM_MS);
    }, [open]);

    // Every click has to work, not just the first: the wind-up is released when
    // the note closes so the next click starts a fresh one.
    const close = useCallback(() => {
        window.clearTimeout(timer.current);
        forming.current = 0;
        setOpen(false);
    }, []);

    useEffect(() => () => window.clearTimeout(timer.current), []);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, close]);

    return (
        <>
            <button
                type="button"
                className={styles.widget}
                onClick={activate}
                aria-label="Open a small surprise"
            >
                <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
            </button>

            {open && (
                <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="My sweetheart" onClick={close}>
                    <div className={styles.modal} onClick={event => event.stopPropagation()}>
                        <button type="button" className={styles.close} onClick={close} aria-label="Close">×</button>
                        <HelixMark />
                        <p className={styles.eyebrow}>My sweetheart <span aria-hidden="true">♥</span></p>
                        <p className={styles.poem}>Among countless particles, you are the one I choose to entwine with.</p>
                        <a className={styles.link} href={HEART_LINK} target="_blank" rel="noopener noreferrer">
                            <Github size={15} aria-hidden="true" />
                            GO SAY HI →
                        </a>
                    </div>
                </div>
            )}
        </>
    );
}
