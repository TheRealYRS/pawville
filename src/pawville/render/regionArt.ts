/**
 * Pixel art for the Milestone 6 regions — drawn procedurally in the same style, palette and scale
 * as townArt.ts (no image files). Static ground is rendered once per region; props are cached
 * sprites; a few animated props (waterfall, campfire, lighthouse, pedestals) are drawn per frame
 * by regionRenderer.ts.
 */
import { seededRandom } from '../world/geometry.ts';
import { RG, RTILE, groundAtR, type RegionDef } from '../adventure/regionKit.ts';
import { context2d, pixelEllipse, rect, type CanvasFactory, type CanvasLike } from './canvasTypes.ts';
import { COLORS, buildPropSprites, type PropSprite } from './townArt.ts';
import { buildCitySprites, cityGroundTile } from './cityArt.ts';
import { buildDistrictSprites, districtGroundTile } from './districtArt.ts';
import { buildFunfairSprites, funfairGroundTile } from './funfairArt.ts';
import { buildStorySprites } from './storyArt.ts';

const T = RTILE;
const FLOWERS = ['#ff8fb1', '#ffd36b', '#fff3e6', '#b9a5ff', '#ff9d5c'];

function groundTile(ctx: CanvasRenderingContext2D, def: RegionDef, c: number, r: number, rand: () => number) {
  const x = c * T, y = r * T;
  const t = groundAtR(def, c, r);
  const nb = (dc: number, dr: number) => groundAtR(def, c + dc, r + dr);
  const snowy = !!def.climate.snow;
  const speck = (n: number, a: string, b: string, w = 1) => { for (let i = 0; i < n; i++) rect(ctx, x + Math.floor(rand() * 15), y + Math.floor(rand() * 15), w, 1, rand() < 0.5 ? a : b); };
  switch (t) {
    case RG.Grass: case RG.Flowers: {
      rect(ctx, x, y, T, T, (c + r) % 2 === 0 ? COLORS.grass : '#4b8847');
      speck(5, COLORS.grassLight, COLORS.grassDark);
      if (rand() < 0.3) { const tx = x + 2 + Math.floor(rand() * 11), ty = y + 4 + Math.floor(rand() * 9); rect(ctx, tx, ty, 1, 2, COLORS.tuft); rect(ctx, tx + 2, ty - 1, 1, 3, COLORS.tuft); }
      if (rand() < (t === RG.Flowers ? 0.8 : 0.08)) { const fx = x + 3 + Math.floor(rand() * 10), fy = y + 3 + Math.floor(rand() * 10), col = FLOWERS[Math.floor(rand() * 5)]; rect(ctx, fx - 1, fy, 3, 1, col); rect(ctx, fx, fy - 1, 1, 3, col); rect(ctx, fx, fy, 1, 1, '#ffe27a'); }
      return;
    }
    case RG.Forest: {
      rect(ctx, x, y, T, T, (c + r) % 2 === 0 ? '#3f7444' : '#3c7041');
      speck(6, '#4f8a4a', '#335e38');
      if (rand() < 0.35) rect(ctx, x + Math.floor(rand() * 13), y + Math.floor(rand() * 14), 2, 1, ['#8a6a3a', '#a07a3e', '#6b5a2e'][Math.floor(rand() * 3)]);
      if (rand() < 0.18) { const tx = x + 3 + Math.floor(rand() * 9), ty = y + 5 + Math.floor(rand() * 7); rect(ctx, tx, ty, 1, 3, '#5f9f57'); rect(ctx, tx + 2, ty + 1, 1, 2, '#5f9f57'); rect(ctx, tx - 2, ty + 1, 1, 2, '#5f9f57'); }
      return;
    }
    case RG.Moss: {
      rect(ctx, x, y, T, T, '#5a9a52');
      speck(7, '#6fb062', '#4b8847');
      if (rand() < 0.15) { const fx = x + 4 + Math.floor(rand() * 8), fy = y + 4 + Math.floor(rand() * 8); rect(ctx, fx, fy, 2, 2, '#fff3e6'); }
      return;
    }
    case RG.Path: {
      if (snowy) { rect(ctx, x, y, T, T, '#dfe6f2'); speck(5, '#c9d3e6', '#eef3fb', 2); return; }
      rect(ctx, x, y, T, T, COLORS.path);
      speck(6, COLORS.pathLight, COLORS.pathDark, 2);
      return;
    }
    case RG.Cobble: {
      rect(ctx, x, y, T, T, '#8a7da0');
      for (let yy = 0; yy < 16; yy += 5) for (let xx = (yy / 5) % 2 ? 0 : 3; xx < 16; xx += 6) rect(ctx, x + xx, y + yy, 5, 4, rand() < 0.5 ? '#b7aac8' : '#a596ba');
      return;
    }
    case RG.Sand: case RG.Shallows: {
      if (t === RG.Shallows) { rect(ctx, x, y, T, T, '#6fa3d6'); speck(4, '#9cc3ff', '#5d8fc4', 3); return; }
      rect(ctx, x, y, T, T, COLORS.sand);
      speck(5, COLORS.sandDark, '#efd7a6');
      const wet = [nb(0, 1), nb(0, -1), nb(1, 0), nb(-1, 0)].some((g) => g === RG.Water || g === RG.Deep);
      if (wet) speck(4, '#cdb27c', '#d8bc85', 2);
      return;
    }
    case RG.Water: case RG.Deep: {
      rect(ctx, x, y, T, T, t === RG.Deep ? '#2a5389' : (c + r) % 2 ? COLORS.water : '#376aa3');
      if (rand() < 0.4) rect(ctx, x + Math.floor(rand() * 12), y + Math.floor(rand() * 15), 4, 1, '#4a80bb');
      // foam where water meets land
      const land = (g: number) => g !== RG.Water && g !== RG.Deep && g !== RG.Void && g !== RG.Shallows;
      if (land(nb(0, -1))) rect(ctx, x, y, T, 2, COLORS.foam);
      if (land(nb(0, 1))) rect(ctx, x, y + 14, T, 2, '#9cc3ff');
      if (land(nb(-1, 0))) rect(ctx, x, y, 1, T, '#9cc3ff');
      if (land(nb(1, 0))) rect(ctx, x + 15, y, 1, T, '#9cc3ff');
      return;
    }
    case RG.Dock: case RG.Bridge: {
      const overVoid = t === RG.Bridge && def.climate.sky === 'void';
      rect(ctx, x, y, T, T, overVoid ? '#7d5a8a' : COLORS.dock);
      for (let yy = 3; yy < 16; yy += 4) rect(ctx, x, y + yy, T, 1, overVoid ? '#5a3f66' : COLORS.dockDark);
      rect(ctx, x + (r % 2 ? 4 : 11), y, 1, T, overVoid ? '#5a3f66' : COLORS.dockDark);
      speck(2, overVoid ? '#a98bbd' : COLORS.dockLight, overVoid ? '#a98bbd' : COLORS.dockLight, 2);
      if (overVoid) {
        // glowing rope rails along the edges that border the void
        if (groundAtR(def, c, r - 1) === RG.Void) rect(ctx, x, y, T, 1, '#ffe27a');
        if (groundAtR(def, c, r + 1) === RG.Void) rect(ctx, x, y + 15, T, 1, '#ffe27a');
        if (groundAtR(def, c - 1, r) === RG.Void) rect(ctx, x, y, 1, T, '#ffe27a');
        if (groundAtR(def, c + 1, r) === RG.Void) rect(ctx, x + 15, y, 1, T, '#ffe27a');
      }
      return;
    }
    case RG.Rock: case RG.Cliff: {
      rect(ctx, x, y, T, T, t === RG.Cliff ? '#5a5266' : '#6d6478');
      speck(6, '#857a92', '#4a4356', 2);
      if (snowy) { rect(ctx, x, y, T, 3, '#eef3fb'); speck(2, '#ffffff', '#dfe6f2', 3); }
      if (groundAtR(def, c, r + 1) !== t && groundAtR(def, c, r + 1) !== RG.Rock && groundAtR(def, c, r + 1) !== RG.Cliff) { rect(ctx, x, y + 13, T, 3, '#3d3648'); rect(ctx, x, y + 12, T, 1, '#8f84a0'); }
      return;
    }
    case RG.CaveWall: {
      rect(ctx, x, y, T, T, '#2a2433');
      speck(5, '#3a3247', '#1d1824', 2);
      if (rand() < 0.12) rect(ctx, x + Math.floor(rand() * 13), y + Math.floor(rand() * 13), 2, 2, ['#7fe3ff', '#c79bff', '#ffd27a'][Math.floor(rand() * 3)]);
      if (groundAtR(def, c, r + 1) === RG.CaveFloor) { rect(ctx, x, y + 12, T, 4, '#17131d'); rect(ctx, x, y + 11, T, 1, '#4a4157'); }
      return;
    }
    case RG.CaveFloor: case RG.Stone: {
      rect(ctx, x, y, T, T, snowy ? '#9fb6cf' : '#4a4157');
      speck(5, snowy ? '#c9dcef' : '#5a5068', snowy ? '#86a0bd' : '#3c3448', 2);
      return;
    }
    case RG.Snow: {
      rect(ctx, x, y, T, T, (c + r) % 2 ? '#eef3fb' : '#e9eff9');
      speck(4, '#ffffff', '#d6deec');
      if (rand() < 0.12) rect(ctx, x + Math.floor(rand() * 12), y + Math.floor(rand() * 14), 4, 1, '#c9d3e6');
      return;
    }
    case RG.Ice: {
      rect(ctx, x, y, T, T, '#a9d4ef');
      speck(3, '#d8efff', '#8fc0e2', 3);
      if (rand() < 0.25) { const sx = x + Math.floor(rand() * 10); rect(ctx, sx, y + 4, 5, 1, '#ffffff'); rect(ctx, sx + 4, y + 5, 1, 3, '#ffffff'); }
      return;
    }
    case RG.StarGrass: {
      rect(ctx, x, y, T, T, (c + r) % 2 ? '#5b78b8' : '#5873b2');
      speck(5, '#7d9ad6', '#4a62a0');
      if (rand() < 0.25) rect(ctx, x + Math.floor(rand() * 14), y + Math.floor(rand() * 14), 1, 1, '#fff3c4');
      if (rand() < 0.1) { const fx = x + 4 + Math.floor(rand() * 8), fy = y + 4 + Math.floor(rand() * 8); rect(ctx, fx - 1, fy, 3, 1, '#e8e2ff'); rect(ctx, fx, fy - 1, 1, 3, '#e8e2ff'); }
      // the underside of a floating island: earth and dangling roots above the void
      if (groundAtR(def, c, r + 1) === RG.Void) {
        rect(ctx, x, y + 12, T, 4, '#4a3a5e');
        for (let i = 0; i < 3; i++) rect(ctx, x + 2 + i * 5, y + 15, 1, 1 + Math.floor(rand() * 3), '#6b5a80');
      }
      return;
    }
    case RG.Void: return; // transparent: the renderer paints the sky behind it
    default: if (!cityGroundTile(ctx, t, c, r, rand, nb) && !districtGroundTile(ctx, t, c, r, rand, nb)) funfairGroundTile(ctx, t, c, r, rand, nb); return; // Milestone 7/8 tiles + the funfair fence
  }
}

