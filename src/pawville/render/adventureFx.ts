/**
 * Adventure-layer drawing shared by the town and every region (Milestone 6): quest markers,
 * collectible icons, glowing trails, Lumi, pressure plates / pedestals, gates, constellations.
 * Pure Canvas 2D, stateless (everything derives from time + state), bounded particle counts.
 */
import type { AdvView } from '../adventure/state.ts';
import type { AdventureSpot, GateDef } from '../adventure/regionKit.ts';
import { pixelEllipse, rect } from './canvasTypes.ts';
import type { StoryGlyph } from '../story/kit.ts';
import { drawStoryGlyphs } from './storyArt.ts';

export interface AdvFrame {
  view: AdvView;
  /** Spots visible right now (for markers and the interaction ring). */
  spots: readonly AdventureSpot[];
  /** Spot ids that belong to a current quest objective (get a bobbing marker). */
  highlight: ReadonlySet<string>;
  /** Pressure plates / pedestals currently pressed (by id: 'a' | 'b'). */
  pressed?: Readonly<Record<string, boolean>>;
  /** The Song Beneath the Stars: small drawn objects (chimes, bells, stones, the gate…) for the current story state. */
  glyphs?: readonly StoryGlyph[];
}

function h1(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const ITEM_ICON: Record<string, (ctx: CanvasRenderingContext2D, x: number, y: number) => void> = {
  'chart-piece': (c, x, y) => { rect(c, x - 3, y - 4, 7, 5, '#f3e2c4'); rect(c, x - 2, y - 3, 4, 1, '#3d5a8a'); rect(c, x + 2, y - 2, 1, 2, '#e0475c'); },
  driftwood: (c, x, y) => { rect(c, x - 5, y - 3, 10, 3, '#b5a080'); rect(c, x - 5, y - 3, 10, 1, '#d8c8a8'); },
  'harbor-shell': (c, x, y) => { pixelEllipse(c, x, y - 2, 3, 2, '#ffe1ec'); rect(c, x - 1, y - 3, 1, 2, '#e8a7bc'); rect(c, x + 1, y - 3, 1, 2, '#e8a7bc'); },
  'trail-map': (c, x, y) => { rect(c, x - 2, y - 6, 4, 6, '#bfe4ff'); rect(c, x - 1, y - 8, 2, 2, '#8a5a3b'); rect(c, x - 1, y - 4, 2, 2, '#f3e2c4'); },
  'bottle-note-1': (c, x, y) => { rect(c, x - 2, y - 6, 4, 6, '#9fe0c0'); rect(c, x - 1, y - 8, 2, 2, '#8a5a3b'); },
  'bottle-note-2': (c, x, y) => { rect(c, x - 2, y - 6, 4, 6, '#9fe0c0'); rect(c, x - 1, y - 8, 2, 2, '#8a5a3b'); },
  'glow-mushroom': (c, x, y) => { rect(c, x, y - 4, 1, 3, '#e9dccf'); pixelEllipse(c, x, y - 5, 3, 2, '#4a7fd0'); },
  gear: (c, x, y) => { pixelEllipse(c, x, y - 3, 3, 3, '#d6a03f'); rect(c, x - 4, y - 4, 8, 2, '#d6a03f'); rect(c, x - 1, y - 7, 2, 8, '#d6a03f'); rect(c, x, y - 3, 1, 1, '#5a3a22'); },
  moonstone: (c, x, y) => { pixelEllipse(c, x, y - 3, 3, 3, '#cfe4ff'); rect(c, x - 1, y - 4, 1, 1, '#ffffff'); },
  starstone: () => { /* drawn as a prop */ },
  'pine-cone': (c, x, y) => { pixelEllipse(c, x, y - 3, 2, 3, '#8a5a3b'); rect(c, x - 1, y - 4, 2, 1, '#b5835a'); },
  'frost-crystal': (c, x, y) => { rect(c, x - 1, y - 6, 2, 6, '#bfe4ff'); rect(c, x - 3, y - 3, 6, 1, '#ffffff'); },
  'star-shard': (c, x, y) => { rect(c, x, y - 6, 1, 5, '#ffe27a'); rect(c, x - 2, y - 4, 5, 1, '#ffe27a'); },
};

/** Collectible icons + sparkles, and a bobbing "!" over spots that are part of a current objective. */
export function drawSpotMarkers(ctx: CanvasRenderingContext2D, a: AdvFrame, time: number, still: boolean, cam: { x: number; y: number; w: number; h: number }) {
  if (a.glyphs?.length) drawStoryGlyphs(ctx, a.glyphs, time, still, cam);
  for (const s of a.spots) {
    const { x, y } = s.point;
    if (x < cam.x - 20 || x > cam.x + cam.w + 20 || y < cam.y - 20 || y > cam.y + cam.h + 30) continue;
    if (s.role === 'collect' && s.collect) {
      const icon = ITEM_ICON[s.collect.item];
      if (icon) icon(ctx, x, y);
      const k = still ? 0.5 : (time * 1.3 + h1(x + y)) % 1;
      if (k < 0.5) {
        ctx.globalAlpha = Math.sin((k / 0.5) * Math.PI);
        rect(ctx, x + 4, y - 9, 1, 3, '#fff3e6');
        rect(ctx, x + 3, y - 8, 3, 1, '#fff3e6');
        ctx.globalAlpha = 1;
      }
    }
    if (a.highlight.has(s.id) && s.role !== 'npc') {
      const bob = still ? 0 : Math.round(Math.sin(time * 5) * 1.5);
      questBang(ctx, x, y - 22 + bob);
    }
  }
}

/** The little quest marker (a gold "!" in a dark bubble). */
export function questBang(ctx: CanvasRenderingContext2D, x: number, y: number) {
  rect(ctx, x - 3, y - 7, 7, 10, '#2a1d2f');
  rect(ctx, x - 2, y - 8, 5, 12, '#2a1d2f');
  rect(ctx, x - 1, y - 6, 2, 5, '#ffc94a');
  rect(ctx, x - 1, y, 2, 2, '#ffc94a');
}

/** Glowing pawprints along a polyline (the Lost Star trail). */
export function drawTrail(ctx: CanvasRenderingContext2D, pts: readonly { x: number; y: number }[], color: string, time: number, still: boolean) {
  let n = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = 0; d < len; d += 14, n++) {
      const x = a.x + ((b.x - a.x) * d) / len + (n % 2 ? 3 : -3);
      const y = a.y + ((b.y - a.y) * d) / len;
      const pulse = still ? 0.7 : 0.45 + 0.4 * Math.sin(time * 3 - n * 0.5);
      ctx.globalAlpha = Math.max(0.15, pulse);
      rect(ctx, x - 1, y, 3, 2, color);
      rect(ctx, x - 2, y - 2, 1, 1, color); rect(ctx, x, y - 3, 1, 1, color); rect(ctx, x + 2, y - 2, 1, 1, color);
    }
  }
  ctx.globalAlpha = 1;
}

