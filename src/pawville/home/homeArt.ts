/**
 * Furnished-room renderer for the couple home (Milestone 4). Draws a cozy, slightly elevated
 * (3/4 top-down) pixel-art room on a canvas: floorboards, back wall with wainscot, trim and
 * baseboard, a side wall with a real door, light pools from windows and lamps, and individually
 * illustrated furniture with legs, cushions, outlines and contact shadows. Every piece follows
 * the same perspective: its footprint sits on the floor grid and its height rises "up" the screen.
 *
 * Pure Canvas 2D (works in browsers and in Node/skia-canvas for previews and tests). Nothing is
 * loaded from the network, so captured canvases stay origin-clean.
 */
import type { Accessory } from '../../game/types';
import type { CoatId, ExtraId } from '../appearance.ts';
import { pixelEllipse, rect, type CanvasFactory, type CanvasLike } from '../render/canvasTypes.ts';
import { CatSpriteCache, SPRITE_ANCHOR, type CatPose, type SpriteKey } from '../render/catSprites.ts';
import type { EarState, EyeState, PawState } from '../render/emoteAnim.ts';
import type { Facing } from '../world/movement.ts';
import { DECOR, LIGHT_PIECES, ROOM_H, ROOM_W, WALL_ROWS, decorDef, footprint, type DecorId, type HomeState, type Placed } from './decor.ts';

/** The doormat tile (kept clear while decorating; see ENTRY_TILES in homeWalk.ts). */
export const ENTRY_TILE = { x: 0, y: 4 } as const;
export const T = 24; // pixels per room tile
export const SIDE = 22; // left side-wall strip (holds the door)
export const ROOM_PX_W = SIDE + ROOM_W * T;
export const ROOM_PX_H = ROOM_H * T + 6;

type Wallpaper = HomeState['wallpaper'];
const WALLS: Record<Wallpaper, { wall: string; pattern: string; panel: string; trim: string; floor: string; floorDark: string; floorLight: string }> = {
  plum: { wall: '#4b3a78', pattern: '#57448a', panel: '#3e3066', trim: '#2c2246', floor: '#8a5a3b', floorDark: '#6f4529', floorLight: '#a06b47' },
  cream: { wall: '#e9dccf', pattern: '#f4eadf', panel: '#d8c6b3', trim: '#b5835a', floor: '#a8754f', floorDark: '#8a5a3b', floorLight: '#bf8b62' },
  mint: { wall: '#2f6f73', pattern: '#3a7f83', panel: '#255a5d', trim: '#1f4a4d', floor: '#9b6b43', floorDark: '#7a512f', floorLight: '#b07d53' },
  night: { wall: '#1f1940', pattern: '#2a2352', panel: '#191433', trim: '#120e26', floor: '#6b4329', floorDark: '#55341f', floorLight: '#7d5132' },
};

const OUT = '#2a1d2f'; // shared furniture outline
const SHADOW = 'rgba(20,12,30,0.32)';