export function renderRegionGround(factory: CanvasFactory, def: RegionDef): CanvasLike {
  const canvas = factory(def.cols * T, def.rows * T);
  const ctx = context2d(canvas);
  const rand = seededRandom(0x51a7 + def.cols * 7 + def.rows);
  for (let r = 0; r < def.rows; r++) for (let c = 0; c < def.cols; c++) groundTile(ctx, def, c, r, rand);
  // island hanging undersides (below the tile edge) — a few px of rock dropping into the void
  if (def.climate.sky === 'void') {
    for (let r = 0; r < def.rows - 1; r++) for (let c = 0; c < def.cols; c++) {
      const g = groundAtR(def, c, r);
      if ((g === RG.StarGrass) && groundAtR(def, c, r + 1) === RG.Void) {
        const depth = 6 + ((c * 7 + r * 3) % 9);
        for (let k = 0; k < depth; k++) rect(ctx, c * T + Math.floor(k / 2), (r + 1) * T + k, T - k, 1, k < 3 ? '#3b2d4d' : '#2c2140');
      }
    }
  }
  return canvas;
}

// ---- sprites -------------------------------------------------------------------------------------
function sprite(factory: CanvasFactory, w: number, h: number, ax: number, ay: number, draw: (ctx: CanvasRenderingContext2D) => void): PropSprite {
  const canvas = factory(w, h);
  draw(context2d(canvas));
  return { canvas, ox: -ax, oy: -ay };
}

