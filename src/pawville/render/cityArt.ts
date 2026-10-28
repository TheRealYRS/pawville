/**
 * Whiskerwick pixel art (Milestone 7) — procedural, same scale/palette/outline language as
 * townArt.ts and regionArt.ts (no image files). Static sprites are built once and cached; a few
 * pieces (fountain spray, Ferris wheel, cabinet screens, neon) animate in regionRenderer.ts.
 */
import { RG } from '../adventure/regionKit.ts';
import { context2d, pixelEllipse, rect, type CanvasFactory } from './canvasTypes.ts';
import { drawSignText } from './pixelFont.ts';
import type { PropSprite } from './townArt.ts';

const T = 16;

/** Ground tiles added in Milestone 7. Returns false for tiles it doesn't own. */
export function cityGroundTile(ctx: CanvasRenderingContext2D, t: number, c: number, r: number, rand: () => number, nb: (dc: number, dr: number) => number): boolean {
  const x = c * T, y = r * T;
  const speck = (n: number, a: string, b: string, w = 1) => { for (let i = 0; i < n; i++) rect(ctx, x + Math.floor(rand() * 15), y + Math.floor(rand() * 15), w, 1, rand() < 0.5 ? a : b); };
  switch (t) {
    case RG.Carpet: {
      rect(ctx, x, y, T, T, (c + r) % 2 ? '#3b2a5e' : '#38285a');
      // a playful arcade-carpet pattern: little stars and squiggles
      if ((c * 3 + r * 5) % 4 === 0) { rect(ctx, x + 4, y + 6, 3, 1, '#7ee0d2'); rect(ctx, x + 5, y + 5, 1, 3, '#7ee0d2'); }
      if ((c * 7 + r) % 5 === 1) { rect(ctx, x + 10, y + 11, 2, 1, '#ff8fb1'); rect(ctx, x + 12, y + 10, 2, 1, '#ff8fb1'); }
      if ((c + r * 3) % 6 === 2) rect(ctx, x + 12, y + 3, 1, 1, '#ffd36b');
      return true;
    }
    case RG.Rail: {
      rect(ctx, x, y, T, T, '#5a5266');
      for (let yy = 1; yy < 16; yy += 4) rect(ctx, x, y + yy, T, 2, '#6b4329');
      rect(ctx, x + 3, y, 2, T, '#b7aac8'); rect(ctx, x + 11, y, 2, T, '#b7aac8');
      rect(ctx, x + 3, y, 1, T, '#e8e2ff'); rect(ctx, x + 11, y, 1, T, '#e8e2ff');
      return true;
    }
    case RG.Brick: {
      rect(ctx, x, y, T, T, '#8d4b3b');
      for (let yy = 0; yy < 16; yy += 4) for (let xx = (yy / 4) % 2 ? 0 : 4; xx < 16; xx += 8) rect(ctx, x + xx, y + yy, 7, 3, (xx + yy + c) % 3 ? '#a85e48' : '#9a5340');
      if (nb(0, 1) !== RG.Brick) { rect(ctx, x, y + 13, T, 3, '#5a2e22'); rect(ctx, x, y + 12, T, 1, '#c27a5e'); }
      return true;
    }
    case RG.Paving: {
      // warm sandstone paving in a circular-ish pattern, lighter than the streets
      rect(ctx, x, y, T, T, '#cdbba0');
      for (let yy = 0; yy < 16; yy += 8) for (let xx = (yy / 8 + c) % 2 ? 0 : 4; xx < 16; xx += 8) { rect(ctx, x + xx, y + yy, 7, 7, (xx + yy + r) % 3 ? '#d8c8ac' : '#c4b090'); rect(ctx, x + xx, y + yy, 7, 1, '#e6d8be'); }
      speck(2, '#b8a484', '#e6d8be');
      return true;
    }
    case RG.Wood: {
      rect(ctx, x, y, T, T, '#a8754c');
      for (let yy = 0; yy < 16; yy += 4) rect(ctx, x, y + yy, T, 1, '#8a5a3b');
      speck(2, '#c99a6a', '#8a5a3b', 3);
      return true;
    }
  }
  return false;
}