export interface Px { x: number; y: number; w: number; h: number }
export const tilePx = (x: number, y: number) => ({ x: SIDE + x * T, y: y * T });
export function footprintPx(p: Pick<Placed, 'item' | 'x' | 'y' | 'rot'>): Px {
  const f = footprint(p);
  const o = tilePx(f.x, f.y);
  return { x: o.x, y: o.y, w: f.w * T, h: f.h * T };
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, light?: string, dark?: string) {
  rect(ctx, x - 1, y - 1, w + 2, h + 2, OUT);
  rect(ctx, x, y, w, h, fill);
  if (light) rect(ctx, x, y, w, 1, light);
  if (dark) rect(ctx, x, y + h - 1, w, 1, dark);
}
function shade(c: string, k: number): string {
  // k<0 darker, k>0 lighter (simple sRGB mix)
  const n = parseInt(c.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = k < 0 ? 0 : 255;
  const a = Math.abs(k);
  const m = (v: number) => Math.round(v + (t - v) * a).toString(16).padStart(2, '0');
  return `#${m(r)}${m(g)}${m(b)}`;
}
function contact(ctx: CanvasRenderingContext2D, p: Px, inset = 2) {
  rect(ctx, p.x + inset, p.y + p.h - 3, p.w - inset * 2, 4, SHADOW);
}
function legs(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string, h = 4) {
  rect(ctx, x + 2, y, 2, h, color); rect(ctx, x + w - 4, y, 2, h, color);
}

// ---------------------------------------------------------------------------------------------
// Room shell
// ---------------------------------------------------------------------------------------------

function drawShell(ctx: CanvasRenderingContext2D, wp: Wallpaper) {
  const c = WALLS[wp];
  const wallH = WALL_ROWS * T;
  // floorboards: staggered planks with grain
  rect(ctx, 0, wallH, ROOM_PX_W, ROOM_PX_H - wallH, c.floor);
  for (let row = 0; row * 8 < ROOM_PX_H - wallH; row++) {
    const y = wallH + row * 8;
    rect(ctx, 0, y, ROOM_PX_W, 1, c.floorDark);
    rect(ctx, 0, y + 1, ROOM_PX_W, 1, c.floorLight);
    const off = (row * 29) % 48;
    for (let x = -off; x < ROOM_PX_W; x += 48) rect(ctx, x, y + 1, 1, 7, c.floorDark);
    for (let x = 6 - off; x < ROOM_PX_W; x += 17) rect(ctx, x + ((row * 7) % 11), y + 4, 4, 1, shade(c.floor, -0.08));
  }
  // back wall: pattern, wainscot, chair rail, crown moulding
  rect(ctx, SIDE, 0, ROOM_W * T, wallH, c.wall);
  for (let y = 4; y < wallH - 16; y += 8) for (let x = SIDE + ((y / 8) % 2) * 6; x < ROOM_PX_W; x += 12) { rect(ctx, x + 2, y, 1, 1, c.pattern); rect(ctx, x + 1, y + 1, 3, 1, c.pattern); rect(ctx, x + 2, y + 2, 1, 1, c.pattern); }
  rect(ctx, SIDE, wallH - 15, ROOM_W * T, 15, c.panel);
  for (let x = SIDE + 4; x < ROOM_PX_W - 8; x += 24) { rect(ctx, x, wallH - 12, 18, 1, shade(c.panel, 0.12)); rect(ctx, x, wallH - 12, 1, 8, shade(c.panel, 0.12)); rect(ctx, x, wallH - 4, 18, 1, shade(c.panel, -0.2)); rect(ctx, x + 17, wallH - 12, 1, 9, shade(c.panel, -0.2)); }
  rect(ctx, SIDE, wallH - 16, ROOM_W * T, 2, c.trim);
  rect(ctx, SIDE, 0, ROOM_W * T, 3, c.trim);
  rect(ctx, SIDE, 3, ROOM_W * T, 1, shade(c.trim, 0.25));
  // baseboard + floor ambient occlusion
  rect(ctx, SIDE, wallH - 3, ROOM_W * T, 3, shade(c.trim, 0.15));
  rect(ctx, SIDE, wallH, ROOM_W * T, 3, 'rgba(20,12,30,0.28)');
  rect(ctx, SIDE, wallH + 3, ROOM_W * T, 2, 'rgba(20,12,30,0.12)');
  // left side wall (receding) with a real door
  for (let y = 0; y < ROOM_PX_H; y++) {
    const w = Math.round(SIDE * Math.min(1, y / wallH + 0.15));
    rect(ctx, 0, y, w, 1, y < wallH ? shade(c.wall, -0.25) : shade(c.panel, -0.15));
  }
  rect(ctx, SIDE - 1, 0, 1, ROOM_PX_H, shade(c.trim, -0.1));
  const dy = wallH + Math.round(T * 1.1);
  // door: a recessed frame with a panelled door, brass knob and a warm gap of light
  rect(ctx, 3, dy - 3, SIDE - 5, 50, '#3a2416');
  for (let i = 0; i < 46; i++) rect(ctx, 5, dy - 1 + i, SIDE - 9, 1, '#8a5a3b');
  rect(ctx, 6, dy + 3, SIDE - 11, 16, '#9b6b43'); rect(ctx, 6, dy + 23, SIDE - 11, 17, '#9b6b43');
  rect(ctx, 6, dy + 3, SIDE - 11, 1, '#b5835a'); rect(ctx, 6, dy + 23, SIDE - 11, 1, '#b5835a');
  rect(ctx, SIDE - 7, dy + 20, 2, 3, '#ffd27a');
  rect(ctx, SIDE - 4, dy - 1, 1, 46, 'rgba(255,210,122,0.5)');
  // doormat
  rect(ctx, SIDE, dy + 30, 12, 16, '#8d4b3b'); rect(ctx, SIDE + 1, dy + 31, 10, 14, '#b5634e');
  for (let y = dy + 33; y < dy + 44; y += 3) rect(ctx, SIDE + 2, y, 8, 1, '#8d4b3b');
  // front lip
  rect(ctx, 0, ROOM_PX_H - 6, ROOM_PX_W, 6, shade(c.floorDark, -0.2));
}

// ---------------------------------------------------------------------------------------------
// Furniture (one illustrated function per piece)
// ---------------------------------------------------------------------------------------------

type Draw = (ctx: CanvasRenderingContext2D, p: Px, rot: 0 | 90, color: string, open: boolean, now: Date) => void;

const tall = (p: Px, rise: number) => ({ top: p.y - rise, bottom: p.y + p.h });

const DRAW: Partial<Record<DecorId, Draw>> = {
  sofa(ctx, p, rot, c) {
    contact(ctx, p);
    const dark = shade(c, -0.25), light = shade(c, 0.2);
    if (rot === 90) {
      box(ctx, p.x + 2, p.y - 6, 8, p.h, dark, light); // backrest along the left
      box(ctx, p.x + 8, p.y - 2, p.w - 10, p.h - 4, c, light, dark);
      for (let i = 1; i < 3; i++) rect(ctx, p.x + 9, p.y - 2 + (i * (p.h - 4)) / 3, p.w - 12, 1, dark);
      box(ctx, p.x + 4, p.y - 8, p.w - 6, 6, dark, light); box(ctx, p.x + 4, p.y + p.h - 6, p.w - 6, 6, dark, light);
      return;
    }
    const { top } = tall(p, 12);
    box(ctx, p.x + 3, top, p.w - 6, 14, dark, light); // backrest
    box(ctx, p.x + 1, top + 6, 6, p.h + 6, dark, light); box(ctx, p.x + p.w - 7, top + 6, 6, p.h + 6, dark, light); // arms
    const cw = (p.w - 14) / 3;
    for (let i = 0; i < 3; i++) box(ctx, Math.round(p.x + 7 + i * cw), top + 12, Math.round(cw) - 1, p.h - 2, c, light, dark);
    rect(ctx, p.x + 12, top + 3, 8, 6, '#FFC94A'); rect(ctx, p.x + 12, top + 3, 8, 1, '#FFE08A'); // throw pillow
    legs(ctx, p.x + 1, p.y + p.h + 3, p.w - 2, '#3a2416', 2);
  },
  armchair(ctx, p, _r, c) {
    contact(ctx, p);
    const dark = shade(c, -0.25), light = shade(c, 0.2);
    box(ctx, p.x + 3, p.y - 12, p.w - 6, 14, dark, light);
    box(ctx, p.x + 1, p.y - 5, 5, p.h + 3, dark, light); box(ctx, p.x + p.w - 6, p.y - 5, 5, p.h + 3, dark, light);
    box(ctx, p.x + 6, p.y, p.w - 12, p.h - 4, c, light, dark);
    legs(ctx, p.x + 1, p.y + p.h - 2, p.w - 2, '#3a2416', 3);
  },
  bed(ctx, p, rot, c) {
    contact(ctx, p);
    const wood = '#7a512f';
    if (rot === 90) {
      box(ctx, p.x - 2, p.y + 2, 8, p.h - 4, wood, '#9b6b43');
      box(ctx, p.x + 4, p.y + 2, p.w - 6, p.h - 4, '#fff3e6', '#ffffff');
      box(ctx, p.x + 6, p.y + 6, 12, p.h - 12, '#ffffff');
      box(ctx, p.x + 20, p.y + 2, p.w - 22, p.h - 4, c, shade(c, 0.2), shade(c, -0.25));
      return;
    }
    box(ctx, p.x + 1, p.y - 12, p.w - 2, 16, wood, '#9b6b43'); // headboard
    rect(ctx, p.x + 6, p.y - 8, p.w - 12, 6, shade(wood, 0.15));
    box(ctx, p.x + 2, p.y + 2, p.w - 4, p.h - 6, '#fff3e6', '#ffffff'); // mattress
    box(ctx, p.x + 5, p.y + 4, p.w / 2 - 7, 9, '#ffffff', undefined, '#e9dccf'); box(ctx, p.x + p.w / 2 + 2, p.y + 4, p.w / 2 - 7, 9, '#ffffff', undefined, '#e9dccf'); // pillows
    box(ctx, p.x + 2, p.y + 16, p.w - 4, p.h - 20, c, shade(c, 0.25), shade(c, -0.25)); // blanket
    for (let x = p.x + 6; x < p.x + p.w - 4; x += 8) rect(ctx, x, p.y + 20, 3, 3, shade(c, 0.3));
    rect(ctx, p.x + 2, p.y + 16, p.w - 4, 2, shade(c, 0.35));
    legs(ctx, p.x + 1, p.y + p.h - 4, p.w - 2, wood, 4);
  },
  table(ctx, p, rot) {
    contact(ctx, p, 4);
    const top = '#a8754f';
    box(ctx, p.x + 2, p.y + 2, p.w - 4, p.h - 10, top, '#c8935a', '#7a512f');
    for (let x = p.x + 6; x < p.x + p.w - 6; x += 9) rect(ctx, x, p.y + 6, 5, 1, '#9b6b43');
    rect(ctx, p.x + 3, p.y + p.h - 8, p.w - 6, 3, '#7a512f');
    legs(ctx, p.x + 2, p.y + p.h - 5, p.w - 4, '#5a3a22', 5);
    if (rot === 0) { box(ctx, p.x + p.w / 2 - 3, p.y - 1, 6, 6, '#fff3e6'); rect(ctx, p.x + p.w / 2 + 3, p.y + 1, 2, 2, '#fff3e6'); rect(ctx, p.x + p.w / 2 - 2, p.y, 4, 1, '#7a512f'); }
  },
  'side-table'(ctx, p) {
    contact(ctx, p, 5);
    pixelEllipse(ctx, p.x + 12, p.y + 6, 10, 5, OUT); pixelEllipse(ctx, p.x + 12, p.y + 5, 9, 4, '#a8754f'); pixelEllipse(ctx, p.x + 11, p.y + 4, 6, 2, '#c8935a');
    rect(ctx, p.x + 11, p.y + 9, 3, 12, '#5a3a22'); rect(ctx, p.x + 7, p.y + 20, 11, 2, '#5a3a22');
    box(ctx, p.x + 9, p.y - 2, 4, 5, '#fff3e6'); rect(ctx, p.x + 10, p.y - 4, 2, 2, '#ffc94a'); // candle
  },
  plant(ctx, p) {
    contact(ctx, p, 5);
    box(ctx, p.x + 6, p.y + 8, 12, 12, '#b5634e', '#d9826a', '#8d4b3b'); rect(ctx, p.x + 5, p.y + 7, 14, 3, '#c9735c');
    for (const [dx, dy, rx, ry, col] of [[12, 2, 8, 6, '#3e7d41'], [7, -2, 5, 5, '#4f9a67'], [17, -3, 5, 5, '#4f9a67'], [12, -8, 5, 6, '#58a054'], [12, -2, 3, 3, '#7edb8c']] as const) {
      pixelEllipse(ctx, p.x + dx, p.y + dy, rx, ry, col);
    }
  },
  lamp(ctx, p) {
    contact(ctx, p, 7);
    rect(ctx, p.x + 7, p.y + 18, 10, 3, '#2b2236');
    rect(ctx, p.x + 11, p.y - 8, 2, 27, '#43375a');
    for (let i = 0; i < 9; i++) rect(ctx, p.x + 6 - Math.floor(i / 2), p.y - 18 + i, 12 + Math.floor(i / 2) * 2, 1, i === 0 ? '#e9b94a' : '#ffd27a');
    rect(ctx, p.x + 3, p.y - 10, 18, 1, '#c99a3a');
  },
  'table-lamp'(ctx, p) {
    contact(ctx, p, 5);
    box(ctx, p.x + 4, p.y + 6, 16, 10, '#a8754f', '#c8935a'); legs(ctx, p.x + 4, p.y + 16, 16, '#5a3a22', 5);
    rect(ctx, p.x + 11, p.y - 2, 2, 8, '#43375a');
    for (let i = 0; i < 6; i++) rect(ctx, p.x + 8 - Math.floor(i / 2), p.y - 8 + i, 8 + Math.floor(i / 2) * 2, 1, '#ffc94a');
  },
  bookshelf(ctx, p, rot) {
    contact(ctx, p);
    const rise = rot === 90 ? 14 : 34;
    const top = p.y - rise;
    const h = p.h + rise - 2;
    box(ctx, p.x + 1, top, p.w - 2, h, '#7a512f', '#9b6b43', '#5a3a22');
    const shelves = Math.max(2, Math.floor(h / 13));
    const colors = ['#e0475c', '#6b4fbf', '#ffc94a', '#4f9a67', '#7fb2e6', '#ff8a35', '#fff3e6'];
    for (let s = 0; s < shelves; s++) {
      const sy = top + 3 + s * 13;
      rect(ctx, p.x + 3, sy, p.w - 6, 10, '#3a2416');
      for (let x = p.x + 4, i = s * 3; x < p.x + p.w - 6; i++) { const bw = 2 + (i % 3); rect(ctx, x, sy + 2 + (i % 2), bw, 8 - (i % 2), colors[i % colors.length]); x += bw + 1; }
      rect(ctx, p.x + 3, sy + 10, p.w - 6, 2, '#9b6b43');
    }
  },
  wardrobe(ctx, p, _rot, c, open) {
    contact(ctx, p);
    const top = p.y - 40;
    box(ctx, p.x + 1, top, p.w - 2, p.h + 38, c, shade(c, 0.2), shade(c, -0.3));
    rect(ctx, p.x, top - 3, p.w, 4, shade(c, -0.25));
    if (open) {
      rect(ctx, p.x + 4, top + 4, p.w - 8, p.h + 28, '#3a2416');
      rect(ctx, p.x + 6, top + 8, p.w - 12, 1, '#c9bfe8');
      for (const [i, col] of ['#e0475c', '#6b4fbf', '#ffc94a', '#7ee0d2'].entries()) box(ctx, p.x + 8 + i * 9, top + 9, 6, 16, col);
      box(ctx, p.x - 6, top + 4, 8, p.h + 28, shade(c, 0.1)); box(ctx, p.x + p.w - 2, top + 4, 8, p.h + 28, shade(c, 0.1));
    } else {
      rect(ctx, p.x + p.w / 2, top + 2, 1, p.h + 34, shade(c, -0.35));
      for (const dx of [5, p.w / 2 + 4]) box(ctx, p.x + dx, top + 6, p.w / 2 - 9, 26, shade(c, 0.08), shade(c, 0.22));
      rect(ctx, p.x + p.w / 2 - 3, top + 22, 2, 3, '#ffc94a'); rect(ctx, p.x + p.w / 2 + 2, top + 22, 2, 3, '#ffc94a');
    }
    legs(ctx, p.x + 1, p.y + p.h - 2, p.w - 2, '#3a2416', 3);
  },
  desk(ctx, p) {
    contact(ctx, p);
    box(ctx, p.x + 1, p.y - 8, p.w - 2, 10, '#b5835a', '#d4a679', '#8a5a3b');
    rect(ctx, p.x + 2, p.y + 2, 3, p.h - 6, '#7a512f'); box(ctx, p.x + p.w - 16, p.y + 2, 14, p.h - 6, '#9b6b43', '#b5835a');
    rect(ctx, p.x + p.w - 11, p.y + 7, 5, 1, '#ffc94a');
    box(ctx, p.x + 6, p.y - 12, 10, 6, '#fff3e6'); rect(ctx, p.x + 7, p.y - 10, 7, 1, '#b9aec6'); // papers
    rect(ctx, p.x + 22, p.y - 18, 2, 10, '#43375a'); rect(ctx, p.x + 18, p.y - 20, 8, 3, '#ffc94a'); // lamp
    // chair in front
    box(ctx, p.x + 8, p.y + 10, 12, 5, '#e0475c', '#ff8fa3'); rect(ctx, p.x + 9, p.y + 15, 2, 6, '#3a2416'); rect(ctx, p.x + 17, p.y + 15, 2, 6, '#3a2416');
  },
  'cat-tower'(ctx, p) {
    contact(ctx, p);
    box(ctx, p.x + 1, p.y + p.h - 10, p.w - 2, 8, '#c9bfe8', '#e6dcff', '#a89bc9'); // base
    for (const [x, y0, y1] of [[p.x + 5, p.y - 10, p.y + p.h - 10], [p.x + 15, p.y - 26, p.y + 14]] as const) {
      rect(ctx, x - 1, y0, 5, y1 - y0, OUT); rect(ctx, x, y0, 3, y1 - y0, '#d9b08c');
      for (let y = y0 + 1; y < y1; y += 3) rect(ctx, x, y, 3, 1, '#b98a64');
    }
    box(ctx, p.x + 1, p.y + 8, p.w - 2, 5, '#c9bfe8', '#e6dcff'); // middle platform
    box(ctx, p.x, p.y - 12, p.w, 6, '#c9bfe8', '#e6dcff'); // upper platform
    pixelEllipse(ctx, p.x + 12, p.y - 28, 11, 5, OUT); pixelEllipse(ctx, p.x + 12, p.y - 29, 10, 4, '#a89bc9'); pixelEllipse(ctx, p.x + 12, p.y - 29, 7, 2, '#e6dcff'); // top bed
    rect(ctx, p.x + 2, p.y - 6, 1, 8, '#fff3e6'); pixelEllipse(ctx, p.x + 2, p.y + 3, 2, 2, '#ff6fa1'); // dangling toy
  },
  'cat-bed'(ctx, p, _r, c) {
    contact(ctx, p, 2);
    pixelEllipse(ctx, p.x + 12, p.y + 13, 12, 8, OUT); pixelEllipse(ctx, p.x + 12, p.y + 12, 11, 7, c); pixelEllipse(ctx, p.x + 12, p.y + 13, 7, 4, '#fff3e6'); pixelEllipse(ctx, p.x + 11, p.y + 9, 7, 1, shade(c, 0.3));
  },
  'scratch-board'(ctx, p) {
    contact(ctx, p, 5);
    box(ctx, p.x + 3, p.y + 14, p.w - 6, 6, '#c9bfe8', '#e6dcff');
    rect(ctx, p.x + 8, p.y - 14, 8, 29, OUT); rect(ctx, p.x + 9, p.y - 13, 6, 27, '#d9b08c');
    for (let y = p.y - 12; y < p.y + 14; y += 2) rect(ctx, p.x + 9, y, 6, 1, '#b98a64');
    box(ctx, p.x + 5, p.y - 18, 14, 4, '#c9bfe8', '#e6dcff');
    rect(ctx, p.x + 18, p.y - 14, 1, 7, '#fff3e6'); pixelEllipse(ctx, p.x + 18, p.y - 6, 2, 2, '#ffc94a');
  },
  'toy-basket'(ctx, p) {
    contact(ctx, p, 3);
    pixelEllipse(ctx, p.x + 8, p.y + 4, 4, 4, '#ff6fa1'); pixelEllipse(ctx, p.x + 15, p.y + 3, 4, 4, '#7fb2e6'); rect(ctx, p.x + 11, p.y - 1, 2, 4, '#9b6b43');
    box(ctx, p.x + 3, p.y + 6, p.w - 6, 14, '#c8935a', '#e0b07a', '#8a5a3b');
    for (let x = p.x + 4; x < p.x + p.w - 4; x += 3) rect(ctx, x, p.y + 7, 1, 12, '#a8754f');
    rect(ctx, p.x + 4, p.y + 12, p.w - 8, 1, '#a8754f');
  },
  'food-bowls'(ctx, p) {
    contact(ctx, p, 2);
    pixelEllipse(ctx, p.x + 7, p.y + 15, 6, 4, OUT); pixelEllipse(ctx, p.x + 7, p.y + 14, 5, 3, '#e0475c'); pixelEllipse(ctx, p.x + 7, p.y + 13, 3, 1, '#9b6b43');
    pixelEllipse(ctx, p.x + 17, p.y + 15, 6, 4, OUT); pixelEllipse(ctx, p.x + 17, p.y + 14, 5, 3, '#7fb2e6'); pixelEllipse(ctx, p.x + 17, p.y + 13, 3, 1, '#bfe1ff');
    rect(ctx, p.x + 3, p.y + 19, 18, 3, '#ffc94a');
  },
  'cardboard-box'(ctx, p, _r, c) {
    contact(ctx, p, 2);
    box(ctx, p.x + 2, p.y + 4, p.w - 4, p.h - 6, c, shade(c, 0.15), shade(c, -0.25));
    rect(ctx, p.x + 3, p.y + 5, p.w - 6, 5, shade(c, -0.35)); // dark inside
    rect(ctx, p.x, p.y + 1, 6, 4, shade(c, 0.12)); rect(ctx, p.x + p.w - 6, p.y + 1, 6, 4, shade(c, 0.12)); // flaps
    rect(ctx, p.x + 8, p.y + 13, 8, 1, '#e0475c');
  },
  'cat-tunnel'(ctx, p, rot, c) {
    contact(ctx, p);
    const horiz = rot === 0;
    const w = horiz ? p.w - 4 : p.w - 6;
    const h = horiz ? p.h - 8 : p.h - 4;
    box(ctx, p.x + 2, p.y + 4, w, h, c, shade(c, 0.25), shade(c, -0.3));
    if (horiz) for (let x = p.x + 6; x < p.x + p.w - 4; x += 5) rect(ctx, x, p.y + 4, 1, h, shade(c, -0.2));
    else for (let y = p.y + 8; y < p.y + p.h - 4; y += 5) rect(ctx, p.x + 2, y, w, 1, shade(c, -0.2));
    pixelEllipse(ctx, horiz ? p.x + 4 : p.x + p.w / 2 - 1, horiz ? p.y + 4 + h / 2 : p.y + p.h - 5, horiz ? 3 : 7, horiz ? 6 : 3, '#1b1530');
  },
  'rug-round'(ctx, p, rot, c) {
    const rx = p.w / 2 - 2, ry = p.h / 2 - 2;
    pixelEllipse(ctx, p.x + p.w / 2, p.y + p.h / 2, rx + 1, ry + 1, shade(c, -0.3));
    pixelEllipse(ctx, p.x + p.w / 2, p.y + p.h / 2, rx, ry, c);
    pixelEllipse(ctx, p.x + p.w / 2, p.y + p.h / 2, rx - 5, ry - 4, shade(c, 0.25));
    pixelEllipse(ctx, p.x + p.w / 2, p.y + p.h / 2, rx - 10, ry - 8, c);
    for (let a = 0; a < 16; a++) rect(ctx, p.x + p.w / 2 + Math.cos(a / 16 * Math.PI * 2) * (rx - 2.5), p.y + p.h / 2 + Math.sin(a / 16 * Math.PI * 2) * (ry - 2), 1, 1, '#fff3e6');
    void rot;
  },
  'rug-long'(ctx, p, rot, c) {
    const horiz = rot === 0;
    box(ctx, p.x + 2, p.y + 3, p.w - 4, p.h - 6, c, shade(c, 0.2), shade(c, -0.25));
    if (horiz) { for (let x = p.x + 6; x < p.x + p.w - 6; x += 6) rect(ctx, x, p.y + p.h / 2 - 1, 3, 2, '#fff3e6'); for (let y = p.y + 4; y < p.y + p.h - 3; y += 2) { rect(ctx, p.x, y, 2, 1, '#fff3e6'); rect(ctx, p.x + p.w - 2, y, 2, 1, '#fff3e6'); } }
    else { for (let y = p.y + 6; y < p.y + p.h - 6; y += 6) rect(ctx, p.x + p.w / 2 - 1, y, 2, 3, '#fff3e6'); for (let x = p.x + 3; x < p.x + p.w - 3; x += 2) { rect(ctx, x, p.y + 1, 1, 2, '#fff3e6'); rect(ctx, x, p.y + p.h - 3, 1, 2, '#fff3e6'); } }
  },
  window(ctx, p) {
    box(ctx, p.x + 2, p.y + 2, p.w - 4, p.h - 4, '#5a3a22');
    const g = ctx.createLinearGradient(0, p.y + 3, 0, p.y + p.h - 3);
    g.addColorStop(0, '#9cc3ff'); g.addColorStop(1, '#dfeeff');
    ctx.fillStyle = g; ctx.fillRect(p.x + 4, p.y + 4, p.w - 8, p.h - 8);
    rect(ctx, p.x + 7, p.y + 6, 6, 2, '#ffffff'); rect(ctx, p.x + 9, p.y + 5, 3, 1, '#ffffff'); // cloud
    rect(ctx, p.x + p.w / 2 - 1, p.y + 3, 2, p.h - 6, '#5a3a22'); rect(ctx, p.x + 3, p.y + p.h / 2, p.w - 6, 1, '#5a3a22');
    rect(ctx, p.x + 5, p.y + 5, 1, p.h - 12, 'rgba(255,255,255,0.6)');
    box(ctx, p.x, p.y + p.h - 3, p.w, 3, '#9b6b43', '#c8935a'); // sill
  },
  curtains(ctx, p, _r, c) {
    rect(ctx, p.x - 2, p.y + 1, p.w + 4, 2, '#3a2416'); pixelEllipse(ctx, p.x - 2, p.y + 2, 2, 2, '#ffc94a'); pixelEllipse(ctx, p.x + p.w + 2, p.y + 2, 2, 2, '#ffc94a');
    for (const [x0, dir] of [[p.x - 1, 1], [p.x + p.w - 9, -1]] as const) {
      for (let i = 0; i < 10; i++) rect(ctx, x0 + i, p.y + 3, 1, p.h + 2 - (dir === 1 ? i / 3 : (9 - i) / 3), i % 3 === 0 ? shade(c, -0.25) : i % 3 === 1 ? c : shade(c, 0.2));
      rect(ctx, x0, p.y + p.h - 4, 10, 2, '#ffc94a'); // tie-back
    }
  },
  painting(ctx, p) {
    box(ctx, p.x + 3, p.y + 3, p.w - 6, p.h - 6, '#ffc94a', '#ffe08a', '#c99a3a');
    rect(ctx, p.x + 5, p.y + 5, p.w - 10, p.h - 10, '#7fb2e6');
    rect(ctx, p.x + 5, p.y + p.h - 9, p.w - 10, 4, '#58a054');
    pixelEllipse(ctx, p.x + p.w / 2, p.y + p.h - 9, 6, 2, '#b7aac8'); rect(ctx, p.x + p.w / 2 - 1, p.y + 9, 2, 5, '#bfe1ff');
  },
  'photo-frame'(ctx, p) {
    box(ctx, p.x + 2, p.y + 4, 11, 13, '#fff3e6'); rect(ctx, p.x + 3, p.y + 5, 9, 8, '#ff8a35'); pixelEllipse(ctx, p.x + 7, p.y + 10, 3, 2, '#fff3e6');
    box(ctx, p.x + 13, p.y + 7, 9, 11, '#ffc94a'); rect(ctx, p.x + 14, p.y + 8, 7, 7, '#252031'); pixelEllipse(ctx, p.x + 17, p.y + 12, 2, 2, '#A89BC9');
    rect(ctx, p.x + 7, p.y + 1, 1, 3, '#3a2416');
  },
  clock(ctx, p, _r, _c, _o, now) {
    pixelEllipse(ctx, p.x + 12, p.y + 12, 9, 9, OUT); pixelEllipse(ctx, p.x + 12, p.y + 12, 8, 8, '#fff3e6');
    rect(ctx, p.x + 6, p.y + 4, 3, 3, OUT); rect(ctx, p.x + 15, p.y + 4, 3, 3, OUT); rect(ctx, p.x + 7, p.y + 5, 1, 1, '#ffb3a7'); rect(ctx, p.x + 16, p.y + 5, 1, 1, '#ffb3a7');
    const hr = ((now.getHours() % 12) + now.getMinutes() / 60) / 12 * Math.PI * 2;
    const mn = now.getMinutes() / 60 * Math.PI * 2;
    for (let i = 0; i < 4; i++) rect(ctx, p.x + 12 + Math.round(Math.sin(hr) * i), p.y + 12 - Math.round(Math.cos(hr) * i), 1, 1, OUT);
    for (let i = 0; i < 6; i++) rect(ctx, p.x + 12 + Math.round(Math.sin(mn) * i), p.y + 12 - Math.round(Math.cos(mn) * i), 1, 1, '#e0475c');
  },
  shelf(ctx, p) {
    box(ctx, p.x + 1, p.y + p.h - 8, p.w - 2, 3, '#b5835a', '#d4a679');
    rect(ctx, p.x + 4, p.y + p.h - 5, 2, 4, '#7a512f'); rect(ctx, p.x + p.w - 6, p.y + p.h - 5, 2, 4, '#7a512f');
    box(ctx, p.x + 4, p.y + p.h - 16, 6, 8, '#b5634e'); pixelEllipse(ctx, p.x + 7, p.y + p.h - 18, 4, 3, '#58a054');
    for (const [i, col] of ['#6b4fbf', '#e0475c', '#ffc94a'].entries()) rect(ctx, p.x + 16 + i * 4, p.y + p.h - 18, 3, 10, col);
    pixelEllipse(ctx, p.x + 36, p.y + p.h - 11, 3, 3, '#7fb2e6');
  },
  'window-perch'(ctx, p, _r, c) {
    const y = p.y + p.h - 6;
    box(ctx, p.x + 2, y, p.w - 4, 4, '#b5835a', '#d4a679');
    box(ctx, p.x + 4, y - 3, p.w - 8, 3, c, shade(c, 0.25));
    rect(ctx, p.x + 6, y + 4, 2, 4, '#7a512f'); rect(ctx, p.x + p.w - 8, y + 4, 2, 4, '#7a512f');
  },
  'climb-shelves'(ctx, p) {
    for (const [dx, dy] of [[2, 14], [16, 6], [30, 14]]) { box(ctx, p.x + dx, p.y + dy, 14, 3, '#b5835a', '#d4a679'); rect(ctx, p.x + dx + 6, p.y + dy + 3, 2, 3, '#7a512f'); }
  },
  books(ctx, p) {
    contact(ctx, p, 5);
    for (const [i, col] of ['#6b4fbf', '#e0475c', '#4f9a67', '#ffc94a'].entries()) box(ctx, p.x + 4 + (i % 2), p.y + 14 - i * 4, 16 - (i % 2) * 2, 3, col, shade(col, 0.25));
  },
  'fish-tank'(ctx, p, _r, _c, _o, now) {
    contact(ctx, p);
    box(ctx, p.x + 2, p.y + p.h - 6, p.w - 4, 6, '#7a512f', '#9b6b43');
    box(ctx, p.x + 3, p.y - 10, p.w - 6, p.h + 4, '#2f4870');
    rect(ctx, p.x + 4, p.y - 6, p.w - 8, p.h - 1, '#5d93c9'); rect(ctx, p.x + 4, p.y - 9, p.w - 8, 3, '#bfe1ff');
    const fx = p.x + 8 + ((now.getSeconds() * 3) % (p.w - 18));
    rect(ctx, fx, p.y + 2, 4, 2, '#ff8a35'); rect(ctx, fx + 4, p.y + 1, 1, 4, '#ff8a35');
    rect(ctx, p.x + 6, p.y + p.h - 9, p.w - 12, 2, '#e3c690'); rect(ctx, p.x + 10, p.y + p.h - 14, 1, 5, '#4f9a67');
  },
  vase(ctx, p) {
    contact(ctx, p, 6);
    box(ctx, p.x + 8, p.y + 6, 8, 14, '#ff6fa1', '#ff9dbe', '#c93d74');
    for (const [dx, dy, col] of [[9, 2, '#ffc94a'], [14, 0, '#fff3e6'], [12, -3, '#ff8a35'], [7, -1, '#ff6fa1']] as const) { rect(ctx, p.x + dx, p.y + dy + 3, 1, 4, '#4f9a67'); pixelEllipse(ctx, p.x + dx, p.y + dy + 1, 2, 2, col); }
  },
  'apple-basket'(ctx, p) {
    contact(ctx, p, 3);
    for (const [dx, dy] of [[8, 6], [14, 5], [11, 3]]) pixelEllipse(ctx, p.x + dx, p.y + dy, 3, 3, '#e0475c');
    box(ctx, p.x + 4, p.y + 8, 16, 11, '#c8935a', '#e0b07a', '#8a5a3b');
  },
  'shell-jar'(ctx, p) {
    contact(ctx, p, 6);
    box(ctx, p.x + 6, p.y + 2, 12, 18, 'rgba(191,225,255,0.55)', '#ffffff'); rect(ctx, p.x + 6, p.y, 12, 3, '#b5835a');
    for (const [dx, dy, col] of [[9, 15, '#ffe1ec'], [14, 16, '#ffc94a'], [11, 11, '#fff3e6']] as const) pixelEllipse(ctx, p.x + dx, p.y + dy, 2, 2, col);
  },
  pumpkin(ctx, p) {
    contact(ctx, p, 4);
    pixelEllipse(ctx, p.x + 12, p.y + 13, 9, 7, '#a8470f'); pixelEllipse(ctx, p.x + 12, p.y + 12, 8, 6, '#d9631a'); rect(ctx, p.x + 11, p.y + 4, 2, 3, '#4f9a67');
  },
  'blossom-branch'(ctx, p) {
    rect(ctx, p.x + 4, p.y + 12, 16, 1, '#5a3a22');
    for (const dx of [5, 10, 15, 19]) pixelEllipse(ctx, p.x + dx, p.y + 10 + (dx % 3), 2, 2, '#ffb3c9');
  },
  'sun-lantern'(ctx, p) {
    rect(ctx, p.x + 11, p.y + 1, 2, 5, '#3a2416'); pixelEllipse(ctx, p.x + 12, p.y + 12, 7, 7, '#c99a3a'); pixelEllipse(ctx, p.x + 12, p.y + 12, 5, 5, '#ffd27a');
  },  // ---- Milestone 8: Hearth & Whisker furniture ----
  stove(ctx, p) {
    contact(ctx, p);
    box(ctx, p.x + 3, p.y - 10, p.w - 6, p.h + 8, '#3d5a8a', '#5876a8', '#2a3f66');
    rect(ctx, p.x + 3, p.y - 10, p.w - 6, 3, '#2a2433');
    for (const bx of [p.x + 10, p.x + p.w - 16]) { pixelEllipse(ctx, bx + 3, p.y - 9, 4, 1, '#5a5266'); rect(ctx, bx + 1, p.y - 10, 4, 1, '#e0475c'); }
    box(ctx, p.x + 8, p.y - 3, p.w - 16, 12, '#1b1530'); rect(ctx, p.x + 9, p.y - 2, p.w - 18, 10, '#ff8a35'); rect(ctx, p.x + 9, p.y - 2, p.w - 18, 2, '#ffd27a');
    rect(ctx, p.x + p.w - 10, p.y - 20, 2, 10, '#cfc6e3'); rect(ctx, p.x + p.w - 13, p.y - 21, 8, 2, '#e9dccf');
  },
  'dining-set'(ctx, p) {
    contact(ctx, p);
    for (const cx of [p.x + 4, p.x + p.w - 12]) { box(ctx, cx, p.y - 8, 8, 6, '#7a512f', '#9b6b43'); rect(ctx, cx + 1, p.y - 2, 1, 10, '#5a3a22'); rect(ctx, cx + 6, p.y - 2, 1, 10, '#5a3a22'); }
    box(ctx, p.x + 6, p.y + 2, p.w - 12, 6, '#fff3e6', '#ffffff', '#e0caa4');
    rect(ctx, p.x + 8, p.y + 8, 2, 10, '#5a3a22'); rect(ctx, p.x + p.w - 10, p.y + 8, 2, 10, '#5a3a22');
    pixelEllipse(ctx, p.x + p.w / 2, p.y + 4, 4, 1, '#cfe4ff'); rect(ctx, p.x + p.w / 2 - 6, p.y + 2, 3, 2, '#ff8fb1');
  },
  'tea-cart'(ctx, p) {
    contact(ctx, p, 4);
    box(ctx, p.x + 4, p.y + 2, p.w - 8, 2, '#cfc6e3'); box(ctx, p.x + 4, p.y + 12, p.w - 8, 2, '#cfc6e3');
    rect(ctx, p.x + 4, p.y + 2, 1, 14, '#8a7da0'); rect(ctx, p.x + p.w - 5, p.y + 2, 1, 14, '#8a7da0');
    pixelEllipse(ctx, p.x + 9, p.y + 18, 2, 2, OUT); pixelEllipse(ctx, p.x + p.w - 9, p.y + 18, 2, 2, OUT);
    pixelEllipse(ctx, p.x + 10, p.y - 1, 4, 3, '#ff8fb1'); rect(ctx, p.x + 13, p.y - 2, 3, 1, '#ff8fb1'); rect(ctx, p.x + 15, p.y - 1, 3, 3, '#fff3e6');
    rect(ctx, p.x + 8, p.y + 9, 4, 3, '#c99a6a'); rect(ctx, p.x + 13, p.y + 9, 4, 3, '#e0b88a');
  },
  fireplace(ctx, p, _rot, _c, _open, now) {
    contact(ctx, p);
    box(ctx, p.x + 2, p.y - 18, p.w - 4, p.h + 16, '#9a5340', '#b5683f', '#6b3a2e');
    for (let yy = p.y - 16; yy < p.y + p.h - 2; yy += 4) for (let xx = p.x + 3 + ((yy / 4) % 2 ? 0 : 3); xx < p.x + p.w - 3; xx += 6) rect(ctx, xx, yy, 5, 3, '#a85e48');
    rect(ctx, p.x, p.y - 20, p.w, 3, '#6b4329'); rect(ctx, p.x, p.y - 20, p.w, 1, '#9b6b43');
    box(ctx, p.x + 10, p.y - 8, p.w - 20, 14, '#1b1015');
    const flick = Math.floor(((now?.getTime() ?? 0) / 160) % 3);
    rect(ctx, p.x + 14, p.y - 2 - flick, 4, 6 + flick, '#ff8a35'); rect(ctx, p.x + p.w / 2, p.y - 4 + flick, 4, 8 - flick, '#ffb13d'); rect(ctx, p.x + p.w - 20, p.y - 1, 4, 5, '#ff8a35');
    rect(ctx, p.x + 12, p.y + 4, p.w - 24, 2, '#5a3a22');
    rect(ctx, p.x + 4, p.y - 24, 4, 4, '#ffd27a'); rect(ctx, p.x + p.w - 8, p.y - 25, 3, 5, '#cfc6e3');
  },
  'keepsake-cabinet'(ctx, p) {
    contact(ctx, p);
    box(ctx, p.x + 3, p.y - 20, p.w - 6, p.h + 18, '#5a3f66', '#6b4f7a', '#3a2a3e');
    for (let i = 0; i < 3; i++) {
      const sy = p.y - 16 + i * 10;
      box(ctx, p.x + 6, sy, p.w - 12, 7, '#2a1d2f');
      const items = [['#ffe1ec', '#ffd27a', '#7fb2e6'], ['#ff8a35', '#c9bfe8', '#7edb8c'], ['#fff3e6', '#ff8fb1', '#ffc94a']][i];
      items.forEach((col, k) => rect(ctx, p.x + 9 + k * 12, sy + 2 + (k % 2), 4, 5 - (k % 2), col));
    }
    rect(ctx, p.x + p.w / 2 - 1, p.y - 22, 2, 2, '#ffd27a');
  },
  'herb-planter'(ctx, p) {
    contact(ctx, p, 3);
    box(ctx, p.x + 3, p.y + 6, p.w - 6, 12, '#b5623a', '#d9844f', '#7a3a1e');
    for (let i = 0; i < 6; i++) { rect(ctx, p.x + 5 + i * 3, p.y - 2 + (i % 2) * 3, 2, 9 - (i % 2) * 3, i % 2 ? '#4f9a67' : '#7edb8c'); rect(ctx, p.x + 4 + i * 3, p.y + (i % 2) * 3, 1, 2, '#3e8a45'); }
    rect(ctx, p.x + 8, p.y - 3, 1, 1, '#fff3e6'); rect(ctx, p.x + 16, p.y - 1, 1, 1, '#b9a5ff');
  },
  'record-player'(ctx, p) {
    contact(ctx, p, 3);
    box(ctx, p.x + 3, p.y + 6, p.w - 6, 12, '#7a512f', '#9b6b43', '#5a3a22');
    box(ctx, p.x + 2, p.y, p.w - 4, 6, '#b5323e', '#e0475c');
    pixelEllipse(ctx, p.x + 11, p.y + 3, 6, 2, '#1b1530'); rect(ctx, p.x + 11, p.y + 3, 1, 1, '#ffd27a');
    rect(ctx, p.x + p.w - 6, p.y - 2, 1, 5, '#cfc6e3'); rect(ctx, p.x + p.w - 9, p.y - 2, 3, 1, '#cfc6e3');
    rect(ctx, p.x + 6, p.y - 10, 4, 8, '#c99a3a'); pixelEllipse(ctx, p.x + 8, p.y - 11, 5, 3, '#ffd27a');
  },
  'pastel-bed'(ctx, p) {
    contact(ctx, p);
    box(ctx, p.x + 2, p.y + 4, p.w - 4, p.h - 6, '#c9bfe8', '#e8e2ff', '#a596ba');
    box(ctx, p.x + 4, p.y + 6, p.w - 8, 10, '#fff3e6'); rect(ctx, p.x + 6, p.y + 8, 12, 6, '#ffffff'); rect(ctx, p.x + p.w - 18, p.y + 8, 12, 6, '#ffffff');
    box(ctx, p.x + 4, p.y + 20, p.w - 8, p.h - 26, '#ffb3c9', '#ffd1df', '#e08aa6');
    for (let i = 0; i < 4; i++) rect(ctx, p.x + 8 + i * 9, p.y + 26 + (i % 2) * 6, 2, 2, '#fff3e6');
    rect(ctx, p.x + 2, p.y - 22, 2, 28, '#e8e2ff'); rect(ctx, p.x + p.w - 4, p.y - 22, 2, 28, '#e8e2ff');
    rect(ctx, p.x, p.y - 24, p.w, 4, '#ffb3c9'); for (let i = 0; i < p.w; i += 4) rect(ctx, p.x + i, p.y - 20, 2, 3 + (i % 8 ? 0 : 2), '#ffd1df');
  },
  'pastel-sofa'(ctx, p) {
    contact(ctx, p);
    box(ctx, p.x + 2, p.y - 8, p.w - 4, 12, '#ff8fb1', '#ffb3c9', '#e0708f');
    box(ctx, p.x + 1, p.y + 2, p.w - 2, 10, '#ffa6c1', '#ffd1df', '#e0708f');
    box(ctx, p.x, p.y - 2, 4, 14, '#e0708f'); box(ctx, p.x + p.w - 4, p.y - 2, 4, 14, '#e0708f');
    rect(ctx, p.x + 12, p.y - 5, 8, 6, '#fff3e6'); rect(ctx, p.x + p.w - 20, p.y - 5, 8, 6, '#c9bfe8');
    rect(ctx, p.x + 4, p.y + 12, 2, 4, '#e8e2ff'); rect(ctx, p.x + p.w - 6, p.y + 12, 2, 4, '#e8e2ff');
  },
  'reading-chair'(ctx, p, rot) {
    // Mint wingback reading chair (2×2): tall tufted back with side wings, rolled arms, a seat cushion with
    // cream piping, wooden feet, a knitted throw over one arm and a little book on the other.
    const W = p.w, H = p.h;
    const mint = '#67bfae', mintLt = '#a2e6d7', mintMd = '#4fa596', mintDk = '#367e77', mintDeep = '#235c59';
    contact(ctx, p, 3);
    // wooden feet
    rect(ctx, p.x + 5, p.y + H - 6, 4, 6, '#5a3a22'); rect(ctx, p.x + W - 9, p.y + H - 6, 4, 6, '#5a3a22');
    rect(ctx, p.x + 5, p.y + H - 6, 4, 1, '#8a5a3b'); rect(ctx, p.x + W - 9, p.y + H - 6, 4, 1, '#8a5a3b');
    // tall back with a rounded crown
    box(ctx, p.x + 8, p.y - 18, W - 16, 28, mint, mintLt, mintMd);
    rect(ctx, p.x + 8, p.y - 18, 3, 3, OUT); rect(ctx, p.x + W - 11, p.y - 18, 3, 3, OUT); // trim the corners round
    rect(ctx, p.x + 11, p.y - 17, W - 22, 2, mintLt);
    // button tufting on the back
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const bx = p.x + 15 + c * 8 + (r % 2) * 4, by = p.y - 11 + r * 9;
      rect(ctx, bx, by, 2, 2, mintDeep); rect(ctx, bx - 3, by, 1, 1, mintMd); rect(ctx, bx + 4, by, 1, 1, mintMd);
    }
    // side wings (behind the arms)
    box(ctx, p.x + 2, p.y - 6, 8, 26, mintMd, mint, mintDk);
    box(ctx, p.x + W - 10, p.y - 6, 8, 26, mintMd, mint, mintDk);
    // seat cushion + piping
    box(ctx, p.x + 8, p.y + 14, W - 16, 14, mintLt, '#d6f7ee', mint);
    rect(ctx, p.x + 8, p.y + 26, W - 16, 1, '#f6ecc8'); rect(ctx, p.x + 10, p.y + 17, W - 20, 1, '#f6ecc8');
    // seat front / skirt
    box(ctx, p.x + 4, p.y + 28, W - 8, 11, mint, mintLt, mintDk);
    for (let x = p.x + 7; x < p.x + W - 7; x += 5) rect(ctx, x, p.y + 31, 1, 6, mintMd);
    // rolled arms
    box(ctx, p.x, p.y + 6, 10, 28, mintDk, mintMd, mintDeep);
    box(ctx, p.x + W - 10, p.y + 6, 10, 28, mintDk, mintMd, mintDeep);
    rect(ctx, p.x + 1, p.y + 7, 8, 3, mint); rect(ctx, p.x + W - 9, p.y + 7, 8, 3, mint);
    // knitted throw over the right arm (stripes hang down the front)
    rect(ctx, p.x + W - 10, p.y + 6, 10, 4, '#ffb3c9'); rect(ctx, p.x + W - 10, p.y + 6, 10, 1, '#ffd6e4');
    for (let i = 0; i < 4; i++) rect(ctx, p.x + W - 10, p.y + 10 + i * 4, 10, 3, i % 2 ? '#fff3e6' : '#ffb3c9');
    rect(ctx, p.x + W - 10, p.y + 25, 10, 2, '#e59ab4');
    for (let i = 0; i < 5; i++) rect(ctx, p.x + W - 10 + i * 2, p.y + 27, 1, 3, '#fff3e6'); // fringe
    // a small book resting on the left arm
    box(ctx, p.x + 1, p.y + 3, 8, 4, '#e0475c', '#ff8fa3', '#8a2433'); rect(ctx, p.x + 2, p.y + 4, 6, 1, '#fff3e6');
    if (rot === 90) rect(ctx, p.x + W / 2 - 1, p.y + 1, 2, 2, mintDeep); // (the chair is symmetric; rotation only moves its footprint)
  },
  'cottage-chair'(ctx, p) {
    contact(ctx, p, 3);
    box(ctx, p.x + 4, p.y - 8, p.w - 8, 12, '#4f9a67', '#7edb8c', '#3e7a52');
    box(ctx, p.x + 3, p.y + 3, p.w - 6, 8, '#5fae74', '#8fe0a0', '#3e7a52');
    box(ctx, p.x + 2, p.y - 2, 3, 12, '#3e7a52'); box(ctx, p.x + p.w - 5, p.y - 2, 3, 12, '#3e7a52');
    rect(ctx, p.x + 8, p.y + 4, 8, 4, '#fff3e6'); rect(ctx, p.x + 10, p.y + 5, 1, 1, '#ff8fb1'); rect(ctx, p.x + 13, p.y + 6, 1, 1, '#ffd36b');
  },
  'rustic-dresser'(ctx, p) {
    contact(ctx, p);
    box(ctx, p.x + 3, p.y - 12, p.w - 6, p.h + 10, '#8a5a3b', '#a8754f', '#5a3a22');
    for (let i = 0; i < 3; i++) { box(ctx, p.x + 6, p.y - 9 + i * 8, p.w - 12, 6, '#7a512f', '#9b6b43'); rect(ctx, p.x + p.w / 2 - 2, p.y - 7 + i * 8, 4, 1, '#ffd27a'); }
    rect(ctx, p.x + 8, p.y - 18, 6, 6, '#4f9a67'); rect(ctx, p.x + 9, p.y - 21, 4, 3, '#7edb8c'); rect(ctx, p.x + p.w - 16, p.y - 18, 8, 6, '#ffc94a'); rect(ctx, p.x + p.w - 15, p.y - 17, 6, 4, '#7fb2e6');
  },
  'fairy-lights'(ctx, p, _rot, _c, _open, now) {
    const t = (now?.getTime() ?? 0) / 600;
    for (let x = 0; x < p.w; x++) rect(ctx, p.x + x, p.y + 6 + Math.round(Math.sin((x / p.w) * Math.PI) * 6), 1, 1, '#3a2416');
    for (let i = 0; i < 8; i++) {
      const x = p.x + 3 + i * ((p.w - 6) / 7);
      const y = p.y + 7 + Math.round(Math.sin(((x - p.x) / p.w) * Math.PI) * 6);
      const on = (Math.floor(t) + i) % 4 !== 0;
      rect(ctx, Math.round(x), y, 2, 3, on ? ['#ffd27a', '#ff8fb1', '#7ee0d2', '#ffe9a8'][i % 4] : '#5a5266');
    }
  },
};