function house(ctx: CanvasRenderingContext2D, wall: string, wallDark: string, roof: string, roofDark: string, trim: string) {
  pixelEllipse(ctx, 34, 62, 32, 3, 'rgba(20,12,30,0.3)');
  rect(ctx, 4, 26, 60, 36, wall);
  for (let yy = 30; yy < 62; yy += 5) rect(ctx, 4, yy, 60, 1, wallDark);
  rect(ctx, 0, 6, 68, 22, roof);
  for (let yy = 10; yy < 28; yy += 5) for (let xx = (yy % 2) * 4; xx < 68; xx += 8) rect(ctx, xx, yy, 7, 1, roofDark);
  rect(ctx, 0, 6, 68, 2, trim);
  rect(ctx, 28, 44, 12, 18, '#4a2f1c'); rect(ctx, 30, 46, 8, 16, '#6b4329'); rect(ctx, 36, 54, 1, 2, '#ffe3a0');
  rect(ctx, 10, 36, 10, 9, '#3a2a1e'); rect(ctx, 11, 37, 8, 7, '#ffe3a0'); rect(ctx, 15, 37, 1, 7, '#3a2a1e');
  rect(ctx, 48, 36, 10, 9, '#3a2a1e'); rect(ctx, 49, 37, 8, 7, '#ffe3a0'); rect(ctx, 53, 37, 1, 7, '#3a2a1e');
}