function sprite(factory: CanvasFactory, w: number, h: number, ax: number, ay: number, draw: (ctx: CanvasRenderingContext2D) => void): PropSprite {
  const canvas = factory(w, h);
  draw(context2d(canvas));
  return { canvas, ox: -ax, oy: -ay };
}

const SHOPS = [
  { sign: 'BAKERY', wall: '#f3e2c4', wallDark: '#d8c4a0', awning: ['#ff8a35', '#fff3e6'], goods: ['#c99a6a', '#e0b88a', '#fff3e6'] },
  { sign: 'FLOWERS', wall: '#e9dccf', wallDark: '#cdbfb2', awning: ['#7edb8c', '#fff3e6'], goods: ['#ff8fb1', '#ffd36b', '#b9a5ff'] },
  { sign: 'TOYS', wall: '#9cc3ff', wallDark: '#7ea3d6', awning: ['#e0475c', '#ffd36b'], goods: ['#ff8a35', '#252031', '#7ee0d2'] },
  { sign: 'MARKET', wall: '#b7aac8', wallDark: '#9a8cb0', awning: ['#3d5a8a', '#fff3e6'], goods: ['#e0475c', '#7edb8c', '#ffd36b'] },
  // Milestone 8
  { sign: 'HEARTH', wall: '#d9b08c', wallDark: '#c09474', awning: ['#7a512f', '#f3e2c4'], goods: ['#6b4fbf', '#ff8a35', '#7edb8c'] },
] as const;

function storefront(ctx: CanvasRenderingContext2D, v: number) {
  const d = SHOPS[v % SHOPS.length];
  const W = 68, H = 58;
  pixelEllipse(ctx, W / 2, H - 2, 32, 3, 'rgba(20,12,30,0.3)');
  // two storeys: upper flat with a little balcony window, lower shop
  rect(ctx, 2, 6, W - 4, H - 8, d.wall);
  for (let yy = 10; yy < H - 4; yy += 6) rect(ctx, 2, yy, W - 4, 1, d.wallDark);
  rect(ctx, 0, 2, W, 5, '#5a3f66'); rect(ctx, 0, 2, W, 1, '#7d5a8a');
  // upper windows with flower boxes
  for (const wx of [10, 44]) { rect(ctx, wx - 1, 9, 14, 11, '#3a2a3e'); rect(ctx, wx, 10, 12, 9, '#ffe3a0'); rect(ctx, wx + 6, 10, 1, 9, '#3a2a3e'); rect(ctx, wx - 1, 20, 14, 3, '#6b4329'); rect(ctx, wx, 19, 2, 1, d.goods[0]); rect(ctx, wx + 5, 19, 2, 1, d.goods[1]); rect(ctx, wx + 9, 19, 2, 1, d.goods[2]); }
  // sign board
  rect(ctx, 14, 24, 40, 9, '#2a1d2f'); drawSignText(ctx, d.sign, W / 2, 26, '#ffd27a', '#5a2a0e', 1);
  // striped awning (scalloped)
  for (let i = 0; i < W - 4; i += 4) { rect(ctx, 2 + i, 34, 4, 5, (i / 4) % 2 ? d.awning[1] : d.awning[0]); rect(ctx, 3 + i, 39, 2, 1, (i / 4) % 2 ? d.awning[1] : d.awning[0]); }
  // shop window with goods + door
  rect(ctx, 6, 41, 30, 13, '#3a2a3e'); rect(ctx, 7, 42, 28, 11, '#fff2c8');
  for (let i = 0; i < 6; i++) { rect(ctx, 9 + i * 4, 48 - (i % 2), 3, 3 + (i % 2), d.goods[i % 3]); }
  rect(ctx, 7, 42, 28, 1, '#ffffff');
  rect(ctx, 42, 40, 16, 16, '#3a2a3e'); rect(ctx, 43, 41, 14, 15, '#6b4329'); rect(ctx, 45, 43, 10, 6, '#ffe3a0'); rect(ctx, 54, 49, 2, 2, '#ffd27a');
  rect(ctx, 40, 55, 20, 2, '#8d4b3b');
}

