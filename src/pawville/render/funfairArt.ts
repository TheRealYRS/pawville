/**
 * Whiskerwick Funfair pixel art — procedural, same scale / outline / palette language as cityArt.ts and
 * districtArt.ts (no image files). Static props are sprites built once; the rides, the arena and the booths
 * are drawn per frame from the SHARED clock (see city/funfair.ts), so both partners always see the same wheel,
 * carousel and swing angles. Riders are ordinary cat sprites drawn by the region renderer; the helpers here
 * draw the parts of each ride that go behind a rider (back pass) and in front of one (front pass).
 */
import { RG } from '../adventure/regionKit.ts';
import {
  FERRIS, RIDE_SEATS, SWING, carouselAngle, carouselMount, ferrisAngle, ferrisCab, ferrisHub, swingAngle, swingChair, swingLift,
  type RideId,
} from '../city/funfair.ts';
import { PEGS, pegX } from '../city/ringToss.ts';
import { context2d, pixelEllipse, rect, type CanvasFactory } from './canvasTypes.ts';
import { drawSignText } from './pixelFont.ts';
import type { PropSprite } from './townArt.ts';

const T = 16;
const TAU = Math.PI * 2;
export const FAIR = {
  ink: '#2a1d2f', ink2: '#3a2a3e', cream: '#fff3e6', pink: '#ff8fb1', rose: '#e0475c', orange: '#ff8a35', gold: '#ffd36b', mint: '#7ee0d2',
  lav: '#c9bfe8', purple: '#6b4fbf', navy: '#3d5a8a', sky: '#9cc3ff', wood: '#8a5a3b', woodLt: '#b5835a', steel: '#8a7da0', steelLt: '#cfc6e3',
} as const;
const CAB_COLORS = ['#ff8a35', '#7ee0d2', '#ff8fb1', '#ffd36b', '#9cc3ff', '#c9bfe8', '#7edb8c', '#e0475c'] as const;

/** What the renderer tells the funfair art each frame. */
export interface FairFrame {
  /** The shared UTC clock (ms). */
  clockMs: number;
  /** Seats currently taken on each ride (by anybody). */
  occupied?: Partial<Record<RideId, readonly number[]>>;
  /** The seat the local player is waiting for (blinks at the gate). */
  waiting?: { ride: RideId; seat: number } | null;
}

