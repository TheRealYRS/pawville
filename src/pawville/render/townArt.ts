/**
 * Static pixel art for Pawville: ground tiles, buildings and prop sprites, drawn procedurally
 * from the town layout (no image files to load or lose). The static layer is rendered once.
 */
import { seededRandom } from '../world/geometry.ts';
import {
  BUILDINGS, GARDEN_RECT, Ground, LOT_RECT, MAP_COLS, MAP_ROWS, PLAZA_CENTER, PLAZA_RADIUS, RING_RECT, TILE, WORLD_H, WORLD_W,
  groundAt, type Building, type PropKind,
} from '../world/townMap.ts';
import { context2d, pixelEllipse, rect, type CanvasFactory, type CanvasLike } from './canvasTypes.ts';
import { drawSignText } from './pixelFont.ts';

export const COLORS = {
  grass: '#4e8c4a', grassLight: '#5f9f57', grassDark: '#427a40', tuft: '#6fb062',
  path: '#c9a27a', pathLight: '#d8b68e', pathDark: '#ab8560', pathEdge: '#9c7756',
  plazaA: '#b7aac8', plazaB: '#a596ba', plazaMortar: '#8a7da0', plazaRim: '#7d6f94',
  water: '#3a6ea8', waterDeep: '#31609a', foam: '#d8ecff',
  sand: '#e3c690', sandDark: '#cfae76',
  dock: '#9b6b43', dockDark: '#734d2c', dockLight: '#b5835a',
  dirt: '#9a7450', dirtDark: '#80603f', soil: '#5b3b2a',
  hill: '#68b05e', hillLight: '#86c876', meadow: '#58994f',
  warmLight: '#ffd27a',
};

const FLOWER_COLORS = ['#ff8fb1', '#ffd36b', '#fff3e6', '#b9a5ff', '#ff9d5c'];

function drawGroundTile(ctx: CanvasRenderingContext2D, ground: Uint8Array, col: number, row: number, rand: () => number) {
  const x = col * TILE;
  const y = row * TILE;
  const t = groundAt(ground, col, row);
  const nb = (dc: number, dr: number) => groundAt(ground, col + dc, row + dr);
  const grassy = (g: number) => g === Ground.Grass || g === Ground.Flowerbed || g === Ground.Meadow || g === Ground.Hill;
  switch (t) {
    case Ground.Grass:
    case Ground.Meadow:
    case Ground.Hill: {
      const base = t === Ground.Hill ? COLORS.hill : t === Ground.Meadow ? COLORS.meadow : (col + row) % 2 === 0 ? COLORS.grass : '#4b8847';
      rect(ctx, x, y, TILE, TILE, base);
      for (let i = 0; i < 5; i++) rect(ctx, x + Math.floor(rand() * 15), y + Math.floor(rand() * 15), 1, 1, rand() < 0.5 ? COLORS.grassLight : COLORS.grassDark);
      if (t === Ground.Hill) for (let i = 0; i < 3; i++) rect(ctx, x + Math.floor(rand() * 13), y + Math.floor(rand() * 15), 3, 1, COLORS.hillLight);
      if (rand() < 0.35) {
        const tx = x + 2 + Math.floor(rand() * 11);
        const ty = y + 4 + Math.floor(rand() * 9);
        rect(ctx, tx, ty, 1, 2, COLORS.tuft);
        rect(ctx, tx + 2, ty - 1, 1, 3, COLORS.tuft);
        rect(ctx, tx + 1, ty + 1, 1, 1, COLORS.grassDark);
      }
      if (rand() < (t === Ground.Meadow ? 0.45 : 0.1)) {
        const fx = x + 3 + Math.floor(rand() * 10);
        const fy = y + 3 + Math.floor(rand() * 10);
        const c = FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)];
        rect(ctx, fx - 1, fy, 3, 1, c);
        rect(ctx, fx, fy - 1, 1, 3, c);
        rect(ctx, fx, fy, 1, 1, '#ffe27a');
      }
      return;
    }
    case Ground.Path: {
      rect(ctx, x, y, TILE, TILE, COLORS.path);
      for (let i = 0; i < 6; i++) rect(ctx, x + 1 + Math.floor(rand() * 13), y + 1 + Math.floor(rand() * 13), 2, 1, rand() < 0.5 ? COLORS.pathLight : COLORS.pathDark);
      const edge = (dc: number, dr: number) => grassy(nb(dc, dr));
      if (edge(0, -1)) { rect(ctx, x, y, TILE, 1, COLORS.pathEdge); for (let i = 0; i < TILE; i += 3) rect(ctx, x + i + (row % 2), y, 1, 1 + ((i + col) % 2), COLORS.grassDark); }
      if (edge(0, 1)) rect(ctx, x, y + TILE - 1, TILE, 1, COLORS.pathEdge);
      if (edge(-1, 0)) rect(ctx, x, y, 1, TILE, COLORS.pathEdge);
      if (edge(1, 0)) rect(ctx, x + TILE - 1, y, 1, TILE, COLORS.pathEdge);
      return;
    }
    case Ground.Plaza: {
      const onRoad = (row >= 19 && row <= 20) || (col >= 23 && col <= 24);
      rect(ctx, x, y, TILE, TILE, onRoad ? COLORS.path : COLORS.grass);
      return;
    }
    case Ground.Water: {
      rect(ctx, x, y, TILE, TILE, (row + Math.floor(col / 2)) % 3 === 0 ? COLORS.waterDeep : COLORS.water);
      if (rand() < 0.4) rect(ctx, x + Math.floor(rand() * 10), y + Math.floor(rand() * 14), 4, 1, '#4c82bd');
      if (nb(-1, 0) === Ground.Sand) { rect(ctx, x, y, 2, TILE, '#5d93c9'); rect(ctx, x, y + (row % 4) * 3, 1, 3, COLORS.foam); }
      if (grassy(nb(0, -1))) rect(ctx, x, y, TILE, 2, '#3f7a3c');
      if (grassy(nb(-1, 0))) rect(ctx, x, y, 2, TILE, '#3f7a3c');
      if (grassy(nb(1, 0))) rect(ctx, x + TILE - 2, y, 2, TILE, '#3f7a3c');
      if (grassy(nb(0, 1))) rect(ctx, x, y + TILE - 2, TILE, 2, '#3f7a3c');
      return;
    }
    case Ground.Sand: {
      rect(ctx, x, y, TILE, TILE, COLORS.sand);
      for (let i = 0; i < 6; i++) rect(ctx, x + Math.floor(rand() * 15), y + Math.floor(rand() * 15), 1, 1, COLORS.sandDark);
      if (nb(-1, 0) === Ground.Grass || nb(-1, 0) === Ground.Path) { rect(ctx, x, y, 2, TILE, '#c6b36f'); rect(ctx, x, y + (row % 3) * 4, 1, 2, COLORS.grassDark); }
      return;
    }
    case Ground.Dock: {
      rect(ctx, x, y, TILE, TILE, COLORS.dock);
      for (let i = 0; i < TILE; i += 4) rect(ctx, x + i, y, 1, TILE, COLORS.dockDark);
      rect(ctx, x, y, TILE, 1, COLORS.dockLight);
      if (row === 23) { rect(ctx, x, y + TILE - 2, TILE, 2, COLORS.dockDark); if (col % 2 === 0) rect(ctx, x + 2, y + TILE - 2, 3, 4, '#5a3a20'); }
      if (row === 22 && col % 2 === 1) rect(ctx, x + 6, y - 2, 3, 3, '#5a3a20');
      return;
    }
    case Ground.Dirt: {
      rect(ctx, x, y, TILE, TILE, COLORS.dirt);
      for (let i = 0; i < 7; i++) rect(ctx, x + Math.floor(rand() * 15), y + Math.floor(rand() * 15), 2, 1, COLORS.dirtDark);
      return;
    }
    case Ground.Soil: {
      rect(ctx, x, y, TILE, TILE, COLORS.soil);
      for (let i = 0; i < TILE; i += 4) rect(ctx, x, y + i + 1, TILE, 1, '#4a2f20');
      return;
    }
    case Ground.Flowerbed: {
      rect(ctx, x, y, TILE, TILE, COLORS.soil);
      for (let i = 0; i < 6; i++) {
        const fx = x + 2 + Math.floor(rand() * 12);
        const fy = y + 2 + Math.floor(rand() * 12);
        rect(ctx, fx, fy + 1, 1, 2, '#3f7a3c');
        const c = FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)];
        rect(ctx, fx - 1, fy, 3, 1, c);
        rect(ctx, fx, fy - 1, 1, 1, c);
      }
      return;
    }
  }
}