export function buildCitySprites(factory: CanvasFactory, s: Record<string, PropSprite>): void {
  for (let v = 0; v < 5; v++) s[`shop${v}`] = sprite(factory, 68, 58, 34, 57, (ctx) => storefront(ctx, v));
  s.arcadebldg = sprite(factory, 104, 82, 52, 80, (ctx) => {
    pixelEllipse(ctx, 52, 78, 50, 4, 'rgba(20,12,30,0.35)');
    rect(ctx, 4, 18, 96, 62, '#2c2246'); for (let xx = 4; xx < 100; xx += 8) rect(ctx, xx, 18, 1, 62, '#3a2c5c');
    rect(ctx, 0, 12, 104, 8, '#1b1530'); rect(ctx, 14, 0, 76, 16, '#1b1530'); rect(ctx, 16, 2, 72, 12, '#241b3d');
    drawSignText(ctx, 'ARCADE', 52, 5, '#ff6fa1', '#3a0e22', 1);
    for (let i = 0; i < 12; i++) rect(ctx, 6 + i * 8, 20, 4, 3, i % 2 ? '#7ee0d2' : '#ff8fb1');
    for (const wx of [10, 70]) { rect(ctx, wx, 34, 24, 26, '#120e1f'); rect(ctx, wx + 2, 36, 9, 22, '#6b4fbf'); rect(ctx, wx + 3, 38, 7, 6, '#7ed6f6'); rect(ctx, wx + 13, 36, 9, 22, '#e0475c'); rect(ctx, wx + 14, 38, 7, 6, '#7edb8c'); }
    rect(ctx, 40, 50, 24, 30, '#120e1f'); rect(ctx, 42, 52, 20, 28, '#5a3f8f'); rect(ctx, 44, 54, 7, 22, '#ffd9a0'); rect(ctx, 53, 54, 7, 22, '#ffd9a0'); rect(ctx, 51, 52, 2, 28, '#120e1f');
  });
  s.cinema = sprite(factory, 88, 74, 44, 72, (ctx) => {
    pixelEllipse(ctx, 44, 70, 42, 3, 'rgba(20,12,30,0.35)');
    rect(ctx, 4, 10, 80, 62, '#7a2e3a'); for (let yy = 12; yy < 72; yy += 5) rect(ctx, 4, yy, 80, 1, '#6a2632');
    rect(ctx, 0, 6, 88, 6, '#4a1a24');
    rect(ctx, 10, 0, 68, 14, '#2a1d2f'); drawSignText(ctx, 'BIJOU', 44, 4, '#ffd27a', '#5a2a0e', 1);
    for (let i = 0; i < 17; i++) rect(ctx, 11 + i * 4, 12, 2, 2, i % 2 ? '#ffe9a8' : '#ffd27a');
    rect(ctx, 8, 22, 72, 12, '#fff3e6'); rect(ctx, 12, 25, 64, 2, '#2a1d2f'); rect(ctx, 16, 29, 56, 2, '#2a1d2f');
    rect(ctx, 30, 44, 28, 28, '#2a1d2f'); rect(ctx, 32, 46, 24, 26, '#b5323e'); rect(ctx, 43, 46, 2, 26, '#2a1d2f');
    rect(ctx, 10, 42, 14, 20, '#2a1d2f'); rect(ctx, 11, 43, 12, 18, '#ffd27a'); rect(ctx, 64, 42, 14, 20, '#2a1d2f'); rect(ctx, 65, 43, 12, 18, '#7ee0d2');
  });
  s.citystation = sprite(factory, 88, 68, 44, 66, (ctx) => {
    pixelEllipse(ctx, 44, 64, 42, 3, 'rgba(20,12,30,0.3)');
    rect(ctx, 4, 22, 80, 44, '#9a5340'); for (let by = 22; by < 64; by += 4) for (let bx = 4 + ((by / 4) % 2 ? 0 : 4); bx < 84; bx += 8) rect(ctx, bx, by, 7, 3, (bx + by) % 3 ? '#a85e48' : '#8d4b3b');
    rect(ctx, 0, 14, 88, 10, '#2f5d4a'); for (let i = 0; i < 88; i += 6) rect(ctx, i, 16, 3, 6, '#386c56');
    rect(ctx, 30, 0, 28, 16, '#2f5d4a'); pixelEllipse(ctx, 44, 8, 7, 7, '#fff8ea'); rect(ctx, 44, 3, 1, 5, '#2a1d2f'); rect(ctx, 44, 8, 4, 1, '#2a1d2f');
    rect(ctx, 16, 26, 56, 10, '#1f4033'); drawSignText(ctx, 'STATION', 44, 28, '#ffd27a', '#0e2219', 1);
    for (const wx of [8, 62]) { rect(ctx, wx, 40, 18, 16, '#5a2e22'); rect(ctx, wx + 1, 41, 16, 14, '#ffe3a0'); }
    rect(ctx, 34, 40, 20, 26, '#5a2e22'); rect(ctx, 36, 42, 16, 24, '#2f5d4a'); rect(ctx, 38, 44, 5, 16, '#ffe3a0'); rect(ctx, 45, 44, 5, 16, '#ffe3a0');
  });
  s.train = sprite(factory, 30, 124, 15, 122, (ctx) => {
    // a little red city tram seen from above, along the west tracks
    rect(ctx, 2, 2, 26, 120, '#2a1d2f'); rect(ctx, 3, 3, 24, 118, '#e0475c'); rect(ctx, 3, 3, 24, 4, '#ffd27a');
    for (let yy = 12; yy < 116; yy += 14) { rect(ctx, 6, yy, 18, 9, '#2a1d2f'); rect(ctx, 7, yy + 1, 16, 7, '#9cc3ff'); rect(ctx, 7, yy + 1, 16, 1, '#e8f4ff'); }
    rect(ctx, 3, 60, 24, 2, '#b5323e');
  });
  s.ticketmachine = sprite(factory, 14, 26, 7, 25, (ctx) => { rect(ctx, 1, 0, 12, 25, '#2f5d4a'); rect(ctx, 3, 3, 8, 6, '#7ee0d2'); rect(ctx, 4, 4, 3, 1, '#ffffff'); rect(ctx, 3, 11, 8, 2, '#ffd27a'); rect(ctx, 5, 15, 4, 1, '#1b1530'); rect(ctx, 1, 23, 12, 2, '#1f4033'); });
  s.cityfountain = sprite(factory, 52, 34, 26, 26, (ctx) => {
    pixelEllipse(ctx, 26, 24, 25, 9, '#8a7da0'); pixelEllipse(ctx, 26, 23, 23, 7, '#b7aac8'); pixelEllipse(ctx, 26, 23, 20, 6, '#4a80bb'); pixelEllipse(ctx, 26, 22, 18, 4, '#5d93c9');
    rect(ctx, 23, 6, 6, 17, '#b7aac8'); rect(ctx, 23, 6, 2, 17, '#cfc6e3'); pixelEllipse(ctx, 26, 8, 8, 3, '#b7aac8'); pixelEllipse(ctx, 26, 7, 6, 2, '#5d93c9');
    for (const [cx, cy] of [[14, 22], [36, 24], [22, 25], [32, 21]]) rect(ctx, cx, cy, 1, 1, '#ffd27a');
  });
  const cafe = (v: number) => sprite(factory, 88, 64, 44, 62, (ctx) => {
    const [wall, line, sign, aw] = v ? ['#3a2a3e', '#2c2030', 'LE PETIT MOUSTACHE', '#b5323e'] : ['#f3e2c4', '#e0caa4', 'PURRING CUP', '#4f9a67'];
    pixelEllipse(ctx, 44, 60, 42, 3, 'rgba(20,12,30,0.3)');
    rect(ctx, 4, 8, 80, 54, wall); for (let yy = 12; yy < 60; yy += 6) rect(ctx, 4, yy, 80, 1, line);
    rect(ctx, 0, 4, 88, 6, '#6b4329');
    rect(ctx, 6, 12, 76, 10, '#2a1d2f'); drawSignText(ctx, sign, 44, 14, '#ffd27a', '#5a2a0e', 1);
    for (let i = 0; i < 84; i += 4) { rect(ctx, 2 + i, 24, 4, 6, (i / 4) % 2 ? '#fff3e6' : aw); rect(ctx, 3 + i, 30, 2, 1, (i / 4) % 2 ? '#fff3e6' : aw); }
    for (const wx of [8, 62]) { rect(ctx, wx, 34, 18, 18, '#6b4329'); rect(ctx, wx + 1, 35, 16, 16, '#ffe3a0'); rect(ctx, wx + 4, 46, 3, 3, '#ff8fb1'); rect(ctx, wx + 10, 45, 4, 4, '#c99a6a'); }
    rect(ctx, 36, 36, 16, 26, '#6b4329'); rect(ctx, 37, 37, 14, 25, aw); rect(ctx, 39, 39, 10, 8, '#ffe3a0');
  });
  s.cafe0 = cafe(0); s.cafe1 = cafe(1);
  s.cafetable = sprite(factory, 22, 26, 11, 24, (ctx) => {
    for (let i = 0; i < 9; i++) rect(ctx, 11 - i - 1, 1 + i, (i + 1) * 2, 1, i % 2 ? '#ff8a35' : '#fff3e6');
    rect(ctx, 10, 10, 2, 10, '#5a3a22'); pixelEllipse(ctx, 11, 18, 6, 2, '#e9dccf'); rect(ctx, 9, 16, 3, 2, '#fff3e6'); rect(ctx, 6, 22, 10, 2, '#5a3a22');
  });
  s.icecart = sprite(factory, 30, 30, 15, 28, (ctx) => {
    pixelEllipse(ctx, 15, 27, 13, 2, 'rgba(20,12,30,0.3)');
    rect(ctx, 3, 12, 24, 12, '#ffe1ec'); rect(ctx, 3, 12, 24, 2, '#ff8fb1'); pixelEllipse(ctx, 7, 25, 3, 3, '#3a2a3e'); pixelEllipse(ctx, 23, 25, 3, 3, '#3a2a3e');
    for (let i = 0; i < 26; i += 4) rect(ctx, 2 + i, 2, 4, 5, (i / 4) % 2 ? '#fff3e6' : '#7ee0d2'); rect(ctx, 14, 7, 2, 5, '#5a3a22');
    for (const [cx, col] of [[8, '#ff8fb1'], [14, '#fff3e6'], [20, '#a8754c']] as const) { pixelEllipse(ctx, cx, 13, 2, 2, col); }
  });
  s.noticeboard = sprite(factory, 22, 28, 11, 27, (ctx) => { rect(ctx, 2, 4, 18, 14, '#6b4329'); rect(ctx, 3, 5, 16, 12, '#c99a6a'); rect(ctx, 5, 7, 5, 4, '#fff3e6'); rect(ctx, 12, 6, 5, 6, '#ffe1ec'); rect(ctx, 6, 12, 6, 4, '#bfe4ff'); rect(ctx, 3, 18, 2, 10, '#5a3a22'); rect(ctx, 17, 18, 2, 10, '#5a3a22'); });
  s.photobooth = sprite(factory, 20, 34, 10, 33, (ctx) => { rect(ctx, 1, 2, 18, 31, '#6b4fbf'); rect(ctx, 1, 2, 18, 3, '#ff8fb1'); rect(ctx, 4, 9, 12, 20, '#e0475c'); for (let yy = 9; yy < 29; yy += 3) rect(ctx, 4, yy, 12, 1, '#b5323e'); rect(ctx, 6, 5, 8, 3, '#fff3e6'); });
  s.ferris = sprite(factory, 96, 112, 48, 110, (ctx) => {
    // legs (the wheel itself is drawn per frame so it can turn)
    for (let i = 0; i < 60; i++) { rect(ctx, 48 - Math.round(i * 0.45), 50 + i, 2, 1, '#8a7da0'); rect(ctx, 48 + Math.round(i * 0.45), 50 + i, 2, 1, '#8a7da0'); }
    rect(ctx, 16, 106, 66, 4, '#5a5266');
  });
  for (let v = 0; v < 7; v++) {
    const body = ['#2f6f73', '#6b4fbf', '#e0475c', '#4f9a67', '#ff8a35', '#3d5a8a', '#5a5266'][v];
    s[`cabinet${v}`] = sprite(factory, 20, 34, 10, 33, (ctx) => {
      pixelEllipse(ctx, 10, 32, 9, 2, 'rgba(10,6,20,0.4)');
      rect(ctx, 2, 2, 16, 30, '#1b1530'); rect(ctx, 3, 3, 14, 28, body); rect(ctx, 3, 3, 14, 4, '#1b1530');
      rect(ctx, 5, 9, 10, 8, '#0e0b14'); // screen (lit per frame)
      rect(ctx, 3, 19, 14, 4, '#2a1d2f'); rect(ctx, 6, 20, 2, 2, '#e0475c'); rect(ctx, 10, 20, 2, 2, '#ffd27a'); rect(ctx, 13, 20, 2, 2, '#7ee0d2');
      rect(ctx, 8, 26, 4, 2, '#ffd27a');
    });
  }
}