function sprite(factory: CanvasFactory, w: number, h: number, ax: number, ay: number, draw: (ctx: CanvasRenderingContext2D) => void): PropSprite {
  const canvas = factory(w, h);
  draw(context2d(canvas));
  return { canvas, ox: -ax, oy: -ay };
}
const shadow = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry = 2) => pixelEllipse(ctx, x, y, rx, ry, 'rgba(20,12,30,0.3)');
const line = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, w = 1) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) rect(ctx, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), w, w, color);
};
const glow = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number) => {
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0.5, x, y, r);
  g.addColorStop(0, `rgba(${rgb}, ${a.toFixed(3)})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
};

// =============================================================================================
// Ground: the picket fence
// =============================================================================================
export function funfairGroundTile(ctx: CanvasRenderingContext2D, t: number, c: number, r: number, rand: () => number, nb: (dc: number, dr: number) => number): boolean {
  if (t !== RG.Fence) return false;
  const x = c * T, y = r * T;
  rect(ctx, x, y, T, T, (c + r) % 2 === 0 ? '#4f9a4a' : '#4b8847');
  for (let i = 0; i < 4; i++) rect(ctx, x + Math.floor(rand() * 15), y + Math.floor(rand() * 15), 1, 1, '#6fb062');
  const horiz = nb(-1, 0) === RG.Fence || nb(1, 0) === RG.Fence;
  const caps = ['#ff8fb1', '#7ee0d2', '#ffd36b', '#c9bfe8'];
  if (horiz) {
    // pickets (viewed from the front) with pastel caps and two rails
    rect(ctx, x, y + 7, T, 2, '#d9ccb8'); rect(ctx, x, y + 12, T, 2, '#d9ccb8'); rect(ctx, x, y + 7, T, 1, '#fff3e6');
    for (let i = 0; i < 4; i++) {
      const px = x + i * 4;
      rect(ctx, px, y + 3, 3, 12, '#fff3e6'); rect(ctx, px + 2, y + 3, 1, 12, '#e3d6c2');
      rect(ctx, px, y + 2, 3, 2, caps[(c * 4 + i) % 4]); rect(ctx, px + 1, y + 1, 1, 1, caps[(c * 4 + i) % 4]);
    }
    rect(ctx, x, y + 15, T, 1, 'rgba(20,12,30,0.35)');
  } else {
    // a side run: posts seen edge-on with a rail between them
    rect(ctx, x + 5, y, 6, T, '#fff3e6'); rect(ctx, x + 9, y, 2, T, '#e3d6c2');
    rect(ctx, x + 4, y + (r % 2 ? 2 : 9), 8, 4, caps[(r) % 4]);
    rect(ctx, x + 11, y, 1, T, 'rgba(20,12,30,0.3)');
  }
  return true;
}

// =============================================================================================
// Static sprites
// =============================================================================================
export function buildFunfairSprites(factory: CanvasFactory, s: Record<string, PropSprite>): void {
  const F = FAIR;
  // ---- the gate seen from inside the park (anchor: ground centre of the gap) ----
  s.funfairarch = sprite(factory, 120, 78, 60, 76, (ctx) => {
    shadow(ctx, 60, 74, 52, 3);
    for (const px of [10, 100]) {
      rect(ctx, px, 22, 10, 52, F.cream); rect(ctx, px + 8, 22, 2, 52, '#e3d6c2'); rect(ctx, px, 22, 2, 52, '#ffffff');
      for (let yy = 26; yy < 70; yy += 8) { rect(ctx, px, yy, 10, 2, F.pink); }
      rect(ctx, px - 2, 70, 14, 5, F.steel); rect(ctx, px - 2, 70, 14, 1, F.steelLt);
      // cat-ear finials
      for (const [ex, dir] of [[px, -1], [px + 7, 1]] as const) { rect(ctx, ex, 14, 3, 9, F.rose); rect(ctx, ex + (dir < 0 ? 0 : 0), 11, 3, 4, F.pink); }
    }
    // the sign board between the pillars
    rect(ctx, 14, 10, 92, 24, F.ink); rect(ctx, 15, 11, 90, 22, F.purple); rect(ctx, 15, 11, 90, 2, '#8a6fe0'); rect(ctx, 15, 31, 90, 2, '#4a3a8a');
    drawSignText(ctx, 'WHISKERWICK', 60, 14, F.gold, F.ink, 1);
    drawSignText(ctx, 'FUNFAIR', 60, 22, F.cream, F.ink, 2);
    for (let i = 0; i < 12; i++) rect(ctx, 16 + i * 7.5, 8, 3, 3, i % 2 ? F.pink : F.mint);
    for (let i = 0; i < 12; i++) rect(ctx, 16 + i * 7.5, 33, 3, 2, i % 2 ? F.mint : F.pink);
  });
  // ---- the gate seen from the city boardwalk, with the top of the Ferris wheel peeking over it ----
  s.funfairgate = sprite(factory, 132, 128, 66, 126, (ctx) => {
    // the wheel peeking up behind
    const hx = 66, hy = 58, R = 34;
    ctx.strokeStyle = '#cfc6e3'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hx, hy, R, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, hy, R - 7, Math.PI * 1.04, Math.PI * 1.96); ctx.stroke();
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) { const a = Math.PI * (1.05 + i * 0.1); line(ctx, hx, hy, hx + Math.cos(a) * R, hy + Math.sin(a) * R, '#b7aac8'); }
    for (let i = 0; i < 7; i++) { const a = Math.PI * (1.1 + i * 0.13); rect(ctx, Math.round(hx + Math.cos(a) * R) - 3, Math.round(hy + Math.sin(a) * R) + 1, 7, 6, CAB_COLORS[i % 8]); rect(ctx, Math.round(hx + Math.cos(a) * R) - 2, Math.round(hy + Math.sin(a) * R) + 2, 5, 2, '#fff2c8'); }
    pixelEllipse(ctx, hx, hy, 4, 4, F.steel);
    shadow(ctx, 66, 124, 58, 3);
    for (const px of [10, 112]) {
      rect(ctx, px, 52, 12, 72, F.cream); rect(ctx, px + 10, 52, 2, 72, '#e3d6c2'); rect(ctx, px, 52, 2, 72, '#ffffff');
      for (let yy = 58; yy < 118; yy += 10) rect(ctx, px, yy, 12, 3, F.pink);
      rect(ctx, px - 2, 119, 16, 6, F.steel); rect(ctx, px - 2, 119, 16, 1, F.steelLt);
      rect(ctx, px - 1, 42, 14, 12, F.rose); rect(ctx, px, 40, 12, 3, F.pink);
      rect(ctx, px, 32, 4, 10, F.rose); rect(ctx, px + 8, 32, 4, 10, F.rose); rect(ctx, px + 1, 34, 2, 6, F.pink); rect(ctx, px + 9, 34, 2, 6, F.pink); // cat ears
    }
    rect(ctx, 20, 62, 92, 26, F.ink); rect(ctx, 21, 63, 90, 24, F.purple); rect(ctx, 21, 63, 90, 2, '#8a6fe0'); rect(ctx, 21, 85, 90, 2, '#4a3a8a');
    drawSignText(ctx, 'FUNFAIR', 66, 66, F.gold, F.ink, 3);
    for (let i = 0; i < 13; i++) { rect(ctx, 22 + i * 7, 59, 3, 3, i % 2 ? F.pink : F.mint); rect(ctx, 22 + i * 7, 88, 3, 2, i % 2 ? F.mint : F.pink); }
    drawSignText(ctx, 'RIDES - GAMES - FUN', 66, 92, F.cream, F.ink, 1);
  });
  s.fairpillar = sprite(factory, 2, 2, 1, 1, () => undefined); // invisible collider anchors (the pillars are part of the arch art)
  // ---- the ticket booth ----
  s.ticketbooth = sprite(factory, 36, 52, 18, 50, (ctx) => {
    shadow(ctx, 18, 49, 16, 2);
    rect(ctx, 3, 24, 30, 24, F.wood); rect(ctx, 3, 24, 30, 2, F.woodLt); rect(ctx, 3, 46, 30, 2, '#5a3a22');
    rect(ctx, 6, 28, 24, 12, '#2a1d2f'); rect(ctx, 7, 29, 22, 10, '#ffd9a8'); rect(ctx, 7, 29, 22, 2, '#fff3c4'); // service window
    rect(ctx, 6, 40, 24, 4, F.woodLt); rect(ctx, 6, 40, 24, 1, '#d9a977'); // counter
    rect(ctx, 4, 20, 2, 28, '#5a3a22'); rect(ctx, 30, 20, 2, 28, '#5a3a22');
    for (let i = 0; i < 9; i++) rect(ctx, i * 4, 14, 4, 8, i % 2 ? F.cream : F.rose); // awning
    for (let i = 0; i < 9; i++) rect(ctx, i * 4, 22, 4, 2, i % 2 ? '#e3d6c2' : '#b5323e');
    rect(ctx, 6, 6, 24, 9, F.ink); rect(ctx, 7, 7, 22, 7, F.purple); drawSignText(ctx, 'TICKETS', 18, 8, F.gold, F.ink, 1);
    rect(ctx, 14, 2, 8, 5, F.rose); rect(ctx, 15, 0, 2, 3, F.rose); rect(ctx, 19, 0, 2, 3, F.rose);
    rect(ctx, 28, 36, 3, 4, F.gold); rect(ctx, 29, 35, 1, 1, F.gold); // a stub of tickets
  });
  // ---- balloons ----
  for (let v = 0; v < 2; v++) s[`balloons${v}`] = sprite(factory, 34, 60, 17, 58, (ctx) => {
    const cols = v ? ['#ff8fb1', '#ffd36b', '#7ee0d2', '#9cc3ff', '#e0475c'] : ['#e0475c', '#7ee0d2', '#ffd36b', '#ff8fb1', '#c9bfe8'];
    const spots: [number, number][] = [[8, 12], [18, 6], [27, 14], [13, 21], [23, 24]];
    spots.forEach(([bx, by], i) => {
      line(ctx, bx, by + 7, 17, 56, 'rgba(60,44,70,0.7)');
      pixelEllipse(ctx, bx, by, 5, 6, '#2a1d2f'); pixelEllipse(ctx, bx, by, 4, 5, cols[i]); rect(ctx, bx - 2, by - 3, 2, 2, 'rgba(255,255,255,0.7)'); rect(ctx, bx - 1, by + 5, 3, 2, cols[i]);
    });
    rect(ctx, 13, 55, 9, 3, F.wood); rect(ctx, 15, 53, 5, 3, F.woodLt);
  });
  // ---- bunting between two poles: a catenary of triangular flags ----
  for (let v = 0; v < 5; v++) s[`fairbunting${v}`] = sprite(factory, 160, 64, 80, 62, (ctx) => {
    const flagCols = [F.rose, F.gold, F.mint, F.pink, F.sky, F.orange];
    for (const px of [4, 154]) { rect(ctx, px, 8, 3, 54, F.wood); rect(ctx, px, 8, 1, 54, F.woodLt); rect(ctx, px - 1, 5, 5, 4, F.gold); }
    let prev: [number, number] | null = null;
    for (let x = 6; x <= 154; x += 2) {
      const k = (x - 6) / 148;
      const y = 12 + Math.round(Math.sin(k * Math.PI) * 14);
      if (prev) line(ctx, prev[0], prev[1], x, y, '#3a2a3e');
      prev = [x, y];
    }
    for (let x = 14, i = 0; x <= 148; x += 9, i++) {
      const k = (x - 6) / 148, y = 12 + Math.round(Math.sin(k * Math.PI) * 14);
      const col = flagCols[(i + v) % flagCols.length];
      for (let j = 0; j < 7; j++) rect(ctx, x - 3 + Math.floor((j + 1) / 2), y + 1 + j, 7 - j, 1, col);
      rect(ctx, x - 3, y + 1, 7, 1, col);
    }
  });
  // ---- park signboards ----
  for (let v = 0; v < 2; v++) s[`fairsign${v}`] = sprite(factory, 28, 36, 14, 34, (ctx) => {
    shadow(ctx, 14, 33, 8, 1);
    rect(ctx, 12, 14, 4, 20, F.wood); rect(ctx, 12, 14, 1, 20, F.woodLt);
    rect(ctx, 2, 2, 24, 16, F.ink); rect(ctx, 3, 3, 22, 14, v ? F.rose : F.navy); rect(ctx, 3, 3, 22, 1, v ? F.pink : F.sky);
    if (v) { drawSignText(ctx, 'RULES', 14, 6, F.cream, F.ink, 1); for (let i = 0; i < 3; i++) rect(ctx, 6, 12 + i * 2, 16, 1, 'rgba(255,255,255,0.5)'); }
    else { drawSignText(ctx, 'MAP', 14, 5, F.gold, F.ink, 1); rect(ctx, 6, 11, 5, 4, F.mint); rect(ctx, 13, 10, 6, 5, F.pink); rect(ctx, 20, 12, 3, 3, F.gold); }
  });
  // ---- Cloud Swing Ride chair / carousel mount / ferris cab variants (static pieces) ----
  for (let v = 0; v < 8; v++) {
    s[`swingchair${v}`] = sprite(factory, 16, 16, 8, 15, (ctx) => {
      rect(ctx, 1, 7, 14, 4, F.ink); rect(ctx, 2, 8, 12, 2, CAB_COLORS[v]); rect(ctx, 2, 8, 12, 1, '#ffffff'); // seat
      rect(ctx, 2, 1, 12, 7, F.ink); rect(ctx, 3, 2, 10, 5, CAB_COLORS[v]); rect(ctx, 3, 2, 10, 1, 'rgba(255,255,255,0.7)'); // back
      rect(ctx, 6, 11, 4, 2, F.ink2); // the bar
    });
    for (const dir of ['l', 'r'] as const) s[`moonmount${v}${dir}`] = sprite(factory, 30, 22, 15, 6, (ctx) => {
      // a "moon-cat" carousel animal seen from the side; the rider's feet rest at (15, 6)
      const col = CAB_COLORS[v], dk = '#2a1d2f';
      const R = (x: number, y: number, w: number, h: number, c: string) => rect(ctx, dir === 'r' ? 15 + x : 15 - x - w, y, w, h, c);
      R(-9, 5, 18, 8, dk); R(-8, 6, 16, 6, col); R(-8, 6, 16, 1, 'rgba(255,255,255,0.65)'); // body
      R(-9, 9, 2, 6, dk); R(-7, 9, 1, 5, col); R(7, 9, 2, 6, dk); R(6, 9, 1, 5, col); // legs
      R(8, 2, 8, 9, dk); R(9, 3, 6, 7, col); R(12, 6, 4, 3, F.cream); R(14, 5, 1, 1, dk); // head + muzzle + eye
      R(9, 0, 2, 4, dk); R(14, 0, 2, 4, dk); R(10, 1, 1, 2, F.pink); // ears
      R(-13, 3, 5, 3, dk); R(-12, 3, 3, 2, col); R(-14, 1, 2, 3, dk); R(-13, 1, 1, 2, F.gold); // curled tail
      R(-4, 3, 9, 3, F.rose); R(-4, 3, 9, 1, F.pink); // saddle blanket
      R(-1, 11, 2, 2, F.gold); // a little moon charm
    });
  }
}

// =============================================================================================
// Ferris wheel (dynamic, two passes so riders sit INSIDE their gondolas)
// =============================================================================================
function stroke(ctx: CanvasRenderingContext2D, w: number, color: string, f: () => void) {
  ctx.lineWidth = w; ctx.strokeStyle = color; ctx.beginPath(); f(); ctx.stroke(); ctx.lineWidth = 1;
}

export function drawFerrisBack(ctx: CanvasRenderingContext2D, ax: number, ay: number, ff: FairFrame, night: number, still: boolean): void {
  const F = FAIR;
  const hub = ferrisHub({ x: ax, y: ay });
  const R = FERRIS.radius;
  // ground shadow, deck and queue rails
  pixelEllipse(ctx, ax, ay + 3, 52, 5, 'rgba(20,12,30,0.3)');
  rect(ctx, ax - 26, ay + 3, 52, 14, '#a8754c'); rect(ctx, ax - 26, ay + 3, 52, 2, '#c99a6a');
  for (let yy = 7; yy < 17; yy += 4) rect(ctx, ax - 26, ay + yy, 52, 1, '#8a5a3b');
  rect(ctx, ax - 28, ay + 2, 2, 16, F.ink2); rect(ctx, ax + 26, ay + 2, 2, 16, F.ink2); rect(ctx, ax - 28, ay + 2, 56, 1, F.cream);
  // A-frame legs (front pair and a darker rear pair), cross brace and axle
  const leg = (x0: number, y0: number, x1: number, y1: number, dark: boolean) => { line(ctx, x0, y0, x1, y1, dark ? '#6d6285' : F.steel, 3); line(ctx, x0 - 1, y0, x1 - 1, y1, dark ? '#7d7295' : F.steelLt, 1); };
  leg(hub.x - 3, hub.y + 2, ax - 38, ay, true); leg(hub.x + 3, hub.y + 2, ax + 38, ay, true);
  leg(hub.x - 3, hub.y + 2, ax - 30, ay + 2, false); leg(hub.x + 3, hub.y + 2, ax + 30, ay + 2, false);
  const bx = (y: number, side: number) => hub.x + side * ((y - hub.y) / (ay - hub.y)) * 34;
  line(ctx, bx(ay - 34, -1), ay - 34, bx(ay - 34, 1), ay - 34, '#6d6285', 2);
  line(ctx, bx(ay - 18, -1), ay - 18, bx(ay - 18, 1), ay - 18, '#6d6285', 2);
  rect(ctx, ax - 40, ay - 1, 14, 4, '#5a5266'); rect(ctx, ax + 26, ay - 1, 14, 4, '#5a5266'); rect(ctx, ax - 40, ay - 1, 14, 1, F.steelLt); rect(ctx, ax + 26, ay - 1, 14, 1, F.steelLt);
  // the wheel: two rims and sixteen spokes
  const ang = ferrisAngle(still ? 0 : ff.clockMs);
  stroke(ctx, 2, '#e8e2ff', () => ctx.arc(hub.x + 0.5, hub.y + 0.5, R, 0, TAU));
  stroke(ctx, 1, '#cfc6e3', () => ctx.arc(hub.x + 0.5, hub.y + 0.5, R - 8, 0, TAU));
  ctx.strokeStyle = '#b7aac8';
  for (let i = 0; i < 16; i++) { const a = ang + (i * TAU) / 16; ctx.beginPath(); ctx.moveTo(hub.x + 0.5, hub.y + 0.5); ctx.lineTo(Math.round(hub.x + Math.sin(a) * R) + 0.5, Math.round(hub.y + Math.cos(a) * R) + 0.5); ctx.stroke(); }
  // rim lights (a slow chase); they glow at night
  for (let i = 0; i < 32; i++) {
    const a = ang + (i * TAU) / 32;
    const on = still ? i % 2 === 0 : (Math.floor(ff.clockMs / 260) + i) % 3 !== 0;
    const lx = Math.round(hub.x + Math.sin(a) * (R + 1)), ly = Math.round(hub.y + Math.cos(a) * (R + 1));
    rect(ctx, lx - 1, ly - 1, 2, 2, on ? ['#fff3c4', '#ffb3c9', '#bff4ea'][i % 3] : '#6d6285');
    if (on && night > 0.35) glow(ctx, lx, ly, 6, '255, 226, 160', 0.22 * night);
  }
  // hub: a star on a disc
  pixelEllipse(ctx, hub.x, hub.y, 6, 6, F.ink); pixelEllipse(ctx, hub.x, hub.y, 5, 5, F.steel); pixelEllipse(ctx, hub.x, hub.y, 3, 3, F.gold);
  for (let k = 0; k < 4; k++) { const a = ang * 2 + (k * TAU) / 4; rect(ctx, Math.round(hub.x + Math.cos(a) * 3), Math.round(hub.y + Math.sin(a) * 3), 1, 1, F.cream); }
  // gondola backs: hanger, back panel and roof
  const occ = new Set(ff.occupied?.ferris ?? []);
  for (let i = 0; i < RIDE_SEATS; i++) {
    const cab = ferrisCab({ x: ax, y: ay }, i, still ? 0 : ff.clockMs);
    const px = Math.round(cab.pivot.x), py = Math.round(cab.pivot.y);
    const col = CAB_COLORS[i];
    line(ctx, px, py, px - 9, py + 5, '#3a2a3e'); line(ctx, px, py, px + 9, py + 5, '#3a2a3e');
    rect(ctx, px - 11, py + 8, 22, 23, F.ink); rect(ctx, px - 10, py + 9, 20, 22, col); rect(ctx, px - 10, py + 9, 20, 2, 'rgba(255,255,255,0.45)');
    rect(ctx, px - 8, py + 11, 16, 15, occ.has(i) ? '#ffe9a8' : '#2a1d2f'); // the window behind the rider: lit when somebody is aboard
    // roof
    rect(ctx, px - 13, py + 3, 26, 6, F.ink); for (let k = 0; k < 6; k++) rect(ctx, px - 12 + k * 4, py + 4, 4, 4, k % 2 ? F.cream : col); rect(ctx, px - 12, py + 8, 24, 1, 'rgba(0,0,0,0.25)');
  }
}

export function drawFerrisFront(ctx: CanvasRenderingContext2D, ax: number, ay: number, ff: FairFrame, night: number, still: boolean): void {
  const F = FAIR;
  const occ = new Set(ff.occupied?.ferris ?? []);
  for (let i = 0; i < RIDE_SEATS; i++) {
    const cab = ferrisCab({ x: ax, y: ay }, i, still ? 0 : ff.clockMs);
    const px = Math.round(cab.pivot.x), py = Math.round(cab.pivot.y);
    const col = CAB_COLORS[i];
    // front rail covers the rider's legs; posts; bench lip
    rect(ctx, px - 12, py + 26, 24, 7, F.ink); rect(ctx, px - 11, py + 27, 22, 5, col); rect(ctx, px - 11, py + 27, 22, 1, 'rgba(255,255,255,0.6)'); rect(ctx, px - 11, py + 31, 22, 1, 'rgba(0,0,0,0.25)');
    for (let k = 0; k < 4; k++) rect(ctx, px - 8 + k * 5, py + 28, 1, 3, 'rgba(0,0,0,0.25)');
    rect(ctx, px - 12, py + 8, 2, 25, F.ink2); rect(ctx, px + 10, py + 8, 2, 25, F.ink2);
    // seat lamp: green = free, red = taken, a gold blink = your seat is arriving
    const waiting = ff.waiting?.ride === 'ferris' && ff.waiting.seat === i;
    const lamp = occ.has(i) ? '#ff5d6c' : waiting ? (Math.floor(ff.clockMs / 220) % 2 ? '#fff3c4' : '#ffd36b') : '#7edb8c';
    rect(ctx, px - 2, py + 1, 4, 3, F.ink); rect(ctx, px - 1, py + 2, 2, 2, lamp);
    if (night > 0.3) glow(ctx, px, py + 3, 8, occ.has(i) ? '255, 93, 108' : '126, 219, 140', 0.18 * night);
  }
}

/** A soft shadow on the ground under each occupied gondola — it shrinks and fades with height, so the climb reads. */
export function drawFerrisShadows(ctx: CanvasRenderingContext2D, ax: number, ay: number, ff: FairFrame): void {
  for (const i of ff.occupied?.ferris ?? []) {
    const cab = ferrisCab({ x: ax, y: ay }, i, ff.clockMs);
    const h = Math.max(0, Math.min(1, (ay + 2 - cab.seat.y) / 104)); // 0 at the bottom → 1 at the top
    const w = Math.round(9 - h * 4);
    ctx.globalAlpha = 0.34 - h * 0.2;
    pixelEllipse(ctx, Math.round(cab.seat.x), ay + 6, w, 2, '#1a1020');
    ctx.globalAlpha = 1;
  }
}

// =============================================================================================
// Moonbeam Carousel
// =============================================================================================
export function drawCarouselBase(ctx: CanvasRenderingContext2D, ax: number, ay: number, ff: FairFrame, night: number, still: boolean): void {
  const F = FAIR;
  const ang = carouselAngle(still ? 0 : ff.clockMs);
  const cx = ax, cy = ay - 2, rx = 44, ry = 22;
  pixelEllipse(ctx, cx, cy + 5, rx + 3, ry + 1, 'rgba(20,12,30,0.32)');
  pixelEllipse(ctx, cx, cy + 4, rx + 1, ry, F.ink); // skirt
  pixelEllipse(ctx, cx, cy + 3, rx, ry - 1, '#b5323e');
  for (let k = 0; k < 24; k++) { const a = (k * TAU) / 24; if (Math.sin(a) > -0.2) rect(ctx, Math.round(cx + Math.cos(a) * (rx - 2)), Math.round(cy + 3 + Math.sin(a) * (ry - 2)) - 1, 2, 3, k % 2 ? F.cream : F.gold); }
  // turning top deck: wedges that rotate with the ride
  for (let dy = -ry + 3; dy <= ry - 3; dy++) {
    const half = Math.round((rx - 3) * Math.sqrt(1 - (dy * dy) / ((ry - 3) * (ry - 3))));
    let runStart = -half, runCol = '';
    for (let dx = -half; dx <= half + 1; dx++) {
      let col = '';
      if (dx <= half) {
        const a = Math.atan2(dy / (ry - 3), dx / (rx - 3)) - ang;
        const wedge = Math.floor((((a % TAU) + TAU) % TAU) / (TAU / 16));
        col = Math.hypot(dx / (rx - 3), dy / (ry - 3)) < 0.22 ? F.gold : wedge % 2 ? '#ffe1ec' : '#ffb3c9';
      }
      if (col !== runCol) { if (runCol) rect(ctx, cx + runStart, cy + dy, dx - runStart, 1, runCol); runStart = dx; runCol = col; }
    }
  }
  stroke(ctx, 1, 'rgba(255,255,255,0.6)', () => ctx.ellipse(cx + 0.5, cy + 0.5, rx - 4, ry - 4, 0, 0, TAU));
  // chase lights round the rim
  for (let k = 0; k < 28; k++) {
    const a = (k * TAU) / 28 + (still ? 0 : ang);
    const on = still ? k % 2 === 0 : (Math.floor(ff.clockMs / 180) + k) % 3 !== 0;
    const lx = Math.round(cx + Math.cos(a) * (rx - 1)), ly = Math.round(cy + 3 + Math.sin(a) * (ry - 1));
    if (Math.sin(a) > -0.1) rect(ctx, lx - 1, ly - 1, 2, 2, on ? '#fff3c4' : '#8a6a5a');
    if (on && night > 0.35 && Math.sin(a) > 0) glow(ctx, lx, ly, 5, '255, 226, 160', 0.18 * night);
  }
  // step up at the gate (front centre)
  rect(ctx, ax - 10, ay + 20, 20, 5, '#a8754c'); rect(ctx, ax - 10, ay + 20, 20, 1, '#c99a6a'); rect(ctx, ax - 10, ay + 24, 20, 1, '#5a3a22');
}

/** The pole and canopy (drawn after the back mounts, before the front ones). */
export function drawCarouselTop(ctx: CanvasRenderingContext2D, ax: number, ay: number, ff: FairFrame, night: number, still: boolean): void {
  const F = FAIR;
  const ang = carouselAngle(still ? 0 : ff.clockMs);
  // central pole with candy stripes that spiral with the ride
  for (let yy = ay - 62; yy < ay - 2; yy++) rect(ctx, ax - 3, yy, 6, 1, Math.floor((yy + ang * 14) / 4) % 2 ? F.cream : F.rose);
  rect(ctx, ax - 3, ay - 62, 1, 60, 'rgba(255,255,255,0.55)'); rect(ctx, ax + 2, ay - 62, 1, 60, 'rgba(0,0,0,0.25)');
  rect(ctx, ax - 6, ay - 8, 12, 6, F.ink); rect(ctx, ax - 5, ay - 7, 10, 4, F.gold);
  // canopy: a striped cone whose stripes turn, scalloped at the rim
  const apexY = ay - 92, rimY = ay - 58, rimR = 48;
  for (let y = apexY; y <= rimY; y++) {
    const k = (y - apexY) / (rimY - apexY);
    const half = Math.max(1, Math.round(4 + (rimR - 4) * k));
    for (let dx = -half; dx <= half; dx += 1) {
      const a = Math.atan2(k * 14, dx) + ang * 1.0;
      const seg = Math.floor((((a * 3) % TAU) + TAU) % TAU / (TAU / 8));
      rect(ctx, ax + dx, y, 1, 1, seg % 2 ? F.cream : F.rose);
    }
    rect(ctx, ax - half, y, 1, 1, F.ink); rect(ctx, ax + half, y, 1, 1, F.ink);
  }
  rect(ctx, ax - rimR - 1, rimY, rimR * 2 + 3, 1, F.ink);
  for (let k = -rimR; k < rimR; k += 8) { pixelEllipse(ctx, ax + k + 4, rimY + 2, 4, 3, F.ink); pixelEllipse(ctx, ax + k + 4, rimY + 2, 3, 2, (k / 8) % 2 ? F.gold : F.pink); }
  // moon emblem on the front of the canopy
  pixelEllipse(ctx, ax, ay - 72, 7, 7, F.ink); pixelEllipse(ctx, ax, ay - 72, 6, 6, '#fff3c4'); pixelEllipse(ctx, ax + 3, ay - 74, 5, 5, F.rose);
  // finial: a star on a pole
  rect(ctx, ax - 1, apexY - 8, 2, 8, F.gold); rect(ctx, ax - 3, apexY - 11, 6, 3, F.gold); rect(ctx, ax - 1, apexY - 13, 2, 7, F.gold); rect(ctx, ax - 2, apexY - 10, 4, 1, '#fff3c4');
  // bulbs round the canopy rim
  for (let k = 0; k < 18; k++) {
    const a = (k * TAU) / 18 + ang;
    const bx = Math.round(ax + Math.cos(a) * (rimR - 2)), by = Math.round(rimY + 5 + Math.sin(a) * 6);
    if (Math.sin(a) > -0.4) {
      const on = still ? k % 2 === 0 : (Math.floor(ff.clockMs / 200) + k) % 2 === 0;
      rect(ctx, bx - 1, by - 1, 2, 2, on ? '#fff3c4' : '#8a6a5a');
      if (on && night > 0.35) glow(ctx, bx, by, 6, '255, 226, 160', 0.2 * night);
    }
  }
}

/** One mount: its pole from the canopy ring, then the animal (the rider is drawn right after by the renderer). */
export function drawCarouselMount(ctx: CanvasRenderingContext2D, sprites: Record<string, PropSprite>, ax: number, ay: number, i: number, ff: FairFrame, still: boolean, occupied: boolean): void {
  const m = carouselMount({ x: ax, y: ay }, i, still ? 0 : ff.clockMs);
  const vx = -Math.sin(m.a);
  const dir = vx >= 0 ? 'r' : 'l';
  const sp = sprites[`moonmount${i}${dir}`];
  const feetY = Math.round(m.y - m.lift);
  const topY = Math.round(ay - 4 - 50 + Math.sin(m.a) * 10);
  rect(ctx, Math.round(m.x), topY, 1, feetY - topY + 6, '#e8e2ff'); rect(ctx, Math.round(m.x) + 1, topY, 1, feetY - topY + 6, '#8a7da0');
  rect(ctx, Math.round(m.x) - 1, topY - 1, 3, 3, FAIR.gold);
  if (sp) ctx.drawImage(sp.canvas as unknown as CanvasImageSource, Math.round(m.x + sp.ox), feetY + sp.oy);
  if (occupied) rect(ctx, Math.round(m.x) - 1, feetY + 12, 3, 2, '#ff5d6c');
  else if (ff.waiting?.ride === 'carousel' && ff.waiting.seat === i) rect(ctx, Math.round(m.x) - 1, feetY + 12, 3, 2, Math.floor(ff.clockMs / 220) % 2 ? '#fff3c4' : '#ffd36b');
}

// =============================================================================================
// Cloud Swing Ride
// =============================================================================================
export function drawSwingBase(ctx: CanvasRenderingContext2D, ax: number, ay: number, ff: FairFrame, night: number, still: boolean): void {
  const F = FAIR;
  pixelEllipse(ctx, ax, ay + 3, 36, 12, 'rgba(20,12,30,0.3)');
  pixelEllipse(ctx, ax, ay + 1, 30, 10, F.ink); pixelEllipse(ctx, ax, ay, 29, 9, '#5876a8'); pixelEllipse(ctx, ax, ay - 1, 24, 7, '#7d9ad6');
  pixelEllipse(ctx, ax, ay - 1, 16, 4, '#cfe0ff');
  for (let k = 0; k < 16; k++) { const a = (k * TAU) / 16; rect(ctx, Math.round(ax + Math.cos(a) * 27), Math.round(ay + Math.sin(a) * 8), 2, 2, (still ? k : Math.floor(ff.clockMs / 220) + k) % 2 ? F.cream : F.gold); }
  rect(ctx, ax - 10, ay + 7, 20, 4, '#a8754c'); rect(ctx, ax - 10, ay + 7, 20, 1, '#c99a6a'); // step at the gate
  void night;
}

/** Mast, spinning ring and umbrella canopy. */
export function drawSwingTop(ctx: CanvasRenderingContext2D, ax: number, ay: number, ff: FairFrame, night: number, still: boolean): void {
  const F = FAIR;
  const ms = still ? 0 : ff.clockMs;
  const ang = swingAngle(ms);
  const lift = swingLift(ms);
  const ringY = ay - 4 - SWING.height;
  // mast
  rect(ctx, ax - 4, ringY - 10, 8, ay - ringY + 6, F.ink); rect(ctx, ax - 3, ringY - 10, 6, ay - ringY + 6, '#b7c6e6'); rect(ctx, ax - 3, ringY - 10, 2, ay - ringY + 6, '#ffffff');
  for (let yy = ringY; yy < ay - 6; yy += 8) rect(ctx, ax - 3, yy, 6, 2, F.sky);
  // the spinning ring (a turning wheel seen in perspective) with spokes
  const rx = SWING.ring + 5, ry = Math.round(rx * 0.5);
  stroke(ctx, 3, F.ink, () => ctx.ellipse(ax + 0.5, ringY + 0.5, rx, ry, 0, 0, TAU));
  stroke(ctx, 1, '#d8d0ee', () => ctx.ellipse(ax + 0.5, ringY + 0.5, rx, ry, 0, 0, TAU));
  for (let i = 0; i < RIDE_SEATS; i++) { const a = ang + (i * TAU) / RIDE_SEATS; line(ctx, ax, ringY, Math.round(ax + Math.cos(a) * rx), Math.round(ringY + Math.sin(a) * ry), '#d8d0ee'); }
  // umbrella canopy: sky-blue with fluffy white cloud puffs along the rim
  const topY = ringY - 22;
  pixelEllipse(ctx, ax, topY + 6, 32, 11, F.ink); pixelEllipse(ctx, ax, topY + 5, 31, 10, '#6e95d8'); pixelEllipse(ctx, ax, topY + 3, 26, 7, '#9cc3ff'); pixelEllipse(ctx, ax - 6, topY + 1, 13, 3, '#cfe4ff');
  for (let k = 0; k < 9; k++) { const a = (k * TAU) / 9 + ang * 0.2; const px = Math.round(ax + Math.cos(a) * 29), py = Math.round(topY + 10 + Math.sin(a) * 6); if (Math.sin(a) > -0.3) { pixelEllipse(ctx, px, py, 5, 3, F.ink); pixelEllipse(ctx, px, py, 4, 2, '#ffffff'); } }
  rect(ctx, ax - 1, topY - 8, 2, 9, F.gold); rect(ctx, ax - 3, topY - 11, 6, 3, F.gold); rect(ctx, ax - 1, topY - 13, 2, 7, F.gold);
  // lamps under the canopy
  for (let k = 0; k < 10; k++) {
    const a = (k * TAU) / 10 + ang; const bx = Math.round(ax + Math.cos(a) * 27), by = Math.round(topY + 13 + Math.sin(a) * 6);
    const on = (Math.floor(ms / 180) + k) % 2 === 0;
    if (Math.sin(a) > -0.2) { rect(ctx, bx - 1, by - 1, 2, 2, on ? '#fff3c4' : '#8a8aa0'); if (on && night > 0.35) glow(ctx, bx, by, 6, '200, 220, 255', 0.2 * night); }
  }
  void lift;
}

export function drawSwingChair(ctx: CanvasRenderingContext2D, sprites: Record<string, PropSprite>, ax: number, ay: number, i: number, ff: FairFrame, still: boolean, occupied: boolean): void {
  const c = swingChair({ x: ax, y: ay }, i, still ? 0 : ff.clockMs);
  const sx = Math.round(c.x), sy = Math.round(c.y - c.lift);
  // two chains from the ring to the seat back; chairs swing out as the ride speeds up
  line(ctx, Math.round(c.ringX) - 2, Math.round(c.ringY), sx - 7, sy - 12, '#3a2a3e'); line(ctx, Math.round(c.ringX) + 2, Math.round(c.ringY), sx + 7, sy - 12, '#3a2a3e');
  line(ctx, Math.round(c.ringX) - 2, Math.round(c.ringY), sx - 7, sy - 12, '#a79bc0', 1);
  const sp = sprites[`swingchair${i}`];
  if (sp) ctx.drawImage(sp.canvas as unknown as CanvasImageSource, sx + sp.ox, sy + sp.oy + 14);
  const waiting = ff.waiting?.ride === 'swing' && ff.waiting.seat === i;
  if (occupied) rect(ctx, sx - 1, sy + 14, 3, 2, '#ff5d6c');
  else if (waiting) rect(ctx, sx - 1, sy + 14, 3, 2, Math.floor(ff.clockMs / 220) % 2 ? '#fff3c4' : '#ffd36b');
}

// =============================================================================================
// Bumper Paws arena (the building in the park; the game itself is the panel)
// =============================================================================================
export function drawBumperArena(ctx: CanvasRenderingContext2D, ax: number, ay: number, ff: FairFrame, night: number, still: boolean): void {
  const F = FAIR;
  const t = (still ? 0 : ff.clockMs) / 1000;
  pixelEllipse(ctx, ax, ay + 1, 70, 5, 'rgba(20,12,30,0.3)');
  // floor (checker), seen from above
  rect(ctx, ax - 62, ay - 34, 124, 30, F.ink);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 15; c++) rect(ctx, ax - 61 + c * 8, ay - 33 + r * 7, 8, 7, (r + c) % 2 ? '#7ee0d2' : '#bff4ea');
  rect(ctx, ax - 62, ay - 34, 124, 2, 'rgba(0,0,0,0.25)');
  // three little cars bumbling about on the floor
  const cars: [string, number][] = [[F.orange, 0], [F.pink, 2.1], [F.sky, 4.2]];
  cars.forEach(([col, ph], i) => {
    const cx = ax + Math.sin(t * 0.7 + ph) * 44 + Math.cos(t * 0.31 + ph * 2) * 8;
    const cy = ay - 19 + Math.sin(t * 0.9 + ph * 1.3) * 9;
    const dirR = Math.cos(t * 0.7 + ph) >= 0;
    pixelEllipse(ctx, Math.round(cx), Math.round(cy) + 5, 8, 2, 'rgba(0,0,0,0.25)');
    rect(ctx, Math.round(cx) - 7, Math.round(cy) - 2, 14, 8, F.ink); rect(ctx, Math.round(cx) - 6, Math.round(cy) - 1, 12, 6, col); rect(ctx, Math.round(cx) - 6, Math.round(cy) - 1, 12, 1, 'rgba(255,255,255,0.6)');
    rect(ctx, Math.round(cx) - 7, Math.round(cy) + 3, 14, 2, F.cream); // rubber bumper ring
    rect(ctx, Math.round(cx) - 3, Math.round(cy) - 6, 6, 5, F.ink); rect(ctx, Math.round(cx) - 2, Math.round(cy) - 5, 4, 3, i === 0 ? '#ff8a35' : i === 1 ? '#252031' : '#fff3e6'); // the driver's head
    rect(ctx, Math.round(cx) - 3, Math.round(cy) - 8, 2, 3, F.ink); rect(ctx, Math.round(cx) + 1, Math.round(cy) - 8, 2, 3, F.ink); // cat ears
    rect(ctx, Math.round(cx) + (dirR ? 5 : -6), Math.round(cy), 1, 2, '#fff3c4');
    if (Math.floor(t * 6 + i) % 4 === 0) { rect(ctx, Math.round(cx) + 4, Math.round(cy) - 10, 2, 2, '#fff3c4'); rect(ctx, Math.round(cx) - 5, Math.round(cy) - 11, 1, 1, '#ffd36b'); } // pole sparks
  });
  // back wall with the sign, light bulbs and a scalloped pelmet
  rect(ctx, ax - 64, ay - 64, 128, 30, F.ink); rect(ctx, ax - 62, ay - 62, 124, 26, F.purple); rect(ctx, ax - 62, ay - 62, 124, 3, '#8a6fe0'); rect(ctx, ax - 62, ay - 38, 124, 2, '#4a3a8a');
  drawSignText(ctx, 'BUMPER PAWS', ax, ay - 57, F.gold, F.ink, 2);
  drawSignText(ctx, 'DRIVE - BUMP - GIGGLE', ax, ay - 44, F.cream, F.ink, 1);
  for (let k = 0; k < 16; k++) {
    const on = still ? k % 2 === 0 : (Math.floor(ff.clockMs / 220) + k) % 2 === 0;
    rect(ctx, ax - 60 + k * 8, ay - 66, 3, 3, on ? ['#fff3c4', '#ffb3c9', '#bff4ea'][k % 3] : '#6d6285');
    if (on && night > 0.3) glow(ctx, ax - 59 + k * 8, ay - 65, 6, '255, 226, 160', 0.2 * night);
  }
  for (const px of [ax - 66, ax + 60]) { rect(ctx, px, ay - 66, 6, 62, F.ink2); rect(ctx, px + 1, ay - 66, 4, 62, F.steel); rect(ctx, px + 1, ay - 66, 1, 62, F.steelLt); }
  // cushioned barrier along the front, with a gap for the door
  for (const [x0, x1] of [[ax - 62, ax - 12], [ax + 12, ax + 62]]) {
    for (let x = x0; x < x1; x += 10) { rect(ctx, x, ay - 6, 10, 9, F.ink); rect(ctx, x + 1, ay - 5, 8, 7, ((x - x0) / 10) % 2 ? F.cream : F.rose); rect(ctx, x + 1, ay - 5, 8, 1, 'rgba(255,255,255,0.6)'); }
  }
  rect(ctx, ax - 12, ay - 6, 24, 2, F.gold); // the door sill
  // door arrow, pulsing
  const pulse = still ? 0 : Math.round(Math.sin(t * 4) * 1);
  rect(ctx, ax - 3, ay + 5 + pulse, 7, 1, F.gold); rect(ctx, ax - 2, ay + 6 + pulse, 5, 1, F.gold); rect(ctx, ax - 1, ay + 7 + pulse, 3, 1, F.gold); rect(ctx, ax, ay + 8 + pulse, 1, 1, F.gold);
}

// =============================================================================================
// Ring Toss booth
// =============================================================================================
export function drawRingBooth(ctx: CanvasRenderingContext2D, ax: number, ay: number, ff: FairFrame, night: number, still: boolean): void {
  const F = FAIR;
  const ms = still ? 0 : ff.clockMs;
  shadow(ctx, ax, ay + 1, 40, 3);
  // back wall + peg board
  rect(ctx, ax - 36, ay - 62, 72, 50, F.ink); rect(ctx, ax - 34, ay - 60, 68, 46, '#2f4870');
  for (let r = 0; r < 3; r++) rect(ctx, ax - 34, ay - 58 + r * 14, 68, 1, 'rgba(255,255,255,0.12)');
  // pegs: near row, middle row, far row — same layout as the game (scaled onto the board)
  for (const p of PEGS) {
    const px = Math.round(ax - 32 + (pegX(p, ms) / 200) * 64), py = Math.round(ay - 24 - ((p.d - 0.36) / (0.8 - 0.36)) * 26);
    const col = p.golden ? F.gold : p.points === 3 ? F.rose : p.points === 2 ? F.mint : F.cream;
    rect(ctx, px - 1, py - 6, 3, 10, F.ink); rect(ctx, px, py - 6, 1, 10, col);
    pixelEllipse(ctx, px, py + 4, 3, 1, 'rgba(0,0,0,0.3)');
    if (p.golden) { rect(ctx, px - 2, py - 8, 5, 2, F.gold); rect(ctx, px - 1, py - 10, 3, 2, '#fff3c4'); if (night > 0.3) glow(ctx, px, py - 6, 9, '255, 226, 140', 0.3 * night); }
  }
  // the golden peg's rail
  rect(ctx, ax - 33, ay - 39, 66, 1, F.gold);
  // counter with stacked rings
  rect(ctx, ax - 36, ay - 16, 72, 15, F.ink); rect(ctx, ax - 35, ay - 15, 70, 13, F.wood); rect(ctx, ax - 35, ay - 15, 70, 2, F.woodLt); rect(ctx, ax - 35, ay - 3, 70, 2, '#5a3a22');
  for (let i = 0; i < 6; i++) { const col = [F.rose, F.gold, F.mint, F.pink, F.sky, F.orange][i]; pixelEllipse(ctx, ax - 24 + i * 9, ay - 13, 4, 2, F.ink); pixelEllipse(ctx, ax - 24 + i * 9, ay - 13, 3, 1, col); }
  // awning with scallops and the sign
  for (let i = 0; i < 12; i++) rect(ctx, ax - 40 + i * 6.7, ay - 74, 7, 12, i % 2 ? F.cream : F.rose);
  rect(ctx, ax - 40, ay - 74, 80, 2, 'rgba(255,255,255,0.5)');
  for (let i = 0; i < 12; i++) { pixelEllipse(ctx, Math.round(ax - 36.6 + i * 6.7), ay - 62, 3, 3, F.ink); pixelEllipse(ctx, Math.round(ax - 36.6 + i * 6.7), ay - 62, 2, 2, i % 2 ? '#e3d6c2' : '#b5323e'); }
  rect(ctx, ax - 28, ay - 96, 56, 22, F.ink); rect(ctx, ax - 27, ay - 95, 54, 20, F.purple); rect(ctx, ax - 27, ay - 95, 54, 2, '#8a6fe0'); rect(ctx, ax - 27, ay - 77, 54, 2, '#4a3a8a');
  drawSignText(ctx, 'RING TOSS', ax, ay - 92, F.gold, F.ink, 1); drawSignText(ctx, 'WIN PRIZES', ax, ay - 83, F.cream, F.ink, 1);
  rect(ctx, ax - 22, ay - 104, 8, 9, F.rose); rect(ctx, ax + 14, ay - 104, 8, 9, F.rose); rect(ctx, ax - 21, ay - 102, 6, 6, F.pink); rect(ctx, ax + 15, ay - 102, 6, 6, F.pink); // cat ears on the sign
  // posts + prize shelf with plushes
  rect(ctx, ax - 38, ay - 74, 3, 74, '#5a3a22'); rect(ctx, ax + 35, ay - 74, 3, 74, '#5a3a22');
  rect(ctx, ax + 38, ay - 40, 14, 3, F.woodLt);
  for (const [px, col] of [[ax + 40, F.orange], [ax + 46, '#3a3150']] as const) { pixelEllipse(ctx, px + 2, ay - 45, 3, 3, F.ink); pixelEllipse(ctx, px + 2, ay - 45, 2, 2, col); rect(ctx, px, ay - 49, 1, 2, col); rect(ctx, px + 3, ay - 49, 1, 2, col); }
  // "OPEN" lamp
  const on = still || Math.floor(ms / 500) % 2 === 0;
  rect(ctx, ax + 28, ay - 20, 6, 4, F.ink); rect(ctx, ax + 29, ay - 19, 4, 2, on ? '#7edb8c' : '#4f9a67');
  if (night > 0.3) glow(ctx, ax, ay - 40, 34, '255, 214, 140', 0.12 * night);
}

// =============================================================================================
// The photo booth (city) — a real little cat-themed cabinet with a curtain, a flash and a posing pad
// =============================================================================================
export function drawPhotoBooth(ctx: CanvasRenderingContext2D, x: number, y: number, ms: number, night: number, still: boolean, near: boolean): void {
  const F = FAIR;
  const t = still ? 0 : ms / 1000;
  shadow(ctx, x, y, 20, 3);
  // posing pad on the ground in front: stars and little paw marks
  pixelEllipse(ctx, x, y + 14, 22, 7, 'rgba(255,243,230,0.16)');
  pixelEllipse(ctx, x, y + 14, 18, 5, 'rgba(255,143,177,0.22)');
  for (const [dx, dy] of [[-8, 13], [6, 15], [-1, 17]] as const) { rect(ctx, x + dx, y + dy, 3, 2, 'rgba(255,255,255,0.55)'); rect(ctx, x + dx - 1, y + dy - 2, 1, 1, 'rgba(255,255,255,0.55)'); rect(ctx, x + dx + 1, y + dy - 2, 1, 1, 'rgba(255,255,255,0.55)'); rect(ctx, x + dx + 3, y + dy - 2, 1, 1, 'rgba(255,255,255,0.55)'); }
  // cabinet body
  rect(ctx, x - 16, y - 50, 32, 50, F.ink); rect(ctx, x - 15, y - 49, 30, 48, F.purple); rect(ctx, x - 15, y - 49, 3, 48, '#8a6fe0'); rect(ctx, x + 12, y - 49, 3, 48, '#4a3a8a');
  for (let yy = y - 40; yy < y - 3; yy += 6) rect(ctx, x - 15, yy, 30, 1, 'rgba(255,255,255,0.08)');
  // the cat-ear canopy and the sign
  rect(ctx, x - 19, y - 60, 38, 12, F.ink); rect(ctx, x - 18, y - 59, 36, 10, F.rose); rect(ctx, x - 18, y - 59, 36, 2, F.pink);
  for (let i = 0; i < 9; i++) rect(ctx, x - 18 + i * 4, y - 51, 4, 3, i % 2 ? F.cream : F.rose);
  rect(ctx, x - 16, y - 68, 8, 9, F.ink); rect(ctx, x + 8, y - 68, 8, 9, F.ink); rect(ctx, x - 15, y - 66, 6, 7, F.rose); rect(ctx, x + 9, y - 66, 6, 7, F.rose); rect(ctx, x - 14, y - 64, 4, 4, F.pink); rect(ctx, x + 10, y - 64, 4, 4, F.pink);
  drawSignText(ctx, 'PHOTO', x, y - 57, F.gold, F.ink, 1);
  drawSignText(ctx, 'BOOTH', x, y - 51, F.cream, F.ink, 1);
  // camera eye with a flash ring
  const flash = !still && Math.floor(t * 0.7) % 4 === 0 && (t * 0.7) % 1 > 0.88;
  pixelEllipse(ctx, x, y - 40, 6, 6, F.ink); pixelEllipse(ctx, x, y - 40, 5, 5, '#3a3150'); pixelEllipse(ctx, x, y - 40, 3, 3, '#7d9ad6'); rect(ctx, x - 2, y - 42, 2, 2, '#e8f4ff');
  for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8; const on = flash || (Math.floor(t * 3) + k) % 4 === 0; rect(ctx, Math.round(x + Math.cos(a) * 8) - 1, Math.round(y - 40 + Math.sin(a) * 8) - 1, 2, 2, on ? '#fff3c4' : '#8a6a5a'); }
  if (flash) glow(ctx, x, y - 40, 40, '255, 255, 255', 0.5);
  // the doorway with a swaying curtain
  rect(ctx, x - 11, y - 31, 22, 31, F.ink); rect(ctx, x - 10, y - 30, 20, 30, '#ffd9a8'); rect(ctx, x - 10, y - 30, 20, 3, '#fff3c4');
  rect(ctx, x - 6, y - 24, 12, 3, '#d9a977'); // a little stool seat inside
  const sway = still ? 0 : Math.round(Math.sin(t * 1.6) * 1);
  for (let i = 0; i < 7; i++) { const w = 3 + (i % 2); rect(ctx, x - 10 + i * 3 + (i > 3 ? 1 : 0) + sway * (i % 2), y - 30, w, 29 - (i % 3), i % 2 ? '#e0475c' : '#c73a4e'); }
  rect(ctx, x - 11, y - 31, 22, 2, F.gold); // the rail
  rect(ctx, x - 11, y - 3, 22, 3, F.ink);
  // output slot with a printed strip peeking out
  rect(ctx, x + 11, y - 18, 7, 8, F.ink); rect(ctx, x + 12, y - 17, 5, 5, '#2a1d2f'); rect(ctx, x + 13, y - 12, 3, 4 + (flash ? 3 : 0), '#fff3e6');
  // status lamp: gold + a bobbing marker when someone is close enough to use it
  const ok = still || Math.floor(t * 2) % 2 === 0;
  rect(ctx, x - 14, y - 12, 4, 4, F.ink); rect(ctx, x - 13, y - 11, 2, 2, ok ? '#7edb8c' : '#4f9a67');
  if (near) { const b = still ? 0 : Math.round(Math.sin(t * 6) * 2); rect(ctx, x - 5, y - 78 + b, 10, 8, F.ink); rect(ctx, x - 4, y - 77 + b, 8, 6, F.gold); rect(ctx, x - 2, y - 75 + b, 4, 3, F.ink); rect(ctx, x - 1, y - 74 + b, 2, 1, '#7d9ad6'); }
  if (night > 0.3) { glow(ctx, x, y - 30, 38, '255, 200, 150', 0.16 * night); glow(ctx, x, y + 12, 24, '255, 143, 177', 0.12 * night); }
}

// =============================================================================================
// Dispatcher used by the region renderer for the funfair's animated props
// =============================================================================================
export const FAIR_DYNAMIC = new Set(['ferris', 'carousel', 'swingride', 'bumperarena', 'ringbooth']);