function plush(ctx: CanvasRenderingContext2D, p: Px, color: string, fish = false) {
  contact(ctx, p, 5);
  if (fish) {
    pixelEllipse(ctx, p.x + 11, p.y + 13, 8, 5, OUT); pixelEllipse(ctx, p.x + 11, p.y + 13, 7, 4, color);
    rect(ctx, p.x + 18, p.y + 9, 3, 9, color); rect(ctx, p.x + 7, p.y + 12, 1, 1, OUT);
    return;
  }
  pixelEllipse(ctx, p.x + 12, p.y + 15, 7, 5, OUT); pixelEllipse(ctx, p.x + 12, p.y + 14, 6, 4, color);
  pixelEllipse(ctx, p.x + 12, p.y + 7, 6, 5, OUT); pixelEllipse(ctx, p.x + 12, p.y + 7, 5, 4, color);
  rect(ctx, p.x + 7, p.y + 1, 2, 3, color); rect(ctx, p.x + 15, p.y + 1, 2, 3, color);
  rect(ctx, p.x + 10, p.y + 7, 1, 1, OUT); rect(ctx, p.x + 14, p.y + 7, 1, 1, OUT);
}

export function drawDecor(ctx: CanvasRenderingContext2D, item: DecorId, p: Px, rot: 0 | 90, open = false, now = new Date()) {
  const def = decorDef(item);
  const fn = DRAW[item];
  if (fn) return fn(ctx, p, rot, def.color, open, now);
  if (item === 'plush-tangerine') return plush(ctx, p, '#ff8a35');
  if (item === 'plush-midnight') return plush(ctx, p, '#3a3150');
  if (item === 'snow-plush') return plush(ctx, p, '#f4f8ff');
  if (item === 'plush-fish') return plush(ctx, p, '#7fb2e6', true);
  // Safe fallback for any future id: a neutral crate, never a broken render.
  contact(ctx, p, 3);
  box(ctx, p.x + 3, p.y + 3, p.w - 6, p.h - 6, def.color, shade(def.color, 0.2), shade(def.color, -0.25));
}