export function buildRegionSprites(factory: CanvasFactory): Record<string, PropSprite> {
  const s: Record<string, PropSprite> = { ...buildPropSprites(factory) };
  s.house0 = sprite(factory, 68, 66, 34, 64, (ctx) => { house(ctx, '#8a5a3b', '#6f4529', '#3d5a8a', '#2f4870', '#5876a8'); rect(ctx, 22, 28, 24, 7, '#f3e2c4'); rect(ctx, 26, 30, 16, 1, '#2f4870'); rect(ctx, 26, 32, 12, 1, '#2f4870'); });
  s.house1 = sprite(factory, 68, 66, 34, 64, (ctx) => { house(ctx, '#e9dccf', '#cdbfb2', '#c2531a', '#9c3f12', '#ff8a35'); for (let i = 0; i < 6; i++) rect(ctx, 8 + i * 9, 28, 5, 4, i % 2 ? '#ff6fa1' : '#7ee0d2'); });
  s.house2 = sprite(factory, 68, 66, 34, 64, (ctx) => { house(ctx, '#7d6f94', '#655a7a', '#4a6b2c', '#36501f', '#7aa845'); rect(ctx, 52, 14, 10, 2, '#e9dccf'); });
  s.lighthouse = sprite(factory, 40, 92, 20, 90, (ctx) => {
    pixelEllipse(ctx, 20, 88, 16, 3, 'rgba(20,12,30,0.3)');
    for (let yy = 18; yy < 88; yy++) {
      const half = Math.round(8 + ((yy - 18) / 70) * 6);
      rect(ctx, 20 - half, yy, half * 2, 1, Math.floor((yy - 18) / 12) % 2 ? '#e0475c' : '#fff3e6');
      rect(ctx, 20 - half, yy, 1, 1, '#5a3a4a');
      rect(ctx, 20 + half - 1, yy, 1, 1, '#5a3a4a');
    }
    rect(ctx, 9, 14, 22, 4, '#3a2a3e'); rect(ctx, 11, 4, 18, 10, '#2f4870'); rect(ctx, 13, 6, 14, 6, '#8fb0d6');
    rect(ctx, 12, 0, 16, 4, '#e0475c'); rect(ctx, 18, -1, 4, 2, '#3a2a3e');
    rect(ctx, 16, 72, 8, 16, '#4a2f1c'); rect(ctx, 17, 73, 6, 15, '#6b4329');
  });
  const obs = (v: number) => sprite(factory, 60, 64, 30, 62, (ctx) => {
    pixelEllipse(ctx, 30, 60, 28, 3, 'rgba(20,12,30,0.3)');
    rect(ctx, 6, 30, 48, 30, v ? '#d8d0ee' : '#b7aac8');
    for (let yy = 34; yy < 60; yy += 5) rect(ctx, 6, yy, 48, 1, v ? '#bdb2da' : '#a596ba');
    pixelEllipse(ctx, 30, 30, 26, 22, v ? '#3a3a7a' : '#5876a8');
    pixelEllipse(ctx, 30, 30, 24, 20, v ? '#5050a8' : '#7d9ad6');
    rect(ctx, 6, 30, 48, 4, v ? '#d8d0ee' : '#b7aac8');
    rect(ctx, 28, 8, 4, 22, '#2a1d2f'); rect(ctx, 30, 2, 12, 5, '#8a7da0'); rect(ctx, 40, 1, 4, 7, '#cfc6e3');
    rect(ctx, 24, 44, 12, 16, '#4a2f1c'); rect(ctx, 26, 46, 8, 14, '#6b4329');
    if (v) for (const [x, y] of [[14, 16], [44, 20], [22, 22], [38, 12]]) rect(ctx, x, y, 1, 1, '#fff3c4');
  });
  s.observatory0 = obs(0); s.observatory1 = obs(1);
  s.bigrock = sprite(factory, 30, 22, 15, 20, (ctx) => { pixelEllipse(ctx, 15, 19, 14, 3, 'rgba(20,12,30,0.3)'); pixelEllipse(ctx, 15, 12, 13, 9, '#6d6478'); pixelEllipse(ctx, 13, 10, 10, 6, '#857a92'); rect(ctx, 9, 8, 3, 1, '#a59bb3'); });
  s.rock0 = sprite(factory, 18, 14, 9, 13, (ctx) => { pixelEllipse(ctx, 9, 12, 8, 2, 'rgba(20,12,30,0.3)'); pixelEllipse(ctx, 9, 8, 7, 5, '#6d6478'); pixelEllipse(ctx, 8, 7, 5, 3, '#857a92'); });
  s.rock1 = sprite(factory, 18, 14, 9, 13, (ctx) => { pixelEllipse(ctx, 9, 12, 8, 2, 'rgba(20,12,30,0.3)'); pixelEllipse(ctx, 9, 8, 7, 5, '#7a8496'); pixelEllipse(ctx, 8, 6, 5, 3, '#eef3fb'); });
  s.wreck = sprite(factory, 64, 36, 32, 30, (ctx) => {
    pixelEllipse(ctx, 32, 30, 30, 4, 'rgba(20,12,30,0.25)');
    for (let i = 0; i < 9; i++) rect(ctx, 6 + i * 6, 14 + Math.abs(4 - i), 4, 16 - Math.abs(4 - i), i % 2 ? '#6b4329' : '#80553a');
    rect(ctx, 4, 26, 56, 3, '#4a2f1c'); rect(ctx, 30, 0, 3, 18, '#5a3a22'); rect(ctx, 33, 2, 12, 9, '#d8c8a8'); rect(ctx, 36, 4, 6, 1, '#b5a080');
  });
  for (let v = 0; v < 3; v++) s[`flag${v}`] = sprite(factory, 14, 26, 2, 25, (ctx) => { rect(ctx, 1, 0, 2, 26, '#5a3a22'); rect(ctx, 3, 1, 10, 7, ['#e0475c', '#ff8a35', '#7ee0d2'][v]); rect(ctx, 3, 4, 10, 1, '#fff3e6'); });
  s.bunting = sprite(factory, 120, 16, 60, 14, (ctx) => { for (let x = 0; x < 120; x++) rect(ctx, x, Math.round(2 + Math.sin((x / 120) * Math.PI) * 4), 1, 1, '#3a2a1e'); for (let i = 0; i < 12; i++) { const x = 4 + i * 10, y = Math.round(3 + Math.sin(((x) / 120) * Math.PI) * 4); rect(ctx, x, y, 5, 3, ['#ff8a35', '#ff6fa1', '#7ee0d2', '#ffd36b'][i % 4]); rect(ctx, x + 1, y + 3, 3, 2, ['#ff8a35', '#ff6fa1', '#7ee0d2', '#ffd36b'][i % 4]); } });
  for (let v = 0; v < 2; v++) s[`tent${v}`] = sprite(factory, 34, 24, 17, 22, (ctx) => {
    pixelEllipse(ctx, 17, 21, 15, 2, 'rgba(20,12,30,0.3)');
    for (let i = 0; i < 18; i++) rect(ctx, 17 - i, 4 + i, i * 2, 1, v ? '#7ea3c9' : '#c2a052');
    for (let i = 0; i < 18; i++) rect(ctx, 17 - i, 4 + i, 1, 1, v ? '#4a6a8a' : '#8a6a2e');
    rect(ctx, 14, 12, 6, 10, '#2a1d2f'); rect(ctx, 16, 2, 2, 3, '#5a3a22');
  });
  s.log = sprite(factory, 32, 14, 16, 12, (ctx) => { pixelEllipse(ctx, 16, 12, 15, 2, 'rgba(20,12,30,0.3)'); rect(ctx, 3, 3, 26, 8, '#6b4329'); rect(ctx, 3, 3, 26, 2, '#80553a'); pixelEllipse(ctx, 4, 7, 3, 4, '#2a1d14'); pixelEllipse(ctx, 28, 7, 2, 4, '#b5835a'); rect(ctx, 10, 2, 3, 2, '#5f9f57'); rect(ctx, 20, 2, 4, 1, '#5f9f57'); });
  s.oak = sprite(factory, 48, 56, 24, 54, (ctx) => {
    pixelEllipse(ctx, 24, 52, 18, 3, 'rgba(20,12,30,0.35)');
    rect(ctx, 19, 30, 10, 22, '#5a3a22'); rect(ctx, 19, 30, 2, 22, '#6b4a2e'); rect(ctx, 15, 48, 18, 4, '#5a3a22');
    pixelEllipse(ctx, 24, 40, 3, 3, '#3a2416'); rect(ctx, 22, 39, 1, 1, '#ffd27a'); rect(ctx, 25, 39, 1, 1, '#ffd27a');
    pixelEllipse(ctx, 24, 18, 22, 17, '#2d5f45'); pixelEllipse(ctx, 22, 16, 19, 14, '#3a7a55'); pixelEllipse(ctx, 18, 12, 11, 8, '#4f9a67'); pixelEllipse(ctx, 14, 9, 5, 3, '#7cc08a');
  });
  s.vines = sprite(factory, 26, 40, 13, 34, (ctx) => { for (let i = 0; i < 9; i++) { const h = 22 + ((i * 7) % 14); rect(ctx, 2 + i * 3, 0, 2, h, i % 2 ? '#3e8a45' : '#2f6b3a'); rect(ctx, 2 + i * 3, h - 2, 3, 2, '#5aa955'); } });
  s.cavemouth = sprite(factory, 26, 40, 13, 34, (ctx) => { pixelEllipse(ctx, 13, 22, 11, 14, '#0e0b14'); pixelEllipse(ctx, 13, 24, 8, 11, '#1a1424'); for (let i = 0; i < 4; i++) rect(ctx, 1 + i * 2, 0, 1, 14 + i * 3, '#2f6b3a'); for (let i = 0; i < 4; i++) rect(ctx, 24 - i * 2, 0, 1, 14 + i * 3, '#2f6b3a'); });
  s.mushroom = sprite(factory, 12, 12, 6, 11, (ctx) => { rect(ctx, 5, 6, 2, 5, '#e9dccf'); pixelEllipse(ctx, 6, 5, 5, 3, '#4a7fd0'); rect(ctx, 3, 4, 1, 1, '#bfe4ff'); rect(ctx, 7, 3, 1, 1, '#bfe4ff'); rect(ctx, 2, 9, 2, 2, '#e9dccf'); pixelEllipse(ctx, 3, 8, 2, 1, '#4a7fd0'); });
  s.lantern = sprite(factory, 10, 22, 5, 21, (ctx) => { rect(ctx, 4, 6, 2, 15, '#3a2a1e'); rect(ctx, 1, 2, 8, 6, '#3a2a1e'); rect(ctx, 2, 3, 6, 4, '#ffd27a'); rect(ctx, 3, 0, 4, 2, '#3a2a1e'); });
  for (let v = 0; v < 3; v++) s[`crystal${v}`] = sprite(factory, 14, 20, 7, 19, (ctx) => { const c = [['#7fe3ff', '#c9f6ff', '#3fb0d6'], ['#c79bff', '#ecdcff', '#8a5ad6'], ['#ffd27a', '#fff3c4', '#d6a03f']][v]; rect(ctx, 5, 2, 4, 17, c[0]); rect(ctx, 5, 2, 1, 17, c[1]); rect(ctx, 8, 2, 1, 17, c[2]); rect(ctx, 6, 0, 2, 2, c[1]); rect(ctx, 1, 9, 3, 10, c[0]); rect(ctx, 10, 11, 3, 8, c[2]); rect(ctx, 1, 9, 1, 10, c[1]); });
  s.crystaldoor = sprite(factory, 40, 34, 20, 30, (ctx) => { for (let i = 0; i < 6; i++) { const h = 18 + ((i * 5) % 12); rect(ctx, 2 + i * 6, 30 - h, 5, h, i % 2 ? '#7fe3ff' : '#c79bff'); rect(ctx, 2 + i * 6, 30 - h, 1, h, '#ffffff'); } rect(ctx, 0, 28, 40, 4, '#2a2433'); });
  s.starpool = sprite(factory, 40, 20, 20, 12, (ctx) => { pixelEllipse(ctx, 20, 10, 18, 7, '#2a2a6a'); pixelEllipse(ctx, 20, 10, 15, 5, '#3a4aa8'); for (const [x, y] of [[10, 9], [26, 7], [18, 12], [30, 11]]) rect(ctx, x, y, 1, 1, '#fff3c4'); });
  s.cabin = sprite(factory, 64, 60, 32, 58, (ctx) => {
    pixelEllipse(ctx, 32, 56, 30, 3, 'rgba(20,12,30,0.3)');
    rect(ctx, 6, 24, 52, 32, '#6b4329'); for (let yy = 26; yy < 56; yy += 4) rect(ctx, 6, yy, 52, 1, '#4a2f1c');
    for (let i = 0; i < 20; i++) rect(ctx, 32 - i * 1.6 - 4, 4 + i, i * 3.2 + 8, 1, i < 3 ? '#ffffff' : '#eef3fb');
    rect(ctx, 0, 23, 64, 3, '#dfe6f2'); rect(ctx, 26, 38, 12, 18, '#3a2416'); rect(ctx, 10, 32, 10, 9, '#3a2416'); rect(ctx, 11, 33, 8, 7, '#ffd27a'); rect(ctx, 44, 32, 10, 9, '#3a2416'); rect(ctx, 45, 33, 8, 7, '#ffd27a');
    rect(ctx, 46, 2, 6, 10, '#5a5266'); rect(ctx, 46, 0, 6, 2, '#eef3fb');
  });
  s.station = sprite(factory, 44, 46, 22, 44, (ctx) => {
    pixelEllipse(ctx, 22, 42, 20, 3, 'rgba(20,12,30,0.3)');
    rect(ctx, 4, 18, 36, 24, '#8a5a3b'); for (let yy = 20; yy < 42; yy += 4) rect(ctx, 4, yy, 36, 1, '#6f4529');
    rect(ctx, 0, 12, 44, 7, '#e0475c'); rect(ctx, 0, 10, 44, 2, '#eef3fb'); rect(ctx, 18, 28, 8, 14, '#3a2416');
    pixelEllipse(ctx, 22, 6, 6, 6, '#c2a052'); pixelEllipse(ctx, 22, 6, 3, 3, '#8a6a2e'); rect(ctx, 21, 0, 2, 12, '#5a3a22');
  });
  for (let v = 0; v < 3; v++) {
    const base = s[`pine${v}`];
    s[`snowpine${v}`] = sprite(factory, 22, 36, 11, 35, (ctx) => {
      ctx.drawImage(base.canvas as unknown as CanvasImageSource, 0, 0);
      for (const [y, half] of [[3, 2], [11, 4], [19, 6]]) { rect(ctx, 11 - half, y, half * 2 + 1, 2, '#f4f8ff'); rect(ctx, 11 - half + 1, y + 2, half * 2 - 1, 1, '#dfe6f2'); }
    });
  }
  for (let v = 0; v < 3; v++) s[`icecrystal${v}`] = sprite(factory, 14, 22, 7, 21, (ctx) => { rect(ctx, 5, 2, 4, 19, '#bfe4ff'); rect(ctx, 5, 2, 1, 19, '#ffffff'); rect(ctx, 1, 10 - v, 3, 11 + v, '#a9d4ef'); rect(ctx, 10, 12, 3, 9, '#8fc0e2'); });
  s.sledtrack = sprite(factory, 12, 260, 6, 258, (ctx) => { for (let y = 0; y < 260; y += 3) { rect(ctx, 2, y, 1, 2, '#c9d3e6'); rect(ctx, 8, y, 1, 2, '#c9d3e6'); } });
  s.cable = sprite(factory, 380, 120, 20, 112, (ctx) => { for (let x = 0; x < 380; x++) rect(ctx, x, Math.round(4 + (x / 380) * 100 + Math.sin((x / 380) * Math.PI) * 10), 1, 1, '#2a1d2f'); });
  s.pedestal0 = sprite(factory, 22, 26, 11, 24, (ctx) => { pixelEllipse(ctx, 11, 23, 10, 2, 'rgba(20,12,30,0.3)'); rect(ctx, 5, 8, 12, 15, '#cfc6e3'); rect(ctx, 5, 8, 2, 15, '#ffffff'); rect(ctx, 3, 6, 16, 3, '#e8e2ff'); rect(ctx, 3, 21, 16, 3, '#a596ba'); });
  s.pedestal1 = s.pedestal0;
  s.pillar = sprite(factory, 16, 40, 8, 38, (ctx) => { rect(ctx, 3, 4, 10, 30, '#8a7da0'); rect(ctx, 3, 4, 2, 30, '#b7aac8'); rect(ctx, 1, 0, 14, 5, '#cfc6e3'); rect(ctx, 1, 33, 14, 4, '#6d6478'); pixelEllipse(ctx, 8, 18, 4, 4, '#3a3a7a'); rect(ctx, 6, 17, 1, 1, '#bfe4ff'); rect(ctx, 9, 17, 1, 1, '#bfe4ff'); });
  s.moonflower = sprite(factory, 10, 12, 5, 11, (ctx) => { rect(ctx, 4, 4, 1, 7, '#4f9a67'); rect(ctx, 5, 7, 2, 1, '#7edb8c'); rect(ctx, 2, 1, 5, 3, '#e8e2ff'); rect(ctx, 3, 0, 3, 5, '#e8e2ff'); rect(ctx, 4, 2, 1, 1, '#fff3c4'); });
  s.starstone = sprite(factory, 12, 10, 6, 9, (ctx) => { pixelEllipse(ctx, 6, 8, 5, 1, 'rgba(20,12,30,0.3)'); pixelEllipse(ctx, 6, 5, 4, 4, '#ffe27a'); pixelEllipse(ctx, 5, 4, 2, 2, '#fff3c4'); });
  s.stall = sprite(factory, 44, 34, 22, 32, (ctx) => {
    pixelEllipse(ctx, 22, 31, 20, 2, 'rgba(20,12,30,0.3)');
    rect(ctx, 2, 18, 40, 13, '#8a5a3b'); rect(ctx, 2, 18, 40, 2, '#b5835a');
    rect(ctx, 2, 4, 2, 15, '#5a3a22'); rect(ctx, 40, 4, 2, 15, '#5a3a22');
    for (let i = 0; i < 8; i++) rect(ctx, i * 5 + 2, 0, 5, 6, i % 2 ? '#fff3e6' : '#3d5a8a');
  });
  buildCitySprites(factory, s); // Milestone 7 (Whiskerwick)
  buildDistrictSprites(factory, s); // Milestone 8 (districts, interiors)
  buildFunfairSprites(factory, s); // Funfair (rides, gate, booths)
  buildStorySprites(factory, s); // The Song Beneath the Stars (the temple)
  return s;
}