function drawPlaza(ctx: CanvasRenderingContext2D, rand: () => number) {
  const { x: cx, y: cy } = PLAZA_CENTER;
  const r = PLAZA_RADIUS;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.round(Math.sqrt(r * r - dy * dy));
    const y = cy + dy;
    for (let x = cx - half; x < cx + half; x++) {
      const tx = Math.floor((x - cx + 1000) / 8);
      const ty = Math.floor((y - cy + 1000) / 8);
      const mortar = (x - cx + 1000) % 8 === 7 || (y - cy + 1000) % 8 === 7;
      ctx.fillStyle = mortar ? COLORS.plazaMortar : (tx + ty * 2) % 3 === 0 ? COLORS.plazaB : COLORS.plazaA;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  for (let i = 0; i < 90; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * (r - 6);
    rect(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, 1, '#c9bfe0');
  }
  for (let a = 0; a < 360; a += 3) {
    const rad = (a * Math.PI) / 180;
    rect(ctx, Math.round(cx + Math.cos(rad) * (r + 1)) - 1, Math.round(cy + Math.sin(rad) * (r + 1)) - 1, 3, 3, COLORS.plazaRim);
  }
  const paw = (px: number, py: number) => {
    pixelEllipse(ctx, px, py + 2, 3, 2, '#d9cfee');
    rect(ctx, px - 4, py - 3, 2, 2, '#d9cfee');
    rect(ctx, px - 1, py - 5, 2, 2, '#d9cfee');
    rect(ctx, px + 2, py - 3, 2, 2, '#d9cfee');
  };
  paw(cx - 52, cy - 30);
  paw(cx + 52, cy + 34);
  paw(cx + 50, cy - 34);
  paw(cx - 50, cy + 38);
}

function window2(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frame: string, glass: string) {
  rect(ctx, x - 1, y - 1, w + 2, h + 2, frame);
  rect(ctx, x, y, w, h, glass);
  rect(ctx, x, y, w, 1, '#fff2c8');
  rect(ctx, x + Math.floor(w / 2), y, 1, h, frame);
}

function door(ctx: CanvasRenderingContext2D, b: Building, frame: string, panel: string, glow: string) {
  const { x, y, w, h } = b.door;
  rect(ctx, x - 2, y - 2, w + 4, h + 2, frame);
  rect(ctx, x, y, w, h, panel);
  rect(ctx, x + 2, y + 3, w / 2 - 3, h - 8, glow);
  rect(ctx, x + w / 2 + 1, y + 3, w / 2 - 3, h - 8, glow);
  rect(ctx, x + w / 2 - 1, y, 2, h, frame);
  rect(ctx, x + w / 2 - 4, y + h / 2 + 2, 2, 2, '#ffd27a');
  rect(ctx, x + w / 2 + 2, y + h / 2 + 2, 2, 2, '#ffd27a');
  rect(ctx, x - 2, b.rect.y + b.rect.h, w + 4, 3, '#8d4b3b');
  rect(ctx, x, b.rect.y + b.rect.h + 1, w, 1, '#b5634e');
}

function drawArcade(ctx: CanvasRenderingContext2D, b: Building) {
  const { x, y, w, h } = b.rect;
  const roofH = 40;
  rect(ctx, x, y + roofH, w, h - roofH, '#4b3a78');
  for (let i = x; i < x + w; i += 8) rect(ctx, i, y + roofH, 1, h - roofH, '#433370');
  rect(ctx, x, y + h - 6, w, 6, '#36295e');
  rect(ctx, x - 3, y + 4, w + 6, roofH - 4, '#2c2246');
  rect(ctx, x - 3, y + 4, w + 6, 2, '#5a4790');
  rect(ctx, x + 30, y - 2, w - 60, 30, '#1b1530');
  rect(ctx, x + 32, y, w - 64, 26, '#241b3d');
  drawSignText(ctx, b.sign, x + w / 2, y + 7, '#ff8a35', '#5a2a0e', 2);
  for (let i = 0; i < w + 6; i += 8) {
    rect(ctx, x - 3 + i, y + roofH - 2, 4, 8, '#ff8a35');
    rect(ctx, x + 1 + i, y + roofH - 2, 4, 8, '#ffe9cf');
    rect(ctx, x - 3 + i, y + roofH + 6, 4, 2, '#d9631a');
  }
  for (const wx of [x + 12, x + w - 56]) {
    window2(ctx, wx, y + 58, 44, 26, '#2c2246', '#ffcf8a');
    rect(ctx, wx + 6, y + 64, 8, 20, '#6b4fbf');
    rect(ctx, wx + 7, y + 66, 6, 5, '#7ed6f6');
    rect(ctx, wx + 28, y + 64, 8, 20, '#e0475c');
    rect(ctx, wx + 29, y + 66, 6, 5, '#7edb8c');
  }
  door(ctx, b, '#2c2246', '#5a3f8f', '#ffd9a0');
}

/**
 * Milestone 7: Pawville Station (replaces the old Typing Arena — PawType now lives in the arcades).
 * Same footprint and door, so collision and walkability are unchanged.
 */
function drawStation(ctx: CanvasRenderingContext2D, b: Building) {
  const { x, y, w, h } = b.rect;
  const roofH = 36;
  // brick walls
  rect(ctx, x, y + roofH, w, h - roofH, '#9a5340');
  for (let by = y + roofH; by < y + h - 6; by += 4) for (let bx = x + ((by / 4) % 2 ? 0 : 4); bx < x + w; bx += 8) rect(ctx, bx, by, 7, 3, (bx + by) % 3 ? '#a85e48' : '#8d4b3b');
  rect(ctx, x, y + h - 6, w, 6, '#6b3a2e');
  // a deep green canopy roof with a clock gable
  rect(ctx, x - 4, y + 6, w + 8, roofH - 4, '#2f5d4a');
  for (let i = 0; i < w + 8; i += 6) rect(ctx, x - 4 + i, y + 8, 3, roofH - 8, '#386c56');
  rect(ctx, x - 4, y + roofH, w + 8, 3, '#1f4033');
  for (let i = 0; i < w + 8; i += 8) { rect(ctx, x - 4 + i, y + roofH + 3, 4, 3, '#f3e2c4'); }
  rect(ctx, x + w / 2 - 14, y - 6, 28, 16, '#2f5d4a');
  pixelEllipse(ctx, x + w / 2, y + 2, 7, 7, '#f3e2c4');
  pixelEllipse(ctx, x + w / 2, y + 2, 6, 6, '#fff8ea');
  rect(ctx, x + w / 2, y - 3, 1, 5, '#2a1d2f'); rect(ctx, x + w / 2, y + 2, 4, 1, '#2a1d2f');
  // sign
  rect(ctx, x + w / 2 - 30, y + roofH + 8, 60, 12, '#1f4033');
  drawSignText(ctx, b.sign, x + w / 2, y + roofH + 11, '#ffd27a', '#0e2219', 1);
  // arched windows with warm light
  for (const wx of [x + 10, x + w - 36]) {
    window2(ctx, wx, y + 62, 26, 20, '#5a2e22', '#ffe3a0');
    rect(ctx, wx + 4, y + 60, 18, 2, '#5a2e22');
  }
  // timetable board
  rect(ctx, x + w / 2 - 34, y + 64, 12, 14, '#1b1530'); rect(ctx, x + w / 2 - 33, y + 66, 10, 1, '#ffc94a'); rect(ctx, x + w / 2 - 33, y + 69, 8, 1, '#7ee0d2'); rect(ctx, x + w / 2 - 33, y + 72, 9, 1, '#ffc94a');
  door(ctx, b, '#5a2e22', '#2f5d4a', '#ffe3a0');
}

function drawHarbor(ctx: CanvasRenderingContext2D, b: Building) {
  const { x, y, w, h } = b.rect;
  const roofH = 40;
  rect(ctx, x, y + roofH, w, h - roofH, '#8a5a3b');
  for (let py = y + roofH; py < y + h; py += 5) rect(ctx, x, py, w, 1, '#6f4529');
  rect(ctx, x - 4, y + 2, w + 8, roofH, '#3d5a8a');
  for (let ry = y + 6; ry < y + roofH; ry += 6) {
    for (let rx = x - 4 + ((ry / 6) % 2) * 4; rx < x + w + 4; rx += 8) rect(ctx, rx, ry, Math.min(7, x + w + 4 - rx), 1, '#2f4870');
  }
  rect(ctx, x - 4, y + 2, w + 8, 2, '#5876a8');
  rect(ctx, x + w / 2 - 28, y + roofH - 5, 56, 13, '#f3e2c4');
  rect(ctx, x + w / 2 - 28, y + roofH + 7, 56, 1, '#6f4529');
  drawSignText(ctx, b.sign, x + w / 2, y + roofH - 2, '#2f4870', '#d6c2a0', 1);
  pixelEllipse(ctx, x + 22, y + 66, 9, 9, '#3a2a1e');
  pixelEllipse(ctx, x + 22, y + 66, 7, 7, '#ffe3a0');
  pixelEllipse(ctx, x + w - 22, y + 66, 8, 8, '#e0475c');
  pixelEllipse(ctx, x + w - 22, y + 66, 5, 5, '#8a5a3b');
  rect(ctx, x + w - 30, y + 65, 3, 3, '#fff3e6');
  rect(ctx, x + w - 17, y + 65, 3, 3, '#fff3e6');
  door(ctx, b, '#4a2f1c', '#6b4329', '#ffe3a0');
}

function drawGreenhouse(ctx: CanvasRenderingContext2D, b: Building) {
  const { x, y, w, h } = b.rect;
  rect(ctx, x, y + 18, w, h - 18, '#a8dcd6');
  const rand = seededRandom(77);
  for (let i = 0; i < 18; i++) {
    const px = x + 6 + Math.floor(rand() * (w - 14));
    const py = y + 40 + Math.floor(rand() * (h - 52));
    pixelEllipse(ctx, px, py, 5, 4, i % 3 === 0 ? '#3f7a3c' : '#56a050');
    if (i % 2 === 0) rect(ctx, px - 1, py - 3, 3, 3, FLOWER_COLORS[i % FLOWER_COLORS.length]);
  }
  for (let i = 0; i < 20; i++) rect(ctx, x + w / 2 - (i * w) / 40, y + i, (i * w) / 20, 1, i % 4 === 0 ? '#f2fbff' : '#c4ebe6');
  for (let fx = x; fx <= x + w; fx += 16) rect(ctx, Math.min(fx, x + w - 2), y + 18, 2, h - 18, '#f2fbff');
  for (let fy = y + 18; fy < y + h; fy += 18) rect(ctx, x, fy, w, 2, '#f2fbff');
  rect(ctx, x, y + h - 4, w, 4, '#8a7d6b');
  rect(ctx, x + w / 2 - 22, y + 22, 44, 11, '#7a512f');
  drawSignText(ctx, b.sign, x + w / 2, y + 25, '#ffe9cf', '#3a2716', 1);
  door(ctx, b, '#f2fbff', '#b9e6df', '#e9fffb');
}

/** The couple home: a little plum cottage with an orange roof and a heart window. */
function drawHome(ctx: CanvasRenderingContext2D, b: Building) {
  const { x, y, w, h } = b.rect;
  const roofH = 36;
  rect(ctx, x + 4, y + roofH, w - 8, h - roofH, '#e9dccf');
  for (let py = y + roofH + 4; py < y + h; py += 6) rect(ctx, x + 4, py, w - 8, 1, '#d6c6b6');
  for (let i = 0; i < roofH; i++) {
    const inset = Math.max(0, roofH - i - 10);
    rect(ctx, x - 2 + inset * 0.6, y + i, w + 4 - inset * 1.2, 1, i % 6 === 0 ? '#d9631a' : '#ff8a35');
  }
  rect(ctx, x - 4, y + roofH - 2, w + 8, 3, '#b54f14');
  rect(ctx, x + w - 34, y + 2, 10, 18, '#7a512f');
  rect(ctx, x + w - 36, y, 14, 3, '#5a3a22');
  window2(ctx, x + 14, y + roofH + 10, 24, 18, '#7a512f', '#ffd9a0');
  window2(ctx, x + w - 38, y + roofH + 10, 24, 18, '#7a512f', '#ffd9a0');
  // heart window in the gable
  const hx = x + w / 2;
  const hy = y + 14;
  rect(ctx, hx - 5, hy, 4, 3, '#ff6fa1'); rect(ctx, hx + 1, hy, 4, 3, '#ff6fa1');
  rect(ctx, hx - 5, hy + 3, 10, 2, '#ff6fa1'); rect(ctx, hx - 3, hy + 5, 6, 2, '#ff6fa1'); rect(ctx, hx - 1, hy + 7, 2, 1, '#ff6fa1');
  rect(ctx, x + 12, y + h - 8, 14, 6, '#4f9a67'); rect(ctx, x + 14, y + h - 10, 3, 2, '#ff8fb1'); rect(ctx, x + 20, y + h - 10, 3, 2, '#ffd36b');
  rect(ctx, x + w - 26, y + h - 8, 14, 6, '#4f9a67'); rect(ctx, x + w - 22, y + h - 10, 3, 2, '#fff3e6');
  door(ctx, b, '#7a512f', '#a8754f', '#ffe3a0');
}

function drawBuilding(ctx: CanvasRenderingContext2D, b: Building) {
  // Soft ambient occlusion where the building meets the ground (layered, fading out) and a cast
  // shadow to the lower right — grounds the facades without heavy effects.
  const { x, y, w, h } = b.rect;
  for (const [dy, a] of [[0, 0.3], [2, 0.18], [4, 0.1], [6, 0.05]] as const) {
    ctx.fillStyle = `rgba(20, 12, 30, ${a})`;
    ctx.fillRect(x + 2 + dy, y + h + dy, w - 2, 2);
  }
  ctx.fillStyle = 'rgba(20, 12, 30, 0.12)';
  ctx.fillRect(x + w, y + 10, 5, h - 6);
  if (b.style === 'arcade') drawArcade(ctx, b);
  else if (b.style === 'station') drawStation(ctx, b);
  else if (b.style === 'harbor') drawHarbor(ctx, b);
  else if (b.style === 'home') drawHome(ctx, b);
  else drawGreenhouse(ctx, b);
}

export function renderStaticWorld(factory: CanvasFactory, ground: Uint8Array): CanvasLike {
  const canvas = factory(WORLD_W, WORLD_H);
  const ctx = context2d(canvas);
  const rand = seededRandom(1234);
  for (let r = 0; r < MAP_ROWS; r++) for (let c = 0; c < MAP_COLS; c++) drawGroundTile(ctx, ground, c, r, rand);
  drawPlaza(ctx, rand);
  // garden plot rows
  for (let i = 0; i < 6; i++) rect(ctx, GARDEN_RECT.x + 6 + i * 15, GARDEN_RECT.y + 4, 9, GARDEN_RECT.h - 8, '#4a2f20');
  for (const b of BUILDINGS) drawBuilding(ctx, b);
  return canvas;
}

export interface PropSprite {
  canvas: CanvasLike;
  ox: number;
  oy: number;
}

function sprite(factory: CanvasFactory, w: number, h: number, ax: number, ay: number, draw: (ctx: CanvasRenderingContext2D) => void): PropSprite {
  const canvas = factory(w, h);
  draw(context2d(canvas));
  return { canvas, ox: -ax, oy: -ay };
}

function treeSprite(factory: CanvasFactory, variant: number, apples = false): PropSprite {
  const greens = [
    ['#2f6b3a', '#3e8a45', '#5aa955', '#86c76c'],
    ['#2d5f45', '#3a7a55', '#4f9a67', '#7cc08a'],
    ['#4a6b2c', '#5f8a35', '#7aa845', '#a3c96a'],
  ][variant % 3];
  return sprite(factory, 28, 34, 14, 33, (ctx) => {
    pixelEllipse(ctx, 14, 31, 9, 2, 'rgba(20,12,30,0.3)');
    rect(ctx, 12, 22, 4, 10, '#6b4329');
    rect(ctx, 12, 22, 1, 10, '#80553a');
    pixelEllipse(ctx, 14, 13, 12, 11, greens[0]);
    pixelEllipse(ctx, 13, 12, 11, 10, greens[1]);
    pixelEllipse(ctx, 12, 10, 8, 7, greens[2]);
    pixelEllipse(ctx, 10, 7, 4, 3, greens[3]);
    rect(ctx, 18, 15, 2, 2, greens[3]);
    rect(ctx, 7, 16, 2, 1, greens[2]);
    if (variant === 2 || apples) for (const [ax, ay] of [[16, 9], [9, 14], [19, 12], [6, 9], [13, 17]]) rect(ctx, ax, ay, 2, 2, '#e0475c');
  });
}

function pineSprite(factory: CanvasFactory, variant: number): PropSprite {
  const g = variant % 2 === 0 ? ['#1f4f3a', '#2c6b4c', '#4b9466'] : ['#244a3f', '#336356', '#56907c'];
  return sprite(factory, 22, 36, 11, 35, (ctx) => {
    pixelEllipse(ctx, 11, 33, 7, 2, 'rgba(20,12,30,0.3)');
    rect(ctx, 10, 27, 3, 7, '#5a3a22');
    for (let layer = 0; layer < 3; layer++) {
      const top = 2 + layer * 8;
      for (let i = 0; i < 12; i++) {
        const half = Math.floor((i * (6 + layer * 2)) / 11);
        rect(ctx, 11 - half, top + i, half * 2 + 1, 1, i < 2 ? g[2] : g[layer === 2 ? 0 : 1]);
        if (half > 1) rect(ctx, 11 - half, top + i, 1, 1, g[2]);
      }
    }
  });
}

export function buildPropSprites(factory: CanvasFactory): Record<string, PropSprite> {
  const s: Record<string, PropSprite> = {};
  for (let v = 0; v < 3; v++) s[`tree${v}`] = treeSprite(factory, v);
  for (let v = 0; v < 3; v++) s[`pine${v}`] = pineSprite(factory, v);
  s.appletree = treeSprite(factory, 0, true);
  s.bush0 = sprite(factory, 18, 14, 9, 13, (ctx) => {
    pixelEllipse(ctx, 9, 12, 8, 2, 'rgba(20,12,30,0.3)');
    pixelEllipse(ctx, 9, 7, 8, 6, '#3e7d41');
    pixelEllipse(ctx, 8, 6, 6, 4, '#58a054');
    rect(ctx, 5, 4, 2, 2, '#ff8fb1');
    rect(ctx, 11, 7, 2, 2, '#ffd36b');
  });
  s.bush1 = s.bush0;
  s.lamp = sprite(factory, 10, 26, 5, 25, (ctx) => {
    rect(ctx, 3, 24, 4, 2, '#1e1626');
    rect(ctx, 4, 6, 2, 19, '#2b2236');
    rect(ctx, 4, 6, 1, 19, '#43375a');
    rect(ctx, 1, 1, 8, 6, '#2b2236');
    rect(ctx, 2, 2, 6, 4, COLORS.warmLight);
    rect(ctx, 2, 2, 6, 1, '#fff2c8');
    rect(ctx, 3, 0, 4, 1, '#2b2236');
  });
  s.bench = sprite(factory, 28, 16, 14, 15, (ctx) => {
    pixelEllipse(ctx, 14, 14, 12, 2, 'rgba(20,12,30,0.3)');
    rect(ctx, 2, 0, 24, 3, '#9b6b43');
    rect(ctx, 2, 0, 24, 1, '#b5835a');
    rect(ctx, 2, 6, 24, 4, '#9b6b43');
    rect(ctx, 2, 6, 24, 1, '#b5835a');
    rect(ctx, 4, 3, 2, 12, '#3b2b3f');
    rect(ctx, 22, 3, 2, 12, '#3b2b3f');
  });
  // Milestone 10: the same bench seen from behind (backrest nearest the camera) for benches facing north
  s.benchBack = sprite(factory, 28, 16, 14, 15, (ctx) => {
    pixelEllipse(ctx, 14, 14, 12, 2, 'rgba(20,12,30,0.3)');
    rect(ctx, 2, 2, 24, 3, '#8a5d3a');
    rect(ctx, 2, 2, 24, 1, '#b5835a');
    rect(ctx, 4, 5, 2, 10, '#3b2b3f');
    rect(ctx, 22, 5, 2, 10, '#3b2b3f');
    rect(ctx, 2, 7, 24, 4, '#9b6b43');
    rect(ctx, 2, 7, 24, 1, '#c99a6a');
    rect(ctx, 2, 10, 24, 1, '#6b4329');
  });
  s.board = sprite(factory, 34, 34, 17, 33, (ctx) => {
    pixelEllipse(ctx, 17, 32, 14, 2, 'rgba(20,12,30,0.3)');
    rect(ctx, 4, 20, 3, 13, '#5a3a22');
    rect(ctx, 27, 20, 3, 13, '#5a3a22');
    rect(ctx, 1, 4, 32, 20, '#6b4329');
    rect(ctx, 3, 6, 28, 16, '#c8935a');
    rect(ctx, 1, 0, 32, 6, '#4a2f1c');
    drawSignText(ctx, 'EVENTS', 17, 0, '#ffc94a', '#2a1203', 1);
    rect(ctx, 5, 8, 8, 6, '#fff3e6'); rect(ctx, 6, 10, 6, 1, '#b9aec6'); rect(ctx, 6, 12, 4, 1, '#b9aec6');
    rect(ctx, 15, 8, 7, 9, '#ff8fb1'); rect(ctx, 16, 10, 5, 1, '#c93d74');
    rect(ctx, 24, 9, 6, 6, '#a8dcd6'); rect(ctx, 25, 11, 4, 1, '#2f6f73');
    rect(ctx, 6, 16, 8, 4, '#ffd36b');
  });
  s.signpost = sprite(factory, 40, 26, 20, 25, (ctx) => {
    rect(ctx, 18, 10, 4, 16, '#5a3a22');
    rect(ctx, 0, 0, 40, 12, '#4a2f1c');
    rect(ctx, 1, 1, 38, 10, '#9b6b43');
    drawSignText(ctx, 'PAWVILLE', 20, 3, '#fff3e6', '#4a2f1c', 1);
  });
  s.barrel0 = sprite(factory, 12, 14, 6, 13, (ctx) => {
    rect(ctx, 1, 1, 10, 12, '#8a5a3b');
    rect(ctx, 1, 3, 10, 1, '#3b2b3f'); rect(ctx, 1, 9, 10, 1, '#3b2b3f');
    rect(ctx, 2, 0, 8, 2, '#a8754f'); rect(ctx, 2, 1, 2, 11, '#a8754f');
  });
  s.barrel1 = s.barrel0;
  s.crate = sprite(factory, 14, 14, 7, 13, (ctx) => {
    rect(ctx, 1, 1, 12, 12, '#b5835a');
    rect(ctx, 1, 1, 12, 1, '#d4a679'); rect(ctx, 1, 12, 12, 1, '#734d2c');
    rect(ctx, 1, 1, 1, 12, '#734d2c'); rect(ctx, 12, 1, 1, 12, '#734d2c');
    for (let i = 0; i < 10; i++) rect(ctx, 2 + i, 2 + i, 1, 1, '#8a5a3b');
  });
  s.lot = sprite(factory, LOT_RECT.w + 4, LOT_RECT.h + 22, LOT_RECT.w / 2 + 2, LOT_RECT.h + 14, (ctx) => {
    const W = LOT_RECT.w;
    const H = LOT_RECT.h;
    const top = 14;
    rect(ctx, 22, top + 8, W - 44, 34, '#4b3a78');
    rect(ctx, 22, top + 8, W - 44, 2, '#5a4790');
    rect(ctx, 18, top + 2, W - 36, 10, '#ff8a35');
    for (let i = 0; i < W - 36; i += 8) rect(ctx, 18 + i, top + 2, 4, 10, '#ffe9cf');
    for (let i = 0; i < 4; i++) {
      const bx = 30 + i * 14;
      rect(ctx, bx, top + 30, 10, 8, '#b5835a');
      rect(ctx, bx, top + 30, 10, 1, '#d4a679');
      if (i % 2 === 0) {
        const c = i === 0 ? '#ff8a35' : '#252031';
        rect(ctx, bx + 2, top + 25, 6, 5, c); rect(ctx, bx + 2, top + 23, 2, 2, c); rect(ctx, bx + 6, top + 23, 2, 2, c);
      }
    }
    for (let fx = 2; fx < W + 2; fx += 6) {
      rect(ctx, fx, top - 2, 2, 8, '#d9b08c');
      if (fx < W / 2 - 14 || fx > W / 2 + 14) rect(ctx, fx, top + H - 8, 2, 10, '#d9b08c');
    }
    rect(ctx, 2, top, W, 2, '#b98a64');
    rect(ctx, 2, top + H - 4, W / 2 - 16, 2, '#b98a64');
    rect(ctx, W / 2 + 18, top + H - 4, W / 2 - 16, 2, '#b98a64');
    rect(ctx, 2, top - 2, 2, H, '#b98a64');
    rect(ctx, W, top - 2, 2, H, '#b98a64');
    rect(ctx, W / 2 - 18, top + H - 22, 40, 13, '#ffc94a');
    rect(ctx, W / 2 - 17, top + H - 21, 38, 11, '#2a1d2f');
    drawSignText(ctx, 'WHACK', W / 2 + 2, top + H - 18, '#ffc94a', '#000000', 1);
  });
  s.boat = sprite(factory, 34, 30, 17, 26, (ctx) => {
    rect(ctx, 16, 2, 2, 18, '#5a3a22');
    for (let i = 0; i < 14; i++) rect(ctx, 18, 3 + i, Math.floor(i * 0.9), 1, i % 5 === 0 ? '#ffe9cf' : '#fff3e6');
    rect(ctx, 2, 20, 30, 3, '#e0475c');
    rect(ctx, 4, 23, 26, 3, '#8a5a3b');
    rect(ctx, 7, 26, 20, 2, '#6b4329');
  });
  s.napcat = sprite(factory, 16, 10, 8, 9, (ctx) => {
    pixelEllipse(ctx, 8, 6, 7, 3, '#4a4458');
    pixelEllipse(ctx, 8, 5, 6, 3, '#8e88a0');
    rect(ctx, 2, 3, 2, 2, '#8e88a0'); rect(ctx, 2, 2, 1, 1, '#8e88a0'); rect(ctx, 5, 2, 1, 1, '#8e88a0');
    rect(ctx, 3, 5, 2, 1, '#2a1d2f');
    rect(ctx, 9, 4, 4, 1, '#6f6981'); rect(ctx, 11, 6, 3, 1, '#6f6981');
    rect(ctx, 13, 7, 2, 1, '#c9c3d8');
  });
  // ---------------- Milestone 3 props ----------------
  s.ring = sprite(factory, RING_RECT.w + 8, RING_RECT.h + 18, RING_RECT.w / 2 + 4, RING_RECT.h + 12, (ctx) => {
    const W = RING_RECT.w;
    const H = RING_RECT.h;
    rect(ctx, 4, 16, W, H - 8, '#4b3a78');
    rect(ctx, 6, 18, W - 4, H - 12, '#5a4790');
    for (let i = 0; i < W - 4; i += 12) rect(ctx, 6 + i, 18, 6, H - 12, '#53418a');
    pixelEllipse(ctx, 4 + W / 2, 16 + (H - 8) / 2, 10, 6, '#6b55a8');
    for (const [cx, cc] of [[4, '#ff8a35'], [W + 2, '#a89bc9']] as const) {
      rect(ctx, cx, 6, 3, H + 4, '#2c2246');
      rect(ctx, cx - 1, 4, 5, 4, cc);
    }
    for (const ry of [10, 16]) { rect(ctx, 4, ry, W + 1, 1, '#ffe9cf'); rect(ctx, 4, ry + H - 6, W + 1, 1, '#ffe9cf'); }
    rect(ctx, W / 2 - 12, H + 8, 32, 9, '#2a1d2f');
    drawSignText(ctx, 'BOX', W / 2 + 4, H + 10, '#ffc94a', '#000', 1);
  });
  s.claw = sprite(factory, 18, 30, 9, 29, (ctx) => {
    rect(ctx, 1, 2, 16, 27, '#e0475c'); rect(ctx, 1, 2, 16, 2, '#ff8fa3');
    rect(ctx, 3, 5, 12, 12, '#bfe1ff'); rect(ctx, 4, 13, 3, 3, '#ff8a35'); rect(ctx, 8, 14, 3, 2, '#c9bfe8'); rect(ctx, 11, 13, 3, 3, '#ffd36b');
    rect(ctx, 8, 5, 1, 4, '#5a3a22'); rect(ctx, 7, 9, 3, 1, '#5a3a22');
    rect(ctx, 3, 19, 12, 4, '#8a2638'); rect(ctx, 5, 20, 2, 2, '#ffc94a');
  });
  s.vending = sprite(factory, 18, 28, 9, 27, (ctx) => {
    rect(ctx, 1, 1, 16, 26, '#3d5a8a'); rect(ctx, 1, 1, 16, 2, '#5876a8');
    rect(ctx, 3, 4, 9, 16, '#e9f4f2');
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) rect(ctx, 4 + c * 4, 5 + r * 4, 3, 3, ['#ff8a35', '#ff6fa1', '#7edb8c', '#ffd36b'][(r + c) % 4]);
    rect(ctx, 13, 6, 3, 6, '#2f4870'); rect(ctx, 3, 22, 9, 3, '#2a1d2f');
  });
  s.arch = sprite(factory, 44, 40, 22, 39, (ctx) => {
    rect(ctx, 2, 10, 3, 30, '#7a512f'); rect(ctx, 39, 10, 3, 30, '#7a512f');
    for (let i = 0; i < 22; i++) {
      const a = (i / 21) * Math.PI;
      const x = 22 - Math.cos(a) * 19;
      const y = 14 - Math.sin(a) * 12;
      rect(ctx, x - 2, y - 2, 4, 4, i % 2 ? '#4f9a67' : '#7edb8c');
      if (i % 3 === 0) rect(ctx, x - 1, y - 3, 2, 2, ['#ff8fb1', '#fff3e6', '#ffd36b'][i % 9 === 0 ? 0 : i % 2 ? 1 : 2]);
    }
    for (let y = 16; y < 38; y += 5) { rect(ctx, 0, y, 3, 3, '#4f9a67'); rect(ctx, 41, y + 2, 3, 3, '#4f9a67'); rect(ctx, 1, y + 1, 1, 1, '#ff8fb1'); }
  });
  s.swing = sprite(factory, 56, 46, 28, 42, (ctx) => {
    pixelEllipse(ctx, 28, 41, 24, 3, 'rgba(20,12,30,0.3)');
    rect(ctx, 2, 4, 3, 40, '#7a512f'); rect(ctx, 51, 4, 3, 40, '#7a512f');
    rect(ctx, 0, 2, 56, 4, '#5a3a22'); rect(ctx, 0, 2, 56, 1, '#8a5a3b');
    for (let i = 0; i < 10; i++) { rect(ctx, 6 + i * 5, 6, 1, 1, '#ff8fb1'); rect(ctx, 7 + i * 5, 5, 1, 1, '#7edb8c'); }
  });
  s.seesaw = sprite(factory, 64, 22, 32, 18, (ctx) => {
    pixelEllipse(ctx, 32, 18, 28, 3, 'rgba(20,12,30,0.3)');
    rect(ctx, 28, 8, 8, 10, '#5a3a22'); rect(ctx, 26, 16, 12, 3, '#3b2b3f');
  });
  s.telescope = sprite(factory, 16, 22, 8, 21, (ctx) => {
    rect(ctx, 4, 12, 1, 9, '#2b2236'); rect(ctx, 11, 12, 1, 9, '#2b2236'); rect(ctx, 7, 12, 2, 9, '#2b2236');
    for (let i = 0; i < 9; i++) rect(ctx, 3 + i, 11 - i, 4, 3, i < 2 ? '#ffc94a' : '#c9bfe8');
  });
  s.mailbox = sprite(factory, 14, 22, 7, 21, (ctx) => {
    rect(ctx, 6, 10, 2, 11, '#5a3a22');
    rect(ctx, 1, 2, 12, 9, '#ff6fa1'); rect(ctx, 1, 2, 12, 2, '#ffb3c9'); rect(ctx, 2, 6, 10, 1, '#c93d74');
    rect(ctx, 11, 0, 2, 6, '#ffc94a');
  });
  s.fence = sprite(factory, GARDEN_RECT.w + 8, GARDEN_RECT.h + 14, GARDEN_RECT.w / 2 + 4, GARDEN_RECT.h + 8, (ctx) => {
    const W = GARDEN_RECT.w + 8;
    const H = GARDEN_RECT.h + 14;
    for (let x = 0; x < W; x += 6) { rect(ctx, x, 0, 2, 7, '#d9b08c'); if (x < W / 2 - 10 || x > W / 2 + 6) rect(ctx, x, H - 8, 2, 8, '#d9b08c'); }
    rect(ctx, 0, 2, W, 2, '#b98a64'); rect(ctx, 0, H - 6, W / 2 - 10, 2, '#b98a64'); rect(ctx, W / 2 + 8, H - 6, W / 2 - 8, 2, '#b98a64');
    rect(ctx, 0, 0, 2, H, '#b98a64'); rect(ctx, W - 2, 0, 2, H, '#b98a64');
  });
  s.reeds0 = sprite(factory, 12, 18, 6, 17, (ctx) => {
    for (let i = 0; i < 5; i++) { rect(ctx, 1 + i * 2, 4 + (i % 2) * 3, 1, 13 - (i % 2) * 3, '#4f9a67'); if (i % 2 === 0) rect(ctx, 1 + i * 2, 2 + (i % 2) * 3, 1, 3, '#7a512f'); }
  });
  s.reeds1 = s.reeds0;
  s['blanket-rack'] = sprite(factory, 22, 16, 11, 15, (ctx) => {
    rect(ctx, 2, 4, 2, 11, '#7a512f'); rect(ctx, 18, 4, 2, 11, '#7a512f'); rect(ctx, 1, 3, 20, 2, '#5a3a22');
    for (let i = 0; i < 4; i++) rect(ctx, 4 + i * 4, 5, 3, 7, ['#ff8a35', '#ff6fa1', '#7ee0d2', '#ffd36b'][i]);
  });
  return s;
}

export function propSpriteKey(kind: PropKind, variant: number): string {
  switch (kind) {
    case 'tree': return `tree${variant % 3}`;
    case 'pine': return `pine${variant % 3}`;
    case 'bush': return `bush${variant % 2}`;
    case 'barrel': return `barrel${variant % 2}`;
    case 'reeds': return `reeds${variant % 2}`;
    case 'bench': return variant ? 'benchBack' : 'bench';
    default: return kind;
  }
}