/** Every catalogue piece has an illustrated drawing (tested). */
export function hasArt(id: DecorId): boolean {
  return !!DRAW[id] || id.startsWith('plush-') || id === 'snow-plush';
}
export const ALL_DECOR_IDS = DECOR.map((d) => d.id);

// ---------------------------------------------------------------------------------------------
// Light, cat and the full frame
// ---------------------------------------------------------------------------------------------

function lights(ctx: CanvasRenderingContext2D, room: readonly Placed[], wp: Wallpaper, t: number, off: readonly string[] = []) {
  // Milestone 8: with every light switched off the room gets cosy-dark (moonlight only)
  const lamps = room.filter((p) => LIGHT_PIECES.includes(p.item));
  if (lamps.length && lamps.every((p) => off.includes(p.uid))) { ctx.fillStyle = 'rgba(16,12,40,0.34)'; ctx.fillRect(0, 0, ROOM_PX_W, ROOM_PX_H); }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of room) {
    const px = footprintPx(p);
    if (p.item === 'window') {
      // a soft shaft of daylight on the floor
      ctx.fillStyle = 'rgba(255,240,210,0.07)';
      ctx.beginPath();
      ctx.moveTo(px.x + 4, WALL_ROWS * T); ctx.lineTo(px.x + px.w - 4, WALL_ROWS * T);
      ctx.lineTo(px.x + px.w + 18, WALL_ROWS * T + 60); ctx.lineTo(px.x + 14, WALL_ROWS * T + 60); ctx.closePath(); ctx.fill();
    }
    if (LIGHT_PIECES.includes(p.item) && !off.includes(p.uid)) {
      const flick = 1 + Math.sin(t * 3 + px.x) * (p.item === 'fireplace' ? 0.1 : 0.04);
      const cx = p.item === 'fireplace' || p.item === 'fairy-lights' ? px.x + px.w / 2 : px.x + 12;
      const cy = p.item === 'lamp' ? px.y - 12 : p.item === 'table-lamp' ? px.y - 4 : p.item === 'fireplace' ? px.y - 2 : px.y + 12;
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 34 * flick);
      g.addColorStop(0, wp === 'night' ? 'rgba(255,200,120,0.36)' : 'rgba(255,200,120,0.22)');
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 40, cy - 40, 80, 80);
    }
  }
  ctx.restore();
}

