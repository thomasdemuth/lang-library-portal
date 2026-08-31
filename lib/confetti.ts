"use client";

/**
 * fireConfetti() / fireHearts() — short, dependency-free bursts for the
 * moments worth celebrating (a book checked out, a book brought back, a
 * favorite hearted, a badge earned).
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
  /** Paper tumbles and falls; hearts drift up and fade. */
  shape: "paper" | "heart";
  gravity: number;
};

// The site's own bright pills — familiar, and cheerful on white or dark.
const COLORS = ["#2e50c8", "#b2222c", "#29ac9c", "#e8a531", "#7c4dbc", "#c2417f", "#4caf50"];

/**
 * The same heart outline the favorite button draws (components/icons.tsx),
 * as a Path2D on a 24x24 box so it can be scaled per piece. Built lazily —
 * Path2D doesn't exist during SSR.
 */
const HEART_D =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";
let heartPath: Path2D | null = null;

/**
 * Did the visitor ask the OS for less motion? Every celebration in the app
 * checks this — exported so components can skip their own animations too,
 * rather than each re-deriving the media query.
 */
export function reducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false; // matchMedia unavailable → celebrate anyway
  }
}

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
    p.vy += p.gravity;
    p.vx *= 0.99; // drag
    p.x += p.vx;
    p.y += p.vy;
    p.angle += p.spin;
    ctx.save();
    ctx.globalAlpha = age > 0.7 ? 1 - (age - 0.7) / 0.3 : 1; // fade the last 30%
    ctx.translate(p.x * dpr, p.y * dpr);
    ctx.rotate(p.angle);
    ctx.fillStyle = p.color;
    if (p.shape === "heart") {
      // Hearts stay upright-ish and just pulse; a tumbling heart reads as a
      // falling blob. Scale from the 24x24 path box down to p.w.
      const s = (p.w / 24) * dpr;
      ctx.scale(s, s);
      ctx.translate(-12, -12);
      if (heartPath) ctx.fill(heartPath);
    } else {
      // cos() wobble fakes the 3D tumble of a falling rectangle of paper
      ctx.scale(dpr, dpr * Math.cos(p.angle * 3));
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    ctx.restore();
  }
  raf = requestAnimationFrame(frame);
}

/**
 * Throw the paper. `count` scales the celebration — the default suits a
 * checkout; pass less for a smaller nicety, more for a milestone.
 */
/** Mount (or reuse) the burst canvas. False if we can't draw at all. */
function ensureCanvas(): boolean {
  if (canvas) return true;
  canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999";
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  ctx = canvas.getContext("2d");
  if (!ctx) {
    teardown();
    return false;
  }
  return true;
}

export function fireConfetti(count = 90): void {
  if (typeof window === "undefined" || reducedMotion()) return;
  if (!ensureCanvas()) return;

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
      shape: "paper",
      gravity: 0.12,
    });
  }
  if (!raf) raf = requestAnimationFrame(frame);
}

/** The reds a heart burst is allowed to be — the favorite heart's own ink. */
const HEART_COLORS = ["#e11d48", "#c2417f", "#e82d86", "#ff6b8a"];

/**
 * A small puff of hearts from a point on screen — for the moment a book is
 * favorited. `origin` is in viewport coordinates (pass the heart button's own
 * bounding rect center).
 *
 * This rides the full-screen canvas rather than spawning DOM particles on the
 * button: book cards sit inside `.newshelf-row { overflow-x: auto }`, so a
 * DOM burst would be clipped at the shelf edge. The canvas has no such box.
 */
export function fireHearts(origin: { x: number; y: number }, count = 14): void {
  if (typeof window === "undefined" || reducedMotion()) return;
  if (!ensureCanvas()) return;
  if (!heartPath) {
    try {
      heartPath = new Path2D(HEART_D);
    } catch {
      return; // no Path2D → skip the flourish rather than draw nothing
    }
  }

  const now = performance.now();
  for (let i = 0; i < count; i++) {
    // A narrow upward fan, so the hearts rise out of the button and drift.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
    const speed = 3 + Math.random() * 3.5;
    pieces.push({
      x: origin.x + (Math.random() - 0.5) * 14,
      y: origin.y + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 9 + Math.random() * 9,
      h: 0, // unused for hearts — the path carries its own proportions
      angle: (Math.random() - 0.5) * 0.5,
      spin: (Math.random() - 0.5) * 0.06,
      color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
      born: now,
      life: 900 + Math.random() * 500,
      shape: "heart",
      gravity: 0.05, // barely falls — they float up, slow, and fade
    });
  }
  if (!raf) raf = requestAnimationFrame(frame);
}
