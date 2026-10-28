/**
 * Milestone 8 pixel art: Grand City Park, the Residential District, Old Town, the Rooftops and the
 * new interiors. Procedural, cached sprites in the same style as townArt/regionArt/cityArt:
 * 1-px #2a1d2f outlines on structures, a light top edge and dark bottom edge per surface, soft
 * contact shadows and the shared plum/orange/cream palette. The furniture showroom draws the
 * home's own furniture art (decor:* props), so what you see is exactly what you buy.
 */
import { RG } from '../adventure/regionKit.ts';
import { drawDecor } from '../home/homeArt.ts';
import { decorDef, SHOP_FURNITURE } from '../home/decor.ts';
import { context2d, pixelEllipse, rect, type CanvasFactory } from './canvasTypes.ts';
import { drawSignText } from './pixelFont.ts';
import type { PropSprite } from './townArt.ts';

const T = 16;
const OUT = '#2a1d2f';
const SHADOW = 'rgba(20,12,30,0.3)';

export function districtGroundTile(ctx: CanvasRenderingContext2D, t: number, c: number, r: number, rand: () => number, nb: (dc: number, dr: number) => number): boolean {
  const x = c * T, y = r * T;
  switch (t) {
    case RG.Hedge: {
      rect(ctx, x, y, T, T, '#2f6b3a');
      for (let i = 0; i < 7; i++) pixelEllipse(ctx, x + 2 + Math.floor(rand() * 12), y + 2 + Math.floor(rand() * 10), 3, 3, rand() < 0.5 ? '#3e8a45' : '#357a40');
      for (let i = 0; i < 4; i++) rect(ctx, x + Math.floor(rand() * 15), y + Math.floor(rand() * 12), 1, 1, '#5aa955');
      if (nb(0, 1) !== RG.Hedge) rect(ctx, x, y + 13, T, 3, '#1f4a2a');
      if (nb(0, -1) !== RG.Hedge) rect(ctx, x, y, T, 2, '#5aa955');
      return true;
    }
    case RG.Roof: {
      rect(ctx, x, y, T, T, '#b5623a');
      for (let yy = 0; yy < 16; yy += 4) for (let xx = (yy / 4 + c) % 2 ? 0 : 3; xx < 16; xx += 6) { rect(ctx, x + xx, y + yy, 5, 3, (xx + r) % 3 ? '#c9744a' : '#a8572f'); rect(ctx, x + xx, y + yy + 3, 5, 1, '#8a4524'); }
      if (nb(0, 1) === RG.Void) { rect(ctx, x, y + 13, T, 3, '#5a5266'); rect(ctx, x, y + 13, T, 1, '#8a7da0'); }
      if (nb(-1, 0) === RG.Void) rect(ctx, x, y, 2, T, '#8a4524');
      if (nb(1, 0) === RG.Void) rect(ctx, x + 14, y, 2, T, '#8a4524');
      return true;
    }
    case RG.IWall: {
      // interior: patterned wallpaper above a wooden wainscot along the back wall; dark outside the room
      const back = r < 4;
      if (back) {
        rect(ctx, x, y, T, T, '#5a3f66');
        for (let yy = 2; yy < 16; yy += 6) for (let xx = (yy / 6 + c) % 2 ? 2 : 9; xx < 16; xx += 14) { rect(ctx, x + xx, y + yy, 1, 3, '#6b4f7a'); rect(ctx, x + xx - 1, y + yy + 1, 3, 1, '#6b4f7a'); }
        if (nb(0, 1) !== RG.IWall) { rect(ctx, x, y + 8, T, 8, '#6b4329'); rect(ctx, x, y + 8, T, 1, '#9b6b43'); rect(ctx, x, y + 15, T, 1, '#3a2416'); for (let xx = 3; xx < 16; xx += 8) rect(ctx, x + xx, y + 10, 4, 4, '#5a3a22'); }
        if (r === 1 && c % 6 === 3) { rect(ctx, x + 2, y + 2, 12, 10, '#3a2416'); rect(ctx, x + 3, y + 3, 10, 8, '#9cc3ff'); rect(ctx, x + 8, y + 3, 1, 8, '#3a2416'); }
      } else {
        rect(ctx, x, y, T, T, '#1b1530');
        if (nb(1, 0) !== RG.IWall) rect(ctx, x + 13, y, 3, T, '#3a2a3e');
        if (nb(-1, 0) !== RG.IWall) rect(ctx, x, y, 3, T, '#3a2a3e');
      }
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
const shadow = (ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number) => pixelEllipse(ctx, cx, cy, rx, Math.max(2, Math.round(rx / 8)), SHADOW);
function windowPane(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frame: string, glass = '#ffe3a0') {
  rect(ctx, x - 1, y - 1, w + 2, h + 2, frame); rect(ctx, x, y, w, h, glass);
  rect(ctx, x + Math.floor(w / 2), y, 1, h, frame); rect(ctx, x, y + Math.floor(h / 2), w, 1, frame);
  rect(ctx, x, y, w, 1, '#fff8ea');
}
function shadeHex(c: string): string {
  const n = parseInt(c.slice(1), 16);
  const m = (v: number) => Math.round(v * 0.75).toString(16).padStart(2, '0');
  return `#${m((n >> 16) & 255)}${m((n >> 8) & 255)}${m(n & 255)}`;
}

export function buildDistrictSprites(factory: CanvasFactory, s: Record<string, PropSprite>): void {
  // ---------------- park ----------------
  s.gazebo = sprite(factory, 72, 64, 36, 60, (ctx) => {
    shadow(ctx, 36, 58, 32);
    pixelEllipse(ctx, 36, 54, 32, 6, '#cfc6e3'); pixelEllipse(ctx, 36, 53, 30, 5, '#e8e2ff');
    for (const px of [8, 22, 50, 64]) { rect(ctx, px, 22, 3, 32, '#fff3e6'); rect(ctx, px + 2, 22, 1, 32, '#cfc6e3'); }
    for (let i = 0; i < 20; i++) rect(ctx, 36 - 4 - i * 1.6, 2 + i, 8 + i * 3.2, 1, i % 4 === 0 ? '#5a3f8f' : '#6b4fbf');
    rect(ctx, 2, 21, 68, 3, '#5a3f8f'); for (let i = 0; i < 17; i++) rect(ctx, 4 + i * 4, 24, 2, 2, '#e8e2ff');
    rect(ctx, 35, 0, 2, 4, '#ffd27a');
    for (let i = 0; i < 4; i++) rect(ctx, 10 + i * 15, 42, 10, 1, '#fff3e6');
    for (const fx of [4, 66]) { rect(ctx, fx, 46, 3, 3, '#ff8fb1'); rect(ctx, fx + 1, 45, 1, 1, '#ffd36b'); }
  });
  s.conservatory = sprite(factory, 96, 76, 48, 74, (ctx) => {
    shadow(ctx, 48, 72, 44);
    rect(ctx, 4, 70, 88, 4, '#8a7da0');
    for (let yy = 0; yy < 40; yy++) { const half = Math.round(44 - Math.max(0, 22 - yy) * 1.2); rect(ctx, 48 - half, 30 + yy, half * 2, 1, yy % 8 === 0 ? '#cfe4ff' : '#a9cdec'); }
    for (let i = 0; i < 24; i++) { const half = Math.round(Math.sqrt(Math.max(0, 1 - ((23 - i) / 24) ** 2)) * 30); rect(ctx, 48 - half, 6 + i, half * 2, 1, '#b4d6f0'); }
    for (const fx of [8, 22, 36, 48, 60, 74, 88]) rect(ctx, fx, 30, 1, 40, '#f4f8ff');
    rect(ctx, 47, 6, 2, 64, '#f4f8ff'); rect(ctx, 4, 30, 88, 2, '#f4f8ff');
    for (let i = 0; i < 18; i++) pixelEllipse(ctx, 12 + ((i * 37) % 72), 40 + ((i * 13) % 26), 3, 2, i % 3 ? '#4f9a67' : '#7edb8c');
    for (let i = 0; i < 6; i++) rect(ctx, 16 + i * 12, 50 + (i % 2) * 6, 2, 2, '#f4f0ff');
    pixelEllipse(ctx, 48, 20, 6, 5, '#4f9a67'); rect(ctx, 47, 2, 2, 5, '#ffd27a');
    rect(ctx, 42, 52, 12, 18, '#2a5389'); rect(ctx, 43, 53, 10, 17, '#7ea9cc'); rect(ctx, 47, 53, 1, 17, '#f4f8ff');
  });
  s.duck = sprite(factory, 14, 10, 7, 8, (ctx) => {
    pixelEllipse(ctx, 6, 7, 5, 2, '#9cc3ff');
    pixelEllipse(ctx, 6, 6, 5, 3, '#fff3e6'); pixelEllipse(ctx, 10, 3, 2, 2, '#4f9a67'); rect(ctx, 12, 3, 2, 1, '#ffb13d'); rect(ctx, 10, 2, 1, 1, OUT);
    rect(ctx, 2, 5, 3, 1, '#e9dccf');
  });
  s.gull = sprite(factory, 12, 12, 6, 11, (ctx) => {
    pixelEllipse(ctx, 6, 7, 4, 3, '#f4f8ff'); rect(ctx, 2, 6, 3, 2, '#9aa3b5'); pixelEllipse(ctx, 8, 3, 2, 2, '#f4f8ff'); rect(ctx, 10, 3, 2, 1, '#ffb13d'); rect(ctx, 8, 2, 1, 1, OUT);
    rect(ctx, 5, 10, 1, 2, '#ffb13d'); rect(ctx, 7, 10, 1, 2, '#ffb13d');
  });
  for (let v = 0; v < 2; v++) s[`picnicblanket${v}`] = sprite(factory, 40, 26, 20, 20, (ctx) => {
    const a = v ? '#7ee0d2' : '#e0475c';
    for (let yy = 0; yy < 18; yy++) for (let xx = 0; xx < 36; xx++) rect(ctx, 2 + xx, 4 + yy, 1, 1, ((xx >> 2) + (yy >> 2)) % 2 === 0 ? a : '#fff3e6');
    rect(ctx, 2, 22, 36, 1, SHADOW);
    rect(ctx, 24, 0, 12, 9, '#c69c6d'); rect(ctx, 24, 0, 12, 2, '#8a5a3b'); rect(ctx, 28, 0, 4, 1, '#8a5a3b');
    pixelEllipse(ctx, 10, 10, 3, 2, '#fff3e6'); rect(ctx, 9, 9, 2, 1, '#e0475c');
  });
  s.parkbench = sprite(factory, 30, 20, 15, 18, (ctx) => {
    shadow(ctx, 15, 17, 12);
    rect(ctx, 2, 2, 26, 7, OUT); for (let i = 0; i < 3; i++) rect(ctx, 3, 3 + i * 2, 24, 1, '#7aa845');
    rect(ctx, 1, 10, 28, 4, OUT); rect(ctx, 2, 10, 26, 2, '#7aa845'); rect(ctx, 2, 12, 26, 1, '#5a8a35');
    for (const lx of [3, 24]) { rect(ctx, lx, 14, 3, 4, '#2a2433'); rect(ctx, lx, 2, 2, 9, '#2a2433'); }
  });
  s.berrybush = sprite(factory, 20, 16, 10, 15, (ctx) => {
    shadow(ctx, 10, 14, 8); pixelEllipse(ctx, 10, 8, 9, 6, '#2f6b3a'); pixelEllipse(ctx, 9, 7, 7, 4, '#3e8a45');
    for (const [bx, by] of [[5, 6], [12, 4], [14, 9], [8, 10], [3, 9]]) { rect(ctx, bx, by, 2, 2, '#b5323e'); rect(ctx, bx, by, 1, 1, '#ff8fb1'); }
  });
  s.planter = sprite(factory, 18, 20, 9, 19, (ctx) => {
    shadow(ctx, 9, 18, 7); rect(ctx, 2, 10, 14, 8, '#b5623a'); rect(ctx, 2, 10, 14, 2, '#d9844f'); rect(ctx, 2, 17, 14, 1, '#7a3a1e');
    for (let i = 0; i < 5; i++) { rect(ctx, 3 + i * 3, 4 + (i % 2) * 2, 2, 7, '#4f9a67'); rect(ctx, 3 + i * 3, 3 + (i % 2) * 2, 2, 2, ['#ff8fb1', '#ffd36b', '#b9a5ff', '#ff9d5c', '#fff3e6'][i]); }
  });
  s.flowerbed = sprite(factory, 32, 14, 16, 12, (ctx) => {
    rect(ctx, 1, 4, 30, 9, '#6b4329'); rect(ctx, 2, 5, 28, 6, '#5a3a22');
    for (let i = 0; i < 9; i++) { rect(ctx, 3 + i * 3, 3 + (i % 2), 2, 3, '#4f9a67'); rect(ctx, 3 + i * 3, 1 + (i % 2), 2, 2, ['#ff8fb1', '#ffd36b', '#fff3e6', '#b9a5ff'][i % 4]); }
  });
  // ---------------- residential ----------------
  const APT = [
    { wall: '#c9a27e', dark: '#a8835f', roof: '#6b3a2e', door: '#3d5a8a' },
    { wall: '#9cb8d6', dark: '#7e9cbb', roof: '#2f4870', door: '#e0475c' },
    { wall: '#e9c9d6', dark: '#cfa8b8', roof: '#7d5a8a', door: '#4f9a67' },
  ];
  APT.forEach((a, v) => {
    s[`apartment${v}`] = sprite(factory, 72, 90, 36, 88, (ctx) => {
      shadow(ctx, 36, 86, 34);
      rect(ctx, 2, 10, 68, 78, OUT); rect(ctx, 3, 11, 66, 76, a.wall);
      for (let yy = 16; yy < 86; yy += 6) rect(ctx, 3, yy, 66, 1, a.dark);
      rect(ctx, 0, 4, 72, 8, a.roof); rect(ctx, 0, 11, 72, 1, OUT);
      for (let fl = 0; fl < 3; fl++) for (const wx of [10, 30, 50]) {
        const wy = 18 + fl * 20;
        windowPane(ctx, wx, wy, 12, 10, OUT, (wx + fl) % 3 ? '#ffe3a0' : '#9cc3ff');
        if (fl > 0 && wx !== 30) { rect(ctx, wx - 2, wy + 11, 16, 2, '#5a3a22'); for (let i = 0; i < 4; i++) rect(ctx, wx - 1 + i * 4, wy + 8, 1, 3, '#5a3a22'); rect(ctx, wx, wy + 9, 3, 2, '#ff8fb1'); rect(ctx, wx + 8, wy + 9, 3, 2, '#7edb8c'); }
      }
      rect(ctx, 30, 70, 12, 17, OUT); rect(ctx, 31, 71, 10, 16, a.door); rect(ctx, 39, 78, 1, 2, '#ffd27a'); rect(ctx, 28, 68, 16, 2, a.roof);
      rect(ctx, 46, 74, 4, 6, '#ffe3a0');
    });
  });
  for (let v = 0; v < 2; v++) s[`townhouse${v}`] = sprite(factory, 60, 76, 30, 74, (ctx) => {
    const wall = v ? '#f3e2c4' : '#d9b08c';
    shadow(ctx, 30, 72, 28);
    for (let i = 0; i < 22; i++) rect(ctx, 30 - 2 - i * 1.3, 2 + i, 4 + i * 2.6, 1, i % 3 ? '#7a3a1e' : '#8d4b3b');
    rect(ctx, 2, 24, 56, 50, OUT); rect(ctx, 3, 25, 54, 48, wall); for (let yy = 30; yy < 72; yy += 5) rect(ctx, 3, yy, 54, 1, v ? '#e0caa4' : '#c09474');
    windowPane(ctx, 26, 8, 8, 8, OUT);
    windowPane(ctx, 8, 32, 12, 12, OUT); windowPane(ctx, 40, 32, 12, 12, OUT);
    rect(ctx, 7, 45, 14, 2, '#6b4329'); rect(ctx, 8, 43, 3, 2, '#ff8fb1'); rect(ctx, 13, 43, 3, 2, '#ffd36b'); rect(ctx, 17, 43, 3, 2, '#7edb8c');
    rect(ctx, 24, 54, 12, 20, OUT); rect(ctx, 25, 55, 10, 19, v ? '#6b4fbf' : '#2f6f73'); rect(ctx, 33, 64, 1, 2, '#ffd27a');
    rect(ctx, 44, 58, 6, 14, '#9b6b43'); rect(ctx, 45, 57, 4, 2, '#e0475c');
  });
  s.laundry = sprite(factory, 64, 30, 32, 28, (ctx) => {
    rect(ctx, 1, 2, 2, 26, '#5a3a22'); rect(ctx, 61, 2, 2, 26, '#5a3a22');
    for (let x = 3; x < 61; x++) rect(ctx, x, 4 + Math.round(Math.sin(((x - 3) / 58) * Math.PI) * 4), 1, 1, '#e9dccf');
    const items: [number, number, number, string][] = [[8, 6, 8, '#ff8fb1'], [18, 5, 10, '#fff3e6'], [30, 6, 6, '#7ee0d2'], [40, 4, 12, '#ffd36b'], [52, 5, 6, '#b9a5ff']];
    for (const [ix, w, h, col] of items) { const iy = 5 + Math.round(Math.sin(((ix - 3) / 58) * Math.PI) * 4); rect(ctx, ix, iy, w, h, col); rect(ctx, ix, iy, w, 1, '#ffffff'); rect(ctx, ix + 1, iy - 1, 1, 2, '#9b6b43'); }
  });
  // ---------------- city additions ----------------
  for (let v = 0; v < 2; v++) s[`marketstall${v}`] = sprite(factory, 40, 34, 20, 32, (ctx) => {
    shadow(ctx, 20, 31, 18);
    rect(ctx, 2, 18, 36, 13, '#8a5a3b'); rect(ctx, 2, 18, 36, 2, '#b5835a');
    rect(ctx, 3, 4, 2, 15, '#5a3a22'); rect(ctx, 35, 4, 2, 15, '#5a3a22');
    const aw = v ? '#4f9a67' : '#e0475c';
    for (let i = 0; i < 9; i++) { rect(ctx, 1 + i * 4, 0, 4, 6, i % 2 ? '#fff3e6' : aw); rect(ctx, 2 + i * 4, 6, 2, 1, i % 2 ? '#fff3e6' : aw); }
    for (let i = 0; i < 6; i++) pixelEllipse(ctx, 7 + i * 5, 16, 2, 2, v ? ['#ff8fb1', '#ffd36b', '#b9a5ff'][i % 3] : ['#e0475c', '#7edb8c', '#ffb13d'][i % 3]);
  });
  s.boardwalkstall = sprite(factory, 40, 34, 20, 32, (ctx) => {
    shadow(ctx, 20, 31, 18);
    rect(ctx, 2, 16, 36, 15, '#5d93c9'); rect(ctx, 2, 16, 36, 2, '#9cc3ff');
    rect(ctx, 3, 4, 2, 12, '#fff3e6'); rect(ctx, 35, 4, 2, 12, '#fff3e6'); rect(ctx, 1, 0, 38, 6, '#ff8a35'); rect(ctx, 1, 5, 38, 1, '#c2531a');
    drawSignText(ctx, 'SHELLS', 20, 9, '#fff3e6', '#2a5389', 1);
    for (let i = 0; i < 5; i++) pixelEllipse(ctx, 7 + i * 6, 20, 2, 1, ['#ffe1ec', '#fff3e6', '#ffd36b'][i % 3]);
  });
  s.statue = sprite(factory, 24, 44, 12, 42, (ctx) => {
    shadow(ctx, 12, 41, 10);
    rect(ctx, 3, 30, 18, 11, '#8a7da0'); rect(ctx, 3, 30, 18, 2, '#cfc6e3'); rect(ctx, 5, 34, 14, 1, '#6d6478');
    pixelEllipse(ctx, 12, 22, 7, 8, '#b7aac8'); pixelEllipse(ctx, 12, 10, 6, 5, '#b7aac8');
    rect(ctx, 7, 3, 3, 4, '#b7aac8'); rect(ctx, 14, 3, 3, 4, '#b7aac8'); rect(ctx, 17, 22, 5, 2, '#b7aac8');
    rect(ctx, 6, 0, 12, 3, '#ffd27a'); rect(ctx, 10, 10, 1, 1, '#6d6478'); rect(ctx, 14, 10, 1, 1, '#6d6478');
  });
  s.archway = sprite(factory, 52, 52, 26, 50, (ctx) => {
    rect(ctx, 0, 6, 10, 44, '#8d4b3b'); rect(ctx, 42, 6, 10, 44, '#8d4b3b');
    for (let i = 0; i < 18; i++) { const a = Math.PI * (i / 17); rect(ctx, Math.round(26 - Math.cos(a) * 21) - 2, Math.round(16 - Math.sin(a) * 14) + 6, 5, 5, i % 2 ? '#a85e48' : '#9a5340'); }
    rect(ctx, 0, 4, 52, 3, '#6b3a2e');
    drawSignText(ctx, 'OLD TOWN', 26, 0, '#ffd27a', '#3a1e14', 1);
    rect(ctx, 2, 20, 6, 8, '#ffe9a8'); rect(ctx, 44, 20, 6, 8, '#ffe9a8');
  });
  s.parkgate = sprite(factory, 56, 46, 28, 44, (ctx) => {
    rect(ctx, 0, 6, 6, 38, '#2a2433'); rect(ctx, 50, 6, 6, 38, '#2a2433');
    for (let i = 0; i < 52; i++) rect(ctx, 2 + i, 12 - Math.round(Math.sin((i / 52) * Math.PI) * 6), 1, 1, '#2a2433');
    for (const px of [10, 16, 40, 46]) rect(ctx, px, 14, 1, 30, '#2a2433');
    pixelEllipse(ctx, 3, 4, 4, 4, '#ffd27a'); pixelEllipse(ctx, 53, 4, 4, 4, '#ffd27a');
    drawSignText(ctx, 'GRAND PARK', 28, 14, '#ffd27a', '#2a2433', 1);
    for (let i = 0; i < 6; i++) { pixelEllipse(ctx, 2 + i * 2, 40 - i * 4, 3, 2, '#3e8a45'); pixelEllipse(ctx, 54 - i * 2, 40 - i * 4, 3, 2, '#3e8a45'); }
  });
  // ---------------- Old Town ----------------
  s.clocktower = sprite(factory, 60, 150, 30, 148, (ctx) => {
    shadow(ctx, 30, 146, 28);
    rect(ctx, 6, 40, 48, 108, OUT); rect(ctx, 7, 41, 46, 106, '#a89a86');
    for (let yy = 44; yy < 146; yy += 6) for (let xx = 7 + ((yy / 6) % 2 ? 0 : 6); xx < 53; xx += 12) rect(ctx, xx, yy, 11, 5, (xx + yy) % 3 ? '#b8ab96' : '#9d8f7b');
    for (let i = 0; i < 30; i++) rect(ctx, 30 - 2 - i * 0.9, 4 + i, 4 + i * 1.8, 1, i % 3 ? '#2f4870' : '#3d5a8a');
    rect(ctx, 29, 0, 2, 5, '#ffd27a');
    rect(ctx, 4, 34, 52, 8, OUT); rect(ctx, 5, 35, 50, 6, '#cfc6e3');
    pixelEllipse(ctx, 30, 62, 16, 16, OUT); pixelEllipse(ctx, 30, 62, 15, 15, '#fff3e6'); pixelEllipse(ctx, 30, 62, 13, 13, '#fff8ea');
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; rect(ctx, Math.round(30 + Math.cos(a) * 12), Math.round(62 + Math.sin(a) * 12), 1, 1, OUT); }
    windowPane(ctx, 22, 92, 16, 20, OUT, '#5a3f8f');
    rect(ctx, 22, 122, 16, 26, OUT); rect(ctx, 23, 123, 14, 25, '#5a3a22'); pixelEllipse(ctx, 30, 123, 7, 4, '#5a3a22');
    rect(ctx, 24, 118, 12, 2, '#fff3e6');
  });
  const OLD = [
    { sign: 'ANTIQUES', wall: '#5a3f66', trim: '#ffd27a', glass: '#ffe3a0' },
    { sign: 'BOOKS', wall: '#2f5d4a', trim: '#f3e2c4', glass: '#ffe9c0' },
    { sign: 'BOUTIQUE', wall: '#b5323e', trim: '#fff3e6', glass: '#ffe1ec' },
  ];
  OLD.forEach((o, v) => {
    s[`oldshop${v}`] = sprite(factory, 68, 66, 34, 64, (ctx) => {
      shadow(ctx, 34, 62, 32);
      rect(ctx, 2, 4, 64, 60, OUT); rect(ctx, 3, 5, 62, 58, '#a89a86');
      for (let yy = 8; yy < 62; yy += 5) for (let xx = 3 + ((yy / 5) % 2 ? 0 : 5); xx < 65; xx += 10) rect(ctx, xx, yy, 9, 4, (xx + yy) % 3 ? '#b8ab96' : '#9d8f7b');
      rect(ctx, 6, 26, 56, 36, OUT); rect(ctx, 7, 27, 54, 35, o.wall);
      rect(ctx, 10, 18, 48, 8, OUT); drawSignText(ctx, o.sign, 34, 20, o.trim, OUT, 1);
      windowPane(ctx, 10, 32, 20, 18, OUT, o.glass);
      for (let i = 0; i < 4; i++) rect(ctx, 12 + i * 4, 44 - (i % 2) * 2, 3, 4 + (i % 2) * 2, ['#ffd27a', '#7fb2e6', '#cfc6e3', '#ff8fb1'][i]);
      rect(ctx, 40, 34, 16, 28, OUT); rect(ctx, 41, 35, 14, 27, shadeHex(o.wall)); rect(ctx, 43, 38, 10, 8, o.glass); rect(ctx, 52, 50, 1, 2, '#ffd27a');
      rect(ctx, 6, 8, 3, 4, '#ffd27a'); rect(ctx, 59, 8, 3, 4, '#ffd27a');
    });
  });
  s.librarybldg = sprite(factory, 136, 92, 68, 90, (ctx) => {
    shadow(ctx, 68, 88, 64);
    rect(ctx, 4, 24, 128, 64, OUT); rect(ctx, 5, 25, 126, 62, '#cfc6b0');
    for (let i = 0; i < 26; i++) rect(ctx, 68 - 4 - i * 2.5, i, 8 + i * 5, 1, i % 3 ? '#8a7da0' : '#6d6478');
    rect(ctx, 2, 24, 132, 4, '#e8e2d0');
    drawSignText(ctx, 'LIBRARY', 68, 14, '#2a1d2f', '#fff8ea', 1);
    for (const cx of [14, 34, 96, 116]) { rect(ctx, cx, 30, 8, 54, '#f4efe0'); rect(ctx, cx, 30, 2, 54, '#ffffff'); rect(ctx, cx + 6, 30, 2, 54, '#cfc6b0'); }
    for (const wx of [24, 104]) windowPane(ctx, wx, 36, 8, 18, OUT);
    rect(ctx, 54, 44, 28, 44, OUT); rect(ctx, 55, 45, 26, 43, '#5a3a22'); rect(ctx, 67, 45, 2, 43, OUT);
    rect(ctx, 0, 86, 136, 4, '#a89a86'); rect(ctx, 40, 82, 56, 4, '#b8ab96');
  });
  s.oldlamp = sprite(factory, 12, 32, 6, 31, (ctx) => {
    rect(ctx, 5, 8, 2, 23, '#2a2433'); rect(ctx, 3, 29, 6, 2, '#2a2433');
    rect(ctx, 2, 2, 8, 7, '#2a2433'); rect(ctx, 3, 3, 6, 5, '#ffd27a'); rect(ctx, 3, 3, 6, 1, '#fff3c4'); rect(ctx, 4, 0, 4, 2, '#2a2433');
  });
  s.well = sprite(factory, 24, 30, 12, 26, (ctx) => {
    shadow(ctx, 12, 26, 11);
    pixelEllipse(ctx, 12, 22, 10, 5, '#8a7da0'); pixelEllipse(ctx, 12, 21, 8, 3, '#1b2440');
    rect(ctx, 3, 4, 2, 18, '#5a3a22'); rect(ctx, 19, 4, 2, 18, '#5a3a22'); rect(ctx, 1, 2, 22, 3, '#7a3a1e');
    rect(ctx, 11, 5, 2, 8, '#e9dccf'); rect(ctx, 9, 13, 6, 4, '#8a5a3b');
  });
  // ---------------- rooftops ----------------
  s.chimney = sprite(factory, 22, 34, 11, 32, (ctx) => {
    shadow(ctx, 11, 31, 9);
    rect(ctx, 3, 8, 16, 24, OUT); rect(ctx, 4, 9, 14, 22, '#9a5340');
    for (let yy = 10; yy < 30; yy += 4) for (let xx = 4 + ((yy / 4) % 2 ? 0 : 3); xx < 18; xx += 6) rect(ctx, xx, yy, 5, 3, '#a85e48');
    rect(ctx, 2, 6, 18, 3, '#6b3a2e'); rect(ctx, 6, 3, 4, 4, '#5a5266'); rect(ctx, 12, 4, 4, 3, '#5a5266');
  });
  s.watertank = sprite(factory, 30, 46, 15, 44, (ctx) => {
    shadow(ctx, 15, 43, 12);
    for (const lx of [5, 23]) rect(ctx, lx, 26, 2, 18, '#5a3a22');
    rect(ctx, 3, 4, 24, 24, OUT); rect(ctx, 4, 5, 22, 22, '#8a5a3b'); for (let xx = 6; xx < 26; xx += 4) rect(ctx, xx, 5, 1, 22, '#6b4329');
    rect(ctx, 3, 10, 24, 1, '#2a2433'); rect(ctx, 3, 20, 24, 1, '#2a2433');
    for (let i = 0; i < 8; i++) rect(ctx, 15 - 2 - i * 1.5, i / 2, 4 + i * 3, 1, '#6b4329');
  });
  s.roofcafe = sprite(factory, 70, 40, 35, 36, (ctx) => {
    shadow(ctx, 35, 35, 32);
    rect(ctx, 4, 18, 62, 18, '#6b4329'); rect(ctx, 4, 18, 62, 2, '#9b6b43');
    for (let i = 0; i < 16; i++) { rect(ctx, 2 + i * 4, 4, 4, 8, i % 2 ? '#fff3e6' : '#ff8a35'); rect(ctx, 3 + i * 4, 12, 2, 1, i % 2 ? '#fff3e6' : '#ff8a35'); }
    rect(ctx, 4, 6, 2, 12, '#5a3a22'); rect(ctx, 64, 6, 2, 12, '#5a3a22');
    rect(ctx, 18, 21, 34, 7, OUT); drawSignText(ctx, 'ROOF CAFE', 35, 22, '#ffd27a', OUT, 1);
  });
  s.stringlights = sprite(factory, 140, 26, 70, 40, (ctx) => {
    for (let x = 0; x < 140; x++) rect(ctx, x, 4 + Math.round(Math.sin((x / 140) * Math.PI) * 10), 1, 1, '#3a2416');
    for (let i = 0; i < 16; i++) { const x = 4 + i * 8.5; const y = 5 + Math.round(Math.sin((x / 140) * Math.PI) * 10); rect(ctx, Math.round(x), y + 1, 2, 3, ['#ffd27a', '#ff8fb1', '#7ee0d2', '#ffe9a8'][i % 4]); }
  });
  // ---------------- interiors ----------------
  s.counter = sprite(factory, 68, 34, 34, 28, (ctx) => {
    shadow(ctx, 34, 27, 32);
    rect(ctx, 2, 10, 64, 18, OUT); rect(ctx, 3, 11, 62, 16, '#8a5a3b'); for (let xx = 6; xx < 64; xx += 8) rect(ctx, xx, 15, 1, 12, '#6b4329');
    rect(ctx, 0, 7, 68, 5, '#c99a6a'); rect(ctx, 0, 7, 68, 1, '#e0b88a');
    rect(ctx, 8, 2, 8, 6, '#cfc6e3'); rect(ctx, 10, 0, 4, 2, '#e9dccf');
    pixelEllipse(ctx, 50, 5, 4, 2, '#fff3e6'); rect(ctx, 48, 3, 4, 2, '#7fb2e6');
  });
  s.pastrycase = sprite(factory, 36, 30, 18, 28, (ctx) => {
    shadow(ctx, 18, 27, 16);
    rect(ctx, 2, 4, 32, 24, OUT); rect(ctx, 3, 5, 30, 22, '#cfe4ff'); rect(ctx, 3, 5, 30, 1, '#ffffff');
    for (let r2 = 0; r2 < 2; r2++) { rect(ctx, 3, 14 + r2 * 9, 30, 1, '#8a7da0'); for (let i = 0; i < 5; i++) pixelEllipse(ctx, 7 + i * 6, 11 + r2 * 9, 2, 2, ['#c99a6a', '#ff8fb1', '#ffd36b', '#e0b88a', '#fff3e6'][(i + r2) % 5]); }
  });
  s.bookcase = sprite(factory, 52, 52, 26, 50, (ctx) => {
    shadow(ctx, 26, 49, 24);
    rect(ctx, 1, 2, 50, 48, OUT); rect(ctx, 2, 3, 48, 46, '#6b4329');
    const cols = ['#e0475c', '#6b4fbf', '#ffc94a', '#4f9a67', '#7fb2e6', '#ff8a35', '#fff3e6', '#2f5d4a'];
    for (let sh = 0; sh < 4; sh++) {
      const sy = 5 + sh * 11;
      rect(ctx, 3, sy, 46, 9, '#3a2416');
      for (let x = 4, i = sh * 5; x < 46; i++) { const bw = 2 + (i % 3); rect(ctx, x, sy + 1 + (i % 2), Math.min(bw, 47 - x), 8 - (i % 2), cols[i % cols.length]); x += bw + (i % 7 === 0 ? 3 : 1); }
      rect(ctx, 3, sy + 9, 46, 2, '#9b6b43');
    }
  });
  s.readingtable = sprite(factory, 48, 30, 24, 22, (ctx) => {
    shadow(ctx, 24, 21, 22);
    rect(ctx, 1, 8, 46, 10, OUT); rect(ctx, 2, 9, 44, 8, '#7a512f'); rect(ctx, 2, 9, 44, 1, '#9b6b43');
    for (const lx of [4, 42]) rect(ctx, lx, 18, 2, 8, '#5a3a22');
    rect(ctx, 8, 6, 12, 4, '#fff3e6'); rect(ctx, 14, 6, 1, 4, '#cfc6b0');
    rect(ctx, 32, 0, 2, 9, '#2a2433'); rect(ctx, 28, 0, 10, 3, '#2f5d4a'); rect(ctx, 29, 3, 8, 1, '#ffd27a');
  });
  s.globe = sprite(factory, 16, 24, 8, 22, (ctx) => {
    rect(ctx, 6, 16, 4, 6, '#5a3a22'); rect(ctx, 3, 21, 10, 2, '#5a3a22');
    pixelEllipse(ctx, 8, 9, 6, 6, '#5d93c9'); pixelEllipse(ctx, 6, 7, 2, 3, '#7edb8c'); pixelEllipse(ctx, 10, 11, 2, 2, '#7edb8c'); rect(ctx, 1, 8, 14, 1, '#c99a3a');
  });
  s.windowseat = sprite(factory, 36, 34, 18, 30, (ctx) => {
    windowPane(ctx, 4, 0, 28, 16, '#6b4329', '#9cc3ff'); rect(ctx, 4, 16, 28, 2, '#6b4329');
    rect(ctx, 2, 20, 32, 10, OUT); rect(ctx, 3, 21, 30, 8, '#ff8fb1'); rect(ctx, 3, 21, 30, 1, '#ffb3c9');
    rect(ctx, 6, 18, 8, 4, '#fff3e6'); rect(ctx, 22, 18, 8, 4, '#c9bfe8');
  });
  // Milestone 8.2: the karaoke corner at The Purring Cup (a low stage, a mic stand and a song board)
  s.karaokestage = sprite(factory, 48, 44, 24, 40, (ctx) => {
    shadow(ctx, 24, 39, 22);
    rect(ctx, 2, 28, 44, 11, OUT); rect(ctx, 3, 29, 42, 9, '#8a5a3b'); rect(ctx, 3, 29, 42, 1, '#c99a6a');
    for (let xx = 6; xx < 44; xx += 7) rect(ctx, xx, 31, 1, 7, '#6b4329');
    for (let i = 0; i < 10; i++) rect(ctx, 4 + i * 4, 28, 2, 1, ['#ffd27a', '#ff8fb1', '#7ee0d2'][i % 3]); // footlights
    rect(ctx, 6, 2, 16, 14, OUT); rect(ctx, 7, 3, 14, 12, '#2a1d2f'); rect(ctx, 8, 5, 9, 1, '#ffd27a'); rect(ctx, 8, 8, 11, 1, '#fff3e6'); rect(ctx, 8, 11, 7, 1, '#ff8fb1');
    rect(ctx, 13, 16, 2, 12, '#5a3a22'); // board stand
    rect(ctx, 32, 12, 1, 17, '#2a2433'); rect(ctx, 29, 27, 7, 2, '#2a2433'); rect(ctx, 31, 9, 3, 4, '#cfc6e3'); rect(ctx, 31, 9, 3, 1, '#ffffff'); // mic
  });
  // showroom furniture: the exact home-catalogue art
  for (const d of SHOP_FURNITURE()) {
    const def = decorDef(d.id);
    const W = def.w * 24, H = def.h * 24;
    s[`decor:${d.id}`] = sprite(factory, W + 8, H + 40, (W + 8) / 2, H + 38, (ctx) => {
      drawDecor(ctx, d.id, { x: 4, y: 36, w: W, h: H }, 0, false, new Date(2026, 0, 1, 12));
    });
  }
}

/** Milestone 10: where a duck is at time t — a slow 10×4 px loop around its home spot (pure; tested to stay on water). */
export const DUCK_LOOP = { rx: 10, ry: 4 } as const;
export function duckPath(x: number, y: number, variant: number, t: number): { x: number; y: number; left: boolean } {
  const a = t * 0.25 + variant * 2.1;
  return { x: x + Math.round(Math.cos(a) * DUCK_LOOP.rx), y: y + Math.round(Math.sin(a) * DUCK_LOOP.ry), left: Math.cos(a + Math.PI / 2) < 0 };
}

/** Animated wildlife for the new districts (drawn per frame by regionRenderer). */
let cache: Record<string, PropSprite> | null = null;
export function setDistrictSpriteCache(s: Record<string, PropSprite>): void {
  cache = s;
}
function drawCached(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, flip: boolean): boolean {
  const sp = cache?.[key];
  if (!sp) return false;
  ctx.save();
  if (flip) { ctx.translate(Math.round(x) * 2, 0); ctx.scale(-1, 1); }
  ctx.drawImage(sp.canvas as unknown as CanvasImageSource, Math.round(x + sp.ox), Math.round(y + sp.oy));
  ctx.restore();
  return true;
}
export function drawDistrictDynamic(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, variant: number, time: number, still: boolean): boolean {
  const t = still ? 0 : time;
  if (kind === 'duck') {
    // Milestone 10: a small loop that stays inside the duck's own patch of water (see duckPath),
    // a gentle bob, and ripples spreading behind it.
    const p = duckPath(x, y, variant, t);
    const bob = still ? 0 : Math.round(Math.sin(t * 3 + variant) * 0.6);
    ctx.save();
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 2; i++) {
      const k = still ? 0.5 : ((t * 0.6 + i * 0.5 + variant * 0.3) % 1);
      ctx.strokeStyle = 'rgba(216,236,255,' + (0.6 * (1 - k)).toFixed(2) + ')';
      ctx.beginPath();
      ctx.ellipse(p.x + 0.5, p.y + 0.5, 5 + k * 6, 1.5 + k * 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    return drawCached(ctx, 'duck', p.x, p.y + bob, p.left);
  }
  if (kind === 'gull') return drawCached(ctx, 'gull', x, y + (!still && ((t + variant * 1.3) % 5) < 0.25 ? -2 : 0), variant === 1);
  return false;
}