export interface HomeCatView {
  coat: CoatId;
  accessory: Accessory;
  extra: ExtraId;
  /** Tile coordinates (fractional while walking). */
  x: number;
  y: number;
  lift: number;
  facing: Facing;
  pose: CatPose;
  moving: boolean;
  frame: number;
  eyes?: EyeState;
  ears?: EarState;
  paw?: PawState;
  pawLift?: number;
  /** Draw only the head peeking out (hiding in a box or tunnel). */
  hidden?: boolean;
}

export interface RoomFrame {
  room: readonly Placed[];
  wallpaper: Wallpaper;
  cat: HomeCatView | null;
  /** Ghost of the piece being placed. */
  ghost: (Pick<Placed, 'item' | 'x' | 'y' | 'rot'> & { ok: boolean }) | null;
  /** uid of a piece shown "open" (wardrobe). */
  openUid: string | null;
  time: number;
  editing: boolean;
  now?: Date;
  /** Milestone 8: lights switched off. */
  lightsOff?: readonly string[];
}

export function drawRoom(ctx: CanvasRenderingContext2D, f: RoomFrame, cats: CatSpriteCache) {
  ctx.imageSmoothingEnabled = false;
  const now = f.now ?? new Date();
  drawShell(ctx, f.wallpaper);
  // wall pieces (curtains last, over windows), then rugs, then y-sorted floor pieces + cat
  const wall = f.room.filter((p) => decorDef(p.item).layer === 'wall').sort((a, b) => (a.item === 'curtains' ? 1 : 0) - (b.item === 'curtains' ? 1 : 0));
  for (const p of wall) drawDecor(ctx, p.item, footprintPx(p), p.rot, false, now);
  for (const p of f.room.filter((q) => decorDef(q.item).layer === 'rug')) drawDecor(ctx, p.item, footprintPx(p), p.rot, false, now);
  const list: { y: number; draw: () => void }[] = [];
  for (const p of f.room.filter((q) => decorDef(q.item).layer === 'floor')) {
    const px = footprintPx(p);
    list.push({ y: px.y + px.h, draw: () => drawDecor(ctx, p.item, px, p.rot, p.uid === f.openUid, now) });
  }
  if (f.cat) {
    const c = f.cat;
    const fx = SIDE + c.x * T;
    const fy = c.y * T;
    list.push({ y: fy + (c.lift > 0 ? 30 : 0.5), draw: () => drawHomeCat(ctx, c, fx, fy, cats) });
  }
  list.sort((a, b) => a.y - b.y);
  for (const d of list) d.draw();
  if (f.editing) drawEntryMarker(ctx, f.time);
  if (f.ghost) {
    const px = footprintPx(f.ghost);
    ctx.save();
    ctx.globalAlpha = 0.65;
    drawDecor(ctx, f.ghost.item, px, f.ghost.rot, false, now);
    ctx.globalAlpha = 1;
    ctx.fillStyle = f.ghost.ok ? 'rgba(126,219,140,0.28)' : 'rgba(255,111,161,0.32)';
    ctx.fillRect(px.x, px.y, px.w, px.h);
    ctx.restore();
  }
  lights(ctx, f.room, f.wallpaper, f.time, f.lightsOff);
  if (f.wallpaper === 'night') { ctx.fillStyle = 'rgba(20,16,50,0.18)'; ctx.fillRect(0, 0, ROOM_PX_W, ROOM_PX_H); }
}