export function regionSpriteKey(kind: string, variant = 0): string {
  switch (kind) {
    case 'tree': return `tree${variant % 3}`;
    case 'pine': return `pine${variant % 3}`;
    case 'snowpine': return `snowpine${variant % 3}`;
    case 'bush': return `bush${variant % 2}`;
    case 'barrel': return `barrel${variant % 2}`;
    case 'reeds': return `reeds${variant % 2}`;
    case 'house': return `house${variant % 3}`;
    case 'observatory': return `observatory${variant % 2}`;
    case 'rock': return `rock${variant % 2}`;
    case 'flag': return `flag${variant % 3}`;
    case 'tent': return `tent${variant % 2}`;
    case 'crystal': return `crystal${variant % 3}`;
    case 'icecrystal': return `icecrystal${variant % 3}`;
    case 'pedestal': return `pedestal${variant % 2}`;
    case 'cabinet': return `cabinet${variant % 7}`;
    case 'shop': return `shop${variant % 5}`;
    case 'cafe': return `cafe${variant % 2}`;
    case 'apartment': return `apartment${variant % 3}`;
    case 'townhouse': return `townhouse${variant % 2}`;
    case 'oldshop': return `oldshop${variant % 3}`;
    case 'marketstall': return `marketstall${variant % 2}`;
    case 'fairbunting': return `fairbunting${variant % 5}`;
    case 'balloons': return `balloons${variant % 2}`;
    case 'fairsign': return `fairsign${variant % 2}`;
    case 'picnicblanket': return `picnicblanket${variant % 2}`;
    case 'hearthsong': return `hearthsong${variant % 2}`;
    case 'templelamp': return `templelamp${variant % 2}`;
    default: return kind;
  }
}
