/**
 * Milestone 10: the home garden scene (pixel art, drawn per frame at 192×112). Six raised beds,
 * each crop at its real growth stage, the decorations you've put out, and the wildlife the garden
 * attracts (butterflies, bees, a bird at the birdbath, fireflies at night).
 */
import { pixelEllipse, rect } from './canvasTypes.ts';
import { GARDEN_BEDS, STAGES, cropById, wildlife, type Bed, type HomeGarden } from '../home/homeGarden.ts';

export const GARDEN_W = 192;
export const GARDEN_H = 112;
const OUT = '#2a1d2f';

/** Bed rectangles (scene pixels), shared with the click hit-test. */
export function bedRect(i: number): { x: number; y: number; w: number; h: number } {
  const col = i % 3, row = Math.floor(i / 3);
  return { x: 22 + col * 54, y: 40 + row * 34, w: 42, h: 22 };
}

function h1(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function plant(ctx: CanvasRenderingContext2D, b: Bed, x: number, y: number, t: number, i: number) {
  const c = cropById(b.crop);
  const sway = Math.round(Math.sin(t * 1.6 + i) * (b.stage >= 2 ? 1 : 0));
  if (b.stage === 0) { // seeds: little mounds
    for (let k = 0; k < 3; k++) { rect(ctx, x + 8 + k * 12, y + 13, 4, 2, '#6b4329'); rect(ctx, x + 9 + k * 12, y + 12, 2, 1, '#8a5d3a'); }
    return;
  }
  for (let k = 0; k < 3; k++) {
    const px = x + 9 + k * 12 + sway, base = y + 15;
    if (b.stage === 1) { rect(ctx, px, base - 3, 1, 3, '#4f9a67'); rect(ctx, px - 1, base - 4, 1, 1, '#7edb8c'); rect(ctx, px + 1, base - 4, 1, 1, '#7edb8c'); continue; }
    const tall = b.stage === 2 ? 6 : 9;
    rect(ctx, px, base - tall, 1, tall, '#3e7a4f');
    for (let l = 0; l < tall - 2; l += 2) { rect(ctx, px - 2, base - l - 3, 2, 1, '#4f9a67'); rect(ctx, px + 1, base - l - 4, 2, 1, '#7edb8c'); }
    if (b.stage >= STAGES) {
      if (c.id === 'carrot') { rect(ctx, px - 1, base - 1, 3, 3, c.color); rect(ctx, px, base + 2, 1, 1, c.color); }
      else if (c.id === 'berries') { for (const [dx, dy] of [[-2, -5], [2, -7], [-1, -8], [2, -3]]) rect(ctx, px + dx, base + dy, 2, 2, c.color); }
      else if (c.id === 'catnip') { rect(ctx, px - 1, base - tall - 2, 3, 2, '#c9bfe8'); rect(ctx, px, base - tall - 3, 1, 1, '#fff3e6'); }
      else { rect(ctx, px - 2, base - tall - 1, 5, 2, '#9cdb7e'); }
    }
  }
}

export function drawGarden(ctx: CanvasRenderingContext2D, g: HomeGarden, t: number, night: boolean, still: boolean, hover: number | null): void {
  const tt = still ? 0 : t;
  ctx.imageSmoothingEnabled = false;
  // sky + back fence + the cottage wall
  const sky = ctx.createLinearGradient(0, 0, 0, 30);
  sky.addColorStop(0, night ? '#141235' : '#9cc3ff'); sky.addColorStop(1, night ? '#2a1f4a' : '#e8f4ff');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, GARDEN_W, 30);
  if (night) for (let i = 0; i < 20; i++) { ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(tt + i)); rect(ctx, Math.floor(h1(i) * GARDEN_W), Math.floor(h1(i + 9) * 24), 1, 1, '#fff3c4'); } ctx.globalAlpha = 1;
  rect(ctx, 0, 14, 46, 18, '#a8754f'); rect(ctx, 0, 12, 48, 3, '#6b4329'); rect(ctx, 10, 18, 12, 10, '#5a3a22'); rect(ctx, 11, 19, 10, 8, night ? '#ffd68c' : '#cfe4ff'); rect(ctx, 16, 19, 1, 8, '#5a3a22');
  for (let x = 48; x < GARDEN_W; x += 8) { rect(ctx, x, 16, 6, 16, '#e9dccf'); rect(ctx, x + 1, 14, 4, 2, '#e9dccf'); rect(ctx, x + 5, 16, 1, 16, '#cfc0b0'); }
  rect(ctx, 48, 20, GARDEN_W - 48, 2, '#cfc0b0'); rect(ctx, 48, 27, GARDEN_W - 48, 2, '#cfc0b0');
  // lawn
  rect(ctx, 0, 30, GARDEN_W, GARDEN_H - 30, night ? '#2c4a34' : '#5aa955');
  for (let i = 0; i < 90; i++) rect(ctx, Math.floor(h1(i * 3) * GARDEN_W), 32 + Math.floor(h1(i * 7) * (GARDEN_H - 34)), 1, 2, night ? '#24402c' : '#4f9a4a');
  // the path
  rect(ctx, 88, 30, 16, GARDEN_H - 30, night ? '#5a4a3a' : '#c8a67a'); for (let y = 34; y < GARDEN_H; y += 7) rect(ctx, 90 + (y % 2) * 4, y, 6, 3, night ? '#6b5a48' : '#d9b88a');
  // decorations
  if (g.decor.includes('flower-border')) for (let x = 2; x < GARDEN_W; x += 6) { if (x > 84 && x < 106) continue; rect(ctx, x, 31, 2, 2, ['#ff8fb1', '#ffd36b', '#c9bfe8'][(x / 6) % 3 | 0]); rect(ctx, x, 33, 1, 2, '#3e7a4f'); }
  if (g.decor.includes('birdbath')) { rect(ctx, 178, 92, 2, 10, '#b7aac8'); pixelEllipse(ctx, 179, 91, 7, 2, '#cfc6e3'); pixelEllipse(ctx, 179, 91, 5, 1, night ? '#3d5a8a' : '#7fb2e6'); rect(ctx, 175, 101, 9, 2, '#8a7da0'); }
  if (g.decor.includes('gnome')) { rect(ctx, 8, 96, 6, 7, '#4f74c9'); rect(ctx, 9, 92, 4, 4, '#ffd9b0'); rect(ctx, 9, 95, 4, 3, '#fff3e6'); for (let k = 0; k < 4; k++) rect(ctx, 10 - (k > 1 ? 0 : 0) + (k % 2), 88 + k, 4 - k, 1, '#e0475c'); }
  if (g.decor.includes('bee-hotel')) { rect(ctx, 178, 44, 10, 12, '#8a5d3a'); rect(ctx, 179, 45, 8, 10, '#5a3a22'); for (let k = 0; k < 6; k++) rect(ctx, 180 + (k % 3) * 2, 46 + Math.floor(k / 3) * 4, 1, 2, '#c99a6a'); rect(ctx, 182, 56, 2, 8, '#5a3a22'); }
  if (g.decor.includes('lanterns')) for (let x = 50; x < GARDEN_W; x += 18) { const y = 14 + Math.round(Math.sin(x / 30) * 2); rect(ctx, x, y, 1, 2, '#3a2416'); rect(ctx, x - 1, y + 2, 3, 3, ['#ffd27a', '#ff8fb1', '#7ee0d2'][(x / 18) % 3 | 0]); if (night) { ctx.globalAlpha = 0.25; pixelEllipse(ctx, x, y + 3, 6, 5, '#ffd68c'); ctx.globalAlpha = 1; } }
  // beds
  for (let i = 0; i < GARDEN_BEDS; i++) {
    const r = bedRect(i);
    rect(ctx, r.x - 1, r.y - 1, r.w + 2, r.h + 2, OUT);
    rect(ctx, r.x, r.y, r.w, r.h, '#8a5d3a'); rect(ctx, r.x, r.y, r.w, 2, '#a8754f');
    rect(ctx, r.x + 2, r.y + 3, r.w - 4, r.h - 5, '#5a3a22');
    for (let k = 0; k < 8; k++) rect(ctx, r.x + 3 + Math.floor(h1(i * 20 + k) * (r.w - 6)), r.y + 5 + Math.floor(h1(i * 31 + k) * (r.h - 9)), 2, 1, '#6b4329');
    const b = g.beds[i];
    if (b?.wateredAt !== null && b?.wateredAt !== undefined) { ctx.globalAlpha = 0.45; rect(ctx, r.x + 2, r.y + 3, r.w - 4, r.h - 5, '#2a2a4a'); ctx.globalAlpha = 1; }
    if (b) plant(ctx, b, r.x, r.y, tt, i);
    if (hover === i) { ctx.strokeStyle = '#ffc94a'; ctx.strokeRect(r.x - 2.5, r.y - 2.5, r.w + 5, r.h + 5); }
  }
  // wildlife
  const w = wildlife(g, night);
  for (let i = 0; i < w.butterflies; i++) {
    const x = Math.round(40 + i * 50 + Math.sin(tt * 0.7 + i * 2) * 30), y = Math.round(44 + Math.cos(tt * 1.1 + i) * 14);
    const flap = Math.floor(tt * 8 + i) % 2;
    const col = ['#ffd36b', '#ff8fb1', '#9cc3ff'][i % 3];
    rect(ctx, x - 2, y - (flap ? 1 : 0), 2, flap ? 3 : 2, col); rect(ctx, x + 1, y - (flap ? 1 : 0), 2, flap ? 3 : 2, col); rect(ctx, x, y, 1, 2, OUT);
  }
  for (let i = 0; i < w.bees; i++) { const x = Math.round(150 + Math.sin(tt * 2.3 + i * 3) * 24), y = Math.round(60 + Math.cos(tt * 2.9 + i) * 10); rect(ctx, x, y, 3, 2, '#ffc94a'); rect(ctx, x + 1, y, 1, 2, OUT); rect(ctx, x, y - 1, 2, 1, '#e8f4ff'); }
  if (w.bird) { const hop = Math.floor(tt * 1.5) % 4 === 0 ? 1 : 0; rect(ctx, 176, 86 - hop, 5, 3, '#8a5d3a'); rect(ctx, 180, 85 - hop, 2, 2, '#8a5d3a'); rect(ctx, 182, 86 - hop, 1, 1, '#ffb13d'); rect(ctx, 176, 88 - hop, 3, 1, '#e0475c'); }
  for (let i = 0; i < w.fireflies; i++) { ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(tt * 2 + i * 1.7)); rect(ctx, Math.round(h1(i) * GARDEN_W + Math.sin(tt * 0.5 + i) * 8), Math.round(40 + h1(i * 5) * 60 + Math.cos(tt * 0.7 + i) * 5), 1, 1, '#d7ff7a'); }
  ctx.globalAlpha = 1;
  if (night) { ctx.globalAlpha = 0.25; rect(ctx, 0, 0, GARDEN_W, GARDEN_H, '#1b1840'); ctx.globalAlpha = 1; }
}