/** While decorating: the doormat tile that must stay clear (corner ticks + a soft pulse, same pixel style as the room). */
function drawEntryMarker(ctx: CanvasRenderingContext2D, t: number) {
  const x = SIDE + ENTRY_TILE.x * T, y = ENTRY_TILE.y * T;
  const a = 0.55 + 0.25 * Math.sin(t * 3);
  ctx.save();
  ctx.globalAlpha = a;
  const c = '#7edb8c';
  for (const [dx, dy] of [[1, 1], [T - 5, 1], [1, T - 2], [T - 5, T - 2]] as const) { rect(ctx, x + dx, y + dy, 4, 1, c); }
  for (const [dx, dy] of [[1, 1], [T - 2, 1], [1, T - 5], [T - 2, T - 5]] as const) { rect(ctx, x + dx, y + dy, 1, 4, c); }
  ctx.restore();
}

function drawHomeCat(ctx: CanvasRenderingContext2D, c: HomeCatView, fx: number, fy: number, cats: CatSpriteCache) {
  const key: SpriteKey = {
    coat: c.coat, accessory: c.accessory, extra: c.extra, facing: c.facing, frame: c.frame, moving: c.moving, pose: c.pose,
    eyes: c.eyes, ears: c.ears, paw: c.paw, pawLift: c.pawLift,
  };
  const sprite = cats.get(key) as unknown as CanvasImageSource;
  const x = Math.round(fx - SPRITE_ANCHOR.x);
  const y = Math.round(fy - SPRITE_ANCHOR.y - c.lift);
  if (!c.hidden) {
    pixelEllipse(ctx, Math.round(fx), Math.round(fy - c.lift + (c.lift ? 1 : 0)), 7, 2, 'rgba(20,12,30,0.3)');
    ctx.drawImage(sprite, x, y);
    return;
  }
  // hiding: only the top of the head (ears + eyes) peeks over the edge
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 2, y, 24, 14);
  ctx.clip();
  ctx.drawImage(sprite, x, y + 4);
  ctx.restore();
}

/** Render a catalogue thumbnail (inventory buttons). */
export function renderDecorThumb(factory: CanvasFactory, item: DecorId): CanvasLike {
  const d = decorDef(item);
  const w = d.w * T + 8;
  const h = d.h * T + (d.layer === 'floor' ? 44 : 8);
  const c = factory(w, h);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.imageSmoothingEnabled = false;
  drawDecor(ctx, item, { x: 4, y: h - d.h * T - 4, w: d.w * T, h: d.h * T }, 0, false, new Date(2026, 0, 1, 10, 10));
  return c;
}
