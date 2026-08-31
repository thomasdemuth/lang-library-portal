"use client";

/**
 * fireConfetti() — a short, dependency-free burst of paper for the moments
 * worth celebrating (a book checked out, a book brought back).
 *
 * One full-screen canvas is mounted for the burst and removed when the last
 * piece settles; overlapping calls share the canvas and just add paper.
 * It never captures input (pointer-events: none) and it's a silent no-op
 * when the visitor asked the OS for reduced motion — celebration must never
 * be the thing that makes someone sick.
 */

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  angle: number;
  spin: number;
  color: string;
  born: number;
  life: number; // ms
};

// The site's own bright pills — familiar, and cheerful on white or dark.
const COLORS = ["#2e50c8", "#b2222c", "#29ac9c", "#e8a531", "#7c4dbc", "#c2417f", "#4caf50"];

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let pieces: Piece[] = [];
let raf = 0;

function teardown() {
  cancelAnimationFrame(raf);
  raf = 0;
  pieces = [];
  canvas?.remove();
  canvas = null;
  ctx = null;
}

function frame(now: number) {
  if (!canvas || !ctx) return teardown();
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const dpr = window.devicePixelRatio || 1;
  pieces = pieces.filter((p) => now - p.born < p.life && p.y < height / dpr + 40);
  if (pieces.length === 0) return teardown();
  for (const p of pieces) {
    const age = (now - p.born) / p.life;
    p.vy += 0.12; // gravity
    p.vx *= 0.99; // drag
    p.x += p.vx;
    p.y += p.vy;
    p.angle += p.spin;
    ctx.save();
    ctx.globalAlpha = age > 0.7 ? 1 - (age - 0.7) / 0.3 : 1; // fade the last 30%
    ctx.translate(p.x * dpr, p.y * dpr);
    ctx.rotate(p.angle);
    // cos() wobble fakes the 3D tumble of a falling rectangle of paper
    ctx.scale(dpr, dpr * Math.cos(p.angle * 3));
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  raf = requestAnimationFrame(frame);
}

/**
 * Throw the paper. `count` scales the celebration — the default suits a
 * checkout; pass less for a smaller nicety, more for a milestone.
 */
export function fireConfetti(count = 90): void {
  if (typeof window === "undefined") return;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  } catch {
    /* matchMedia unavailable → celebrate anyway */
  }

  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999";
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    if (!ctx) return teardown();
  }

  // Two cones from the bottom corners, crossing over the page center.
  const now = performance.now();
  const H = window.innerHeight;
  const W = window.innerWidth;
  for (let i = 0; i < count; i++) {
    const fromLeft = i % 2 === 0;
    const speed = 9 + Math.random() * 7;
    const spread = (Math.random() - 0.5) * 0.9;
    const angle = fromLeft ? -Math.PI / 3 + spread : (-2 * Math.PI) / 3 + spread;
    pieces.push({
      x: fromLeft ? -10 : W + 10,
      y: H * (0.65 + Math.random() * 0.3),
      vx: Math.cos(angle) * speed, // the angle already points inward from its corner
      vy: Math.sin(angle) * speed,
      w: 5 + Math.random() * 5,
      h: 8 + Math.random() * 6,
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      born: now,
      life: 1400 + Math.random() * 900,
    });
  }
  if (!raf) raf = requestAnimationFrame(frame);
}