/** Per-frame bits: fountain spray, the turning Ferris wheel, cabinet screens and neon. */
export function drawCityDynamic(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, variant: number, time: number, still: boolean, night: number, ferrisAngle?: number): boolean {
  const t = still ? 0 : time;
  switch (kind) {
    case 'cityfountain': {
      for (let i = 0; i < 6; i++) {
        const k = (t * 1.2 + i / 6) % 1;
        const a = (i / 6) * Math.PI * 2;
        ctx.globalAlpha = 1 - k;
        rect(ctx, Math.round(x + Math.cos(a) * k * 14), Math.round(y - 22 + k * k * 18 - Math.sin(k * Math.PI) * 6), 1, 2, '#d8ecff');
      }
      ctx.globalAlpha = 1;
      rect(ctx, x - 1, y - 26 - (Math.floor(t * 6) % 2), 2, 6, '#d8ecff');
      return false; // the base sprite is drawn by the caller first
    }
    case 'ferris': {
      const cx = x, cy = y - 62, R = 40;
      ctx.strokeStyle = '#cfc6e3';
      ctx.beginPath(); ctx.arc(cx + 0.5, cy + 0.5, R, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 0.5, cy + 0.5, R - 6, 0, Math.PI * 2); ctx.stroke();
      const rot = ferrisAngle ?? t * 0.15;
      for (let i = 0; i < 8; i++) {
        const a = rot + (i / 8) * Math.PI * 2;
        const px = Math.round(cx + Math.cos(a) * R), py = Math.round(cy + Math.sin(a) * R);
        ctx.beginPath(); ctx.moveTo(cx + 0.5, cy + 0.5); ctx.lineTo(px + 0.5, py + 0.5); ctx.stroke();
        rect(ctx, px - 4, py + 1, 8, 7, ['#ff8a35', '#7ee0d2', '#ff8fb1', '#ffd36b'][i % 4]);
        rect(ctx, px - 3, py + 2, 6, 3, '#fff2c8');
        if (night > 0.4) rect(ctx, px, py - 1, 1, 1, '#fff3c4');
      }
      pixelEllipse(ctx, cx, cy, 4, 4, '#8a7da0');
      return false;
    }
    case 'cabinet': {
      const blink = Math.floor(t * 3 + variant) % 4;
      const col = ['#7ee0d2', '#ff8fb1', '#ffd36b', '#9cc3ff', '#7edb8c', '#ff8a35', '#c9bfe8'][variant % 7];
      rect(ctx, x - 5, y - 24, 10, 8, '#0e0b14');
      rect(ctx, x - 4, y - 23, 8, 6, col);
      rect(ctx, x - 3 + blink, y - 21, 2, 2, '#ffffff');
      rect(ctx, x - 4, y - 23, 8, 1, '#ffffff');
      return false;
    }
    case 'arcadebldg': {
      if (Math.floor(t * 2) % 2 === 0 || still) for (let i = 0; i < 12; i++) rect(ctx, x - 46 + i * 8, y - 60, 4, 3, i % 2 ? '#ff8fb1' : '#7ee0d2');
      return false;
    }
  }
  return false;
}