/** Lumi: a small floating star creature with a five-point tail and kind eyes. */
export function drawLumi(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, still: boolean) {
  const bob = still ? 0 : Math.round(Math.sin(time * 2.4) * 2);
  const cy = y - 12 + bob;
  pixelEllipse(ctx, x, y, 5, 1, 'rgba(20,12,30,0.25)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  pixelEllipse(ctx, x, cy, 10, 9, 'rgba(255, 226, 122, 0.18)');
  ctx.restore();
  // tail: a little five-point star trailing behind
  const tx = x - 8, ty = cy + 3;
  rect(ctx, tx, ty - 2, 1, 5, '#ffe27a'); rect(ctx, tx - 2, ty, 5, 1, '#ffe27a');
  pixelEllipse(ctx, x, cy, 5, 4, '#fff3c4');
  pixelEllipse(ctx, x, cy + 1, 4, 3, '#ffe27a');
  rect(ctx, x - 3, cy - 5, 2, 2, '#fff3c4'); rect(ctx, x + 2, cy - 5, 2, 2, '#fff3c4'); // ear-points
  rect(ctx, x - 2, cy - 1, 1, 2, '#2a1d2f'); rect(ctx, x + 2, cy - 1, 1, 2, '#2a1d2f');
  rect(ctx, x, cy + 1, 1, 1, '#ff9db0');
  if (!still) for (let i = 0; i < 4; i++) {
    const k = (time * 0.7 + i / 4) % 1;
    ctx.globalAlpha = 1 - k;
    rect(ctx, x + Math.round(Math.cos(i * 1.7 + time) * (6 + k * 6)), cy - Math.round(k * 10), 1, 1, '#fff3c4');
  }
  ctx.globalAlpha = 1;
}

/** A floor plate / star pedestal glow: lit when pressed. */
export function drawPlateGlow(ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean, color: string, time: number) {
  pixelEllipse(ctx, x, y - 2, 9, 4, on ? color : '#3a3247');
  pixelEllipse(ctx, x, y - 2, 7, 3, on ? '#ffffff' : '#5a5068');
  rect(ctx, x - 1, y - 3, 3, 2, on ? color : '#2a2433');
  if (on) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(time * 4);
    pixelEllipse(ctx, x, y - 4, 14, 8, color);
    ctx.restore();
  }
}

