"use client";

import { useEffect, useRef } from "react";
import type { CollapseRun } from "@/lib/ui";

/**
 * The collapse — the emotional core of Halisi.
 *
 * A flood of attempt-dots streams in, then collapses: the forged / replayed / reused noise dissipates
 * toward the center and fades, while the genuine credentials coalesce into a handful of glowing
 * identity nodes. The visual is the swarm shrinking to the real humans behind it.
 */

type Category = "accepted" | "forged" | "replay" | "duplicate";

interface Particle {
  x: number;
  y: number;
  sx: number;
  sy: number; // spawn
  cx: number;
  cy: number; // cloud position
  tx: number;
  ty: number; // final target
  cat: Category;
  size: number;
  seed: number;
}

const COLORS: Record<Category, string> = {
  accepted: "#35e3b4",
  forged: "#ff6b81",
  replay: "#ffb454",
  duplicate: "#6b87ff",
};

const MAX_VISIBLE = 1600;
const DURATION = 2600; // ms from flood to settled

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export default function CollapseCanvas({ run }: { run: CollapseRun | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{ particles: Particle[]; start: number; run: CollapseRun | null }>({
    particles: [],
    start: 0,
    run: null,
  });

  // Rebuild the particle field whenever a new run arrives.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !run) return;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const cxC = W / 2;
    const cyC = H * 0.46;

    const nodes = Math.max(run.distinctFingerprints, run.fingerprints.length);
    const denied = run.deniedForged + run.deniedReplay + run.deniedDuplicate;
    const total = run.accepted + denied || 1;
    const visibleDenied = Math.min(MAX_VISIBLE, denied);

    const particles: Particle[] = [];

    // Node particles — one per accepted identity, arranged on a tidy ring (or center for a single one).
    for (let i = 0; i < nodes; i++) {
      const angle = (i / Math.max(1, nodes)) * Math.PI * 2 - Math.PI / 2;
      const radius = nodes === 1 ? 0 : Math.min(W, H) * 0.2;
      const tx = cxC + Math.cos(angle) * radius;
      const ty = cyC + Math.sin(angle) * radius;
      const edge = spawnEdge(W, H);
      particles.push({
        x: edge.x,
        y: edge.y,
        sx: edge.x,
        sy: edge.y,
        cx: cxC + (Math.random() - 0.5) * W * 0.5,
        cy: cyC + (Math.random() - 0.5) * H * 0.4,
        tx,
        ty,
        cat: "accepted",
        size: 7,
        seed: Math.random() * 1000,
      });
    }

    // Denied particles, distributed by category proportionally.
    const cats: Category[] = [];
    pushN(cats, "forged", Math.round((run.deniedForged / total) * visibleDenied));
    pushN(cats, "replay", Math.round((run.deniedReplay / total) * visibleDenied));
    pushN(cats, "duplicate", Math.round((run.deniedDuplicate / total) * visibleDenied));
    for (const cat of cats) {
      const edge = spawnEdge(W, H);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * Math.min(W, H) * 0.34;
      particles.push({
        x: edge.x,
        y: edge.y,
        sx: edge.x,
        sy: edge.y,
        cx: cxC + Math.cos(a) * r,
        cy: cyC + Math.sin(a) * r * 0.8,
        tx: cxC + (Math.random() - 0.5) * 36, // pulled to the center and discarded
        ty: cyC + (Math.random() - 0.5) * 36,
        cat,
        size: 1.6 + Math.random() * 1.6,
        seed: Math.random() * 1000,
      });
    }

    stateRef.current = { particles, start: performance.now(), run };
  }, [run]);

  // The render loop runs for the life of the component (nodes keep a gentle pulse).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const frame = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      const { particles, start } = stateRef.current;
      const elapsed = now - start;
      // Honor reduced-motion: jump straight to the settled collapse instead of animating the flood.
      const phase = reducedMotion ? 1 : Math.min(1, elapsed / DURATION);

      for (const p of particles) {
        let x: number;
        let y: number;
        let alpha: number;
        let size = p.size;

        if (phase < 0.42) {
          // flood in toward the cloud
          const t = easeInOut(phase / 0.42);
          x = p.sx + (p.cx - p.sx) * t;
          y = p.sy + (p.cy - p.sy) * t;
          alpha = 0.15 + 0.55 * t;
        } else {
          // collapse: noise to the center + fade; identities to their nodes + brighten
          const t = easeInOut((phase - 0.42) / 0.58);
          x = p.cx + (p.tx - p.cx) * t;
          y = p.cy + (p.ty - p.cy) * t;
          if (p.cat === "accepted") {
            alpha = 0.7 + 0.3 * t;
            size = p.size + 3 * t;
          } else {
            alpha = 0.7 * (1 - t);
            size = p.size * (1 - 0.5 * t);
          }
        }

        if (alpha <= 0.01) continue;
        const color = COLORS[p.cat];
        if (p.cat === "accepted" && phase >= 0.42) {
          const pulse = 0.5 + 0.5 * Math.sin((now + p.seed * 30) / 600);
          ctx.shadowColor = color;
          ctx.shadowBlur = 14 + 8 * pulse;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      {!run && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "var(--faint)",
            fontSize: 14,
            pointerEvents: "none",
          }}
        >
          Fire a swarm to watch it collapse.
        </div>
      )}
    </div>
  );
}

function spawnEdge(W: number, H: number): { x: number; y: number } {
  const side = Math.floor(Math.random() * 4);
  if (side === 0) return { x: Math.random() * W, y: -20 };
  if (side === 1) return { x: W + 20, y: Math.random() * H };
  if (side === 2) return { x: Math.random() * W, y: H + 20 };
  return { x: -20, y: Math.random() * H };
}

function pushN(arr: Category[], cat: Category, n: number): void {
  for (let i = 0; i < n; i++) arr.push(cat);
}