/** Gates (brambles, snowdrift, crystal) drawn over their blocking rectangle. */
export function drawGate(ctx: CanvasRenderingContext2D, g: Pick<GateDef, 'rect' | 'art'>) {
  const { x, y, w, h } = g.rect;
  if (g.art === 'snowdrift') {
    for (let i = 0; i < w; i += 6) pixelEllipse(ctx, x + i + 3, y + h - 4, 6, 6, i % 12 ? '#eef3fb' : '#dfe6f2');
    rect(ctx, x, y + h - 2, w, 2, '#c9d3e6');
  }
}

/** The bramble gate at the south end of town (closed) or open (an old wooden gate). */
export function drawTownGate(ctx: CanvasRenderingContext2D, x: number, y: number, open: boolean) {
  rect(ctx, x - 22, y - 26, 4, 26, '#5a3a22'); rect(ctx, x + 18, y - 26, 4, 26, '#5a3a22');
  rect(ctx, x - 22, y - 28, 44, 3, '#6b4329');
  if (open) {
    rect(ctx, x - 30, y - 20, 10, 16, '#80553a'); rect(ctx, x + 20, y - 20, 10, 16, '#80553a');
    for (let i = 0; i < 3; i++) { rect(ctx, x - 30, y - 18 + i * 5, 10, 1, '#5a3a22'); rect(ctx, x + 20, y - 18 + i * 5, 10, 1, '#5a3a22'); }
    return;
  }
  for (let i = 0; i < 9; i++) {
    const bx = x - 18 + i * 4, by = y - 4 - ((i * 7) % 18);
    pixelEllipse(ctx, bx, by, 4, 5, i % 2 ? '#2f6b3a' : '#3e5a2c');
    rect(ctx, bx - 1, by - 2, 1, 1, '#c93d74');
  }
  for (let i = 0; i < 6; i++) rect(ctx, x - 18 + i * 7, y - 20 + ((i * 5) % 12), 6, 1, '#5a3a22');
}

/** Named constellations in the night sky (screen space). */
export const LUMI_STARS: readonly [number, number][] = [[0.5, 0.1], [0.32, 0.32], [0.68, 0.32], [0.4, 0.62], [0.6, 0.62]];
export function drawConstellation(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, amount: number, time: number, stars: readonly [number, number][], at: { x: number; y: number; s: number }) {
  if (amount < 0.2) return;
  const pts = stars.map(([sx, sy]) => ({ x: Math.round(viewW * at.x + sx * at.s), y: Math.round(viewH * at.y + sy * at.s) }));
  ctx.globalAlpha = amount * 0.35;
  ctx.strokeStyle = '#bfe4ff';
  ctx.beginPath();
  const order = stars.length === 5 ? [0, 1, 3, 4, 2, 0] : stars.map((_, i) => i);
  order.forEach((i, k) => (k === 0 ? ctx.moveTo(pts[i].x + 0.5, pts[i].y + 0.5) : ctx.lineTo(pts[i].x + 0.5, pts[i].y + 0.5)));
  ctx.stroke();
  for (const [i, p] of pts.entries()) {
    ctx.globalAlpha = amount * (0.7 + 0.3 * Math.sin(time * 2 + i));
    rect(ctx, p.x - 1, p.y, 3, 1, '#fff3c4'); rect(ctx, p.x, p.y - 1, 1, 3, '#fff3c4');
  }
  ctx.globalAlpha = 1;
}

/** A soft beam sweeping from a lighthouse lamp (world space). */
export function drawBeam(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, strength: number, still: boolean) {
  if (strength <= 0.02) return;
  const a = still ? 0.6 : time * 0.9;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.22 * strength;
  ctx.fillStyle = '#ffe9a8';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(a - 0.12) * 260, y + Math.sin(a - 0.12) * 120);
  ctx.lineTo(x + Math.cos(a + 0.12) * 260, y + Math.sin(a + 0.12) * 120);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.6 * strength;
  pixelEllipse(ctx, x, y, 6, 4, '#fff3c4');
  ctx.restore();
}
