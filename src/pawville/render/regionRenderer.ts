/**
 * Per-frame rendering of a Milestone 6 region. Same pipeline and look as the town renderer:
 * static ground → animated water → flat details → y-sorted props, NPCs and cats → day/night grade
 * → lights and emote effects → sky, weather, vignette. Cats are drawn by the town renderer's own
 * cat code, so every character, emote and photo pose looks identical in every region.
 */
import { drawLamp, lampLight } from './lighting.ts';
import type { RegionDef } from '../adventure/regionKit.ts';
import { RG, RTILE, groundAtR } from '../adventure/regionKit.ts';
import { pixelEllipse, rect, type CanvasFactory, type CanvasLike } from './canvasTypes.ts';
import { CatSpriteCache } from './catSprites.ts';
import { buildRegionSprites, regionSpriteKey, renderRegionGround } from './regionArt.ts';
import { drawCityDynamic } from './cityArt.ts';
import {
  drawBumperArena, drawCarouselBase, drawCarouselMount, drawCarouselTop, drawFerrisBack, drawFerrisFront, drawFerrisShadows, drawPhotoBooth, drawRingBooth, drawSwingBase,
  drawSwingChair, drawSwingTop, type FairFrame,
} from './funfairArt.ts';
import { RIDE_SEATS, carouselMount, swingChair } from '../city/funfair.ts';
import { drawDistrictDynamic, setDistrictSpriteCache } from './districtArt.ts';
import type { PropSprite } from './townArt.ts';
import { drawBeam, drawConstellation, drawGate, drawLumi, drawPlateGlow, drawSpotMarkers, drawTrail, LUMI_STARS, questBang } from './adventureFx.ts';
import { drawCat, drawFx, drawGrade, drawSky, drawVignette, drawWeather, type FrameState, type FxItem, type TownArt } from './townRenderer.ts';
import type { Environment } from '../world/environment.ts';

export interface RegionArt {
  def: RegionDef;
  ground: CanvasLike;
  sprites: Record<string, PropSprite>;
  cats: CatSpriteCache;
}

let spriteCache: Record<string, PropSprite> | null = null;
export function createRegionArt(factory: CanvasFactory, def: RegionDef): RegionArt {
  spriteCache ??= buildRegionSprites(factory);
  setDistrictSpriteCache(spriteCache);
  return { def, ground: renderRegionGround(factory, def), sprites: spriteCache, cats: new CatSpriteCache(factory) };
}

/** Each region's permanent climate applied to the shared live weather/time. */
export function regionEnv(def: Pick<RegionDef, 'climate'>, env: Environment): Environment {
  // Milestone 8: interiors are always dry and softly lit (a little dimmer at night)
  if (def.climate.indoor) return { ...env, weather: 'sunny', fromWeather: 'sunny', blend: 1, darkness: Math.min(0.35, env.darkness * 0.4), wetness: 0, snowCover: 0, wind: 0 };
  if (def.climate.dark) return { ...env, weather: 'sunny', fromWeather: 'sunny', blend: 1, darkness: Math.max(0.72, env.darkness), wetness: 0, snowCover: 0, wind: 0.05 };
  if (def.climate.sky === 'void') return { ...env, weather: 'sunny', fromWeather: 'sunny', blend: 1, darkness: Math.max(0.5, env.darkness), wetness: 0, snowCover: 0 };
  if (def.climate.snow) {
    const w = env.weather === 'light-rain' || env.weather === 'heavy-rain' ? 'snow' : env.weather;
    return { ...env, weather: w, fromWeather: w, snowCover: 1, wetness: 0 };
  }
  return env;
}

function h1(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const FLAT = new Set(['plate', 'starpool', 'sledtrack']);
const GLOW_KINDS = new Set(['funfairarch', 'funfairgate', 'ticketbooth', 'lamp', 'lantern', 'mushroom', 'crystal', 'icecrystal', 'campfire', 'pedestal', 'moonflower', 'cabinet', 'shop', 'cafe', 'arcadebldg', 'cinema', 'citystation', 'vending', 'claw', 'oldlamp', 'oldshop', 'librarybldg', 'apartment', 'townhouse', 'clocktower', 'readingtable', 'stringlights', 'roofcafe', 'parkgate', 'archway']);

function drawVoidSky(ctx: CanvasRenderingContext2D, f: FrameState) {
  const g = ctx.createLinearGradient(0, 0, 0, f.viewH);
  g.addColorStop(0, '#120f2a');
  g.addColorStop(1, '#2a1f4a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, f.viewW, f.viewH);
  // parallax star field (two layers)
  for (let layer = 0; layer < 2; layer++) {
    const par = layer ? 0.5 : 0.25;
    for (let i = 0; i < 70; i++) {
      const sx = (h1(i * 3 + layer * 99) * 900 - f.camX * par) % 900;
      const sy = (h1(i * 5 + layer * 77) * 700 - f.camY * par) % 700;
      const x = ((sx % f.viewW) + f.viewW) % f.viewW;
      const y = ((sy % f.viewH) + f.viewH) % f.viewH;
      const tw = f.reducedMotion ? 0.8 : 0.5 + 0.5 * Math.sin(f.time * (1 + h1(i)) + i);
      ctx.fillStyle = `rgba(255, 243, 210, ${(0.3 + tw * 0.6 * (layer ? 1 : 0.6)).toFixed(3)})`;
      ctx.fillRect(Math.round(x), Math.round(y), layer ? 1 : 1, 1);
    }
  }
  // drifting clouds far below
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 4; i++) {
    const x = ((i * 260 + f.time * 6 - f.camX * 0.15) % (f.viewW + 300)) - 150;
    pixelEllipse(ctx, x, f.viewH * (0.3 + i * 0.18), 120, 14, '#c9bfe8');
  }
  ctx.globalAlpha = 1;
}

/** Milestone 8: the rooftops float over a layered city skyline (parallax, lit windows at night). */
function drawSkyline(ctx: CanvasRenderingContext2D, f: FrameState) {
  const n = f.env.darkness;
  const g = ctx.createLinearGradient(0, 0, 0, f.viewH);
  g.addColorStop(0, n > 0.5 ? '#141235' : n > 0.25 ? '#5a3f8f' : '#7fb2e6');
  g.addColorStop(1, n > 0.5 ? '#2a1f4a' : n > 0.25 ? '#ff9d5c' : '#cfe4ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, f.viewW, f.viewH);
  for (let layer = 0; layer < 3; layer++) {
    const par = 0.15 + layer * 0.15;
    const base = f.viewH * (0.55 + layer * 0.15);
    const col = n > 0.5 ? ['#2a2252', '#211b44', '#18143a'][layer] : ['#8a7da0', '#6d6478', '#5a5266'][layer];
    for (let i = -1; i < 14; i++) {
      const w = (40 + h1(i * 7 + layer) * 50) | 0;
      const h = (40 + h1(i * 13 + layer * 3) * 120) | 0;
      const x = Math.round(i * 90 - ((f.camX * par) % 90) + layer * 23);
      ctx.fillStyle = col;
      ctx.fillRect(x, base - h, w, h + f.viewH);
      if (n > 0.35) for (let wy = base - h + 6; wy < base - 4; wy += 9) for (let wx = x + 4; wx < x + w - 4; wx += 8) if (h1(wx * 3 + wy) > 0.55) { ctx.fillStyle = 'rgba(255,214,140,0.8)'; ctx.fillRect(wx, wy, 3, 4); }
    }
  }
  if (n > 0.5) for (let i = 0; i < 50; i++) { ctx.fillStyle = `rgba(255,243,210,${(0.4 + 0.5 * h1(i)).toFixed(2)})`; ctx.fillRect((h1(i * 3) * f.viewW) | 0, (h1(i * 5) * f.viewH * 0.5) | 0, 1, 1); }
}

function drawWaterAnim(ctx: CanvasRenderingContext2D, def: RegionDef, f: FrameState) {
  if (f.reducedMotion) return;
  const c0 = Math.max(0, Math.floor(f.camX / RTILE)), c1 = Math.min(def.cols - 1, Math.ceil((f.camX + f.viewW) / RTILE));
  const r0 = Math.max(0, Math.floor(f.camY / RTILE)), r1 = Math.min(def.rows - 1, Math.ceil((f.camY + f.viewH) / RTILE));
  const rain = f.env.weather.includes('rain');
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const g = groundAtR(def, c, r);
    if (g !== RG.Water && g !== RG.Deep) continue;
    const k = Math.sin(f.time * (1.7 + f.env.wind) + c * 1.3 + r * 0.7);
    if (k > 0.55) rect(ctx, c * RTILE + 3 + Math.round(k * 4), r * RTILE + 6 + (c % 3) * 2, 5, 1, 'rgba(216,236,255,0.5)');
    if (rain && h1(c * 31 + r * 7 + Math.floor(f.time * 3)) > 0.82) pixelEllipse(ctx, c * RTILE + 8, r * RTILE + 8, 3, 1, 'rgba(216,236,255,0.5)');
  }
}

const fairOf = (f: FrameState): FairFrame => f.fair ?? { clockMs: Date.now() };

/** The funfair's animated pieces. Returns true when the prop was handled here. `part` picks which pass of a ride to draw. */
function drawFairProp(ctx: CanvasRenderingContext2D, art: RegionArt, kind: string, x: number, y: number, f: FrameState, part: string): boolean {
  const ff = fairOf(f), night = f.env.darkness, still = f.reducedMotion;
  switch (kind) {
    case 'ferris':
      if (part === 'shadow') drawFerrisShadows(ctx, x, y, ff);
      else if (part === 'front') drawFerrisFront(ctx, x, y, ff, night, still);
      else drawFerrisBack(ctx, x, y, ff, night, still);
      return true;
    case 'carousel':
      if (part === 'base') drawCarouselBase(ctx, x, y, ff, night, still);
      else if (part === 'top') drawCarouselTop(ctx, x, y, ff, night, still);
      else if (part.startsWith('mount')) { const i = Number(part.slice(5)); drawCarouselMount(ctx, art.sprites, x, y, i, ff, still, !!ff.occupied?.carousel?.includes(i)); }
      return true;
    case 'swingride':
      if (part === 'base') drawSwingBase(ctx, x, y, ff, night, still);
      else if (part === 'top') drawSwingTop(ctx, x, y, ff, night, still);
      else if (part.startsWith('chair')) { const i = Number(part.slice(5)); drawSwingChair(ctx, art.sprites, x, y, i, ff, still, !!ff.occupied?.swing?.includes(i)); }
      return true;
    case 'bumperarena': drawBumperArena(ctx, x, y, ff, night, still); return true;
    case 'ringbooth': drawRingBooth(ctx, x, y, ff, night, still); return true;
  }
  return false;
}

function drawDynamicProp(ctx: CanvasRenderingContext2D, art: RegionArt, kind: string, x: number, y: number, variant: number, f: FrameState) {
  const v = f.adv?.view;
  const t = f.reducedMotion ? 0 : f.time;
  if (kind === 'photobooth' && variant === 0) {
    const self = f.cats.find((c) => c.isSelf);
    drawPhotoBooth(ctx, x, y, f.time * 1000, f.env.darkness, f.reducedMotion, !!self && Math.hypot(self.x - x, self.y - (y + 14)) < 30);
    return;
  }
  if ((kind === 'bumperarena' || kind === 'ringbooth') && drawFairProp(ctx, art, kind, x, y, f, 'all')) return;
  if ((kind === 'duck' || kind === 'gull') && drawDistrictDynamic(ctx, kind, x, y, variant, f.time, f.reducedMotion || !!f.lowPower)) return;
  if (kind === 'cityfountain' || kind === 'cabinet' || kind === 'arcadebldg') {
    // Milestone 7: base sprite, then the animated layer on top
    const sp = art.sprites[regionSpriteKey(kind, variant)];
    if (sp) ctx.drawImage(sp.canvas as unknown as CanvasImageSource, Math.round(x + sp.ox), Math.round(y + sp.oy));
    drawCityDynamic(ctx, kind, x, y, variant, f.time, f.reducedMotion || !!f.lowPower, f.env.darkness, f.ferrisAngle);
    return;
  }
  switch (kind) {
    case 'waterfall': {
      rect(ctx, x - 14, y - 40, 28, 44, '#5a5266');
      for (let i = 0; i < 6; i++) {
        const col = x - 12 + i * 4;
        rect(ctx, col, y - 40, 4, 44, i % 2 ? '#bfe4ff' : '#e9f6ff');
        const off = Math.floor((t * 40 + i * 9) % 44);
        rect(ctx, col + 1, y - 40 + off, 2, 6, '#ffffff');
      }
      pixelEllipse(ctx, x, y + 4, 18, 5, 'rgba(255,255,255,0.75)');
      for (let i = 0; i < 5; i++) { const k = (t * 1.5 + i / 5) % 1; ctx.globalAlpha = 1 - k; rect(ctx, x - 14 + i * 7, y + 2 - Math.round(k * 8), 2, 2, '#ffffff'); }
      ctx.globalAlpha = 1;
      return;
    }
    case 'campfire': {
      for (let i = 0; i < 5; i++) rect(ctx, x - 6 + i * 3, y - 3, 3, 2, i % 2 ? '#5a3a22' : '#6b4329');
      const flick = Math.floor(t * 8) % 3;
      rect(ctx, x - 2, y - 8 - flick, 4, 6 + flick, '#ff8a35'); rect(ctx, x - 1, y - 10 - flick, 2, 4, '#ffd27a');
      return;
    }
    case 'stall': {
      const sp = art.sprites.stall;
      ctx.drawImage(sp.canvas as unknown as CanvasImageSource, Math.round(x + sp.ox), Math.round(y + sp.oy));
      if (v?.has('harbor-restored')) {
        for (let i = 0; i < 5; i++) { rect(ctx, x - 16 + i * 7, y - 16, 5, 2, ['#b9c6d6', '#ff9d5c', '#ffd36b', '#9fd3ff', '#e8a7bc'][i]); rect(ctx, x - 17 + i * 7, y - 15, 1, 1, '#2a1d2f'); }
        rect(ctx, x - 6, y - 26, 12, 5, '#f3e2c4'); rect(ctx, x - 4, y - 24, 8, 1, '#3d5a8a');
      } else {
        for (let i = 0; i < 4; i++) rect(ctx, x - 18, y - 26 + i * 3, 36, 2, i % 2 ? '#6b4329' : '#80553a');
      }
      return;
    }
    case 'plate': {
      const id = variant ? 'b' : 'a';
      drawPlateGlow(ctx, x, y, !!f.adv?.pressed?.[id] || !!v?.has('crystal-door-open') || !!v?.has(`plate-stone:${id}`), '#7fe3ff', f.time);
      if (v?.has(`plate-stone:${id}`) && !v.has('crystal-door-open')) pixelEllipse(ctx, x, y - 5, 3, 3, '#cfe4ff');
      return;
    }
    case 'pedestal': {
      const sp = art.sprites.pedestal0;
      ctx.drawImage(sp.canvas as unknown as CanvasImageSource, Math.round(x + sp.ox), Math.round(y + sp.oy));
      const id = variant ? 'b' : 'a';
      const on = !!f.adv?.pressed?.[id] || !!v?.done('constellation-for-two');
      if (on) { rect(ctx, x - 2, y - 22, 5, 1, '#ffe27a'); rect(ctx, x, y - 24, 1, 5, '#ffe27a'); }
      if (v?.has(`ped-stone:${id}`) && !v.done('constellation-for-two')) pixelEllipse(ctx, x, y - 20, 3, 3, '#ffe27a');
      return;
    }
    case 'starfall': {
      for (let i = 0; i < 4; i++) {
        const col = x - 6 + i * 4;
        rect(ctx, col, y - 4, 3, 30, i % 2 ? 'rgba(191,228,255,0.7)' : 'rgba(232,226,255,0.8)');
        const off = Math.floor((t * 30 + i * 7) % 30);
        rect(ctx, col + 1, y - 4 + off, 1, 4, '#ffffff');
      }
      for (let i = 0; i < 6; i++) { const k = (t * 0.6 + i / 6) % 1; ctx.globalAlpha = 1 - k; rect(ctx, x - 8 + i * 3, y + 26 + Math.round(k * 40), 1, 1, '#fff3c4'); }
      ctx.globalAlpha = 1;
      return;
    }
    case 'cable': {
      const sp = art.sprites.cable;
      ctx.drawImage(sp.canvas as unknown as CanvasImageSource, Math.round(x + sp.ox), Math.round(y + sp.oy));
      const k = ((t * 0.04) % 1);
      const cx = x - 20 + k * 380, cy = y - 112 + 4 + k * 100 + Math.sin(k * Math.PI) * 10;
      rect(ctx, cx - 1, cy, 2, 5, '#2a1d2f'); rect(ctx, cx - 6, cy + 5, 12, 8, '#e0475c'); rect(ctx, cx - 4, cy + 7, 8, 3, '#bfe4ff');
      return;
    }
    case 'lighthouse': {
      const sp = art.sprites.lighthouse;
      ctx.drawImage(sp.canvas as unknown as CanvasImageSource, Math.round(x + sp.ox), Math.round(y + sp.oy));
      if (v?.has('lighthouse-lit')) rect(ctx, x - 5, y - 84, 10, 6, '#ffe9a8');
      return;
    }
  }
  const sp = art.sprites[regionSpriteKey(kind, variant)];
  if (sp) ctx.drawImage(sp.canvas as unknown as CanvasImageSource, Math.round(x + sp.ox), Math.round(y + sp.oy));
}

function drawRegionGlows(ctx: CanvasRenderingContext2D, art: RegionArt, f: FrameState, visible: (x: number, y: number) => boolean) {
  const night = f.env.darkness;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of art.def.props) {
    if (!visible(p.x, p.y) || (p.when && f.adv && !p.when(f.adv.view))) continue;
    if (p.kind === 'lighthouse' && f.adv?.view.has('lighthouse-lit')) drawBeam(ctx, p.x, p.y - 82, f.time, Math.max(0.25, night), f.reducedMotion);
    if (!GLOW_KINDS.has(p.kind)) continue;
    const color = p.kind === 'cabinet' ? ['126, 224, 210', '255, 143, 177', '255, 211, 107', '156, 195, 255', '126, 219, 140', '255, 138, 53', '201, 191, 232'][(p.variant ?? 0) % 7]
      : p.kind === 'arcadebldg' ? '255, 111, 161' : p.kind === 'vending' || p.kind === 'claw' ? '191, 228, 255'
      : p.kind === 'shop' || p.kind === 'cafe' || p.kind === 'cinema' || p.kind === 'citystation' ? '255, 214, 140'
      : p.kind === 'mushroom' ? '120, 180, 255' : p.kind === 'crystal' ? ['127, 227, 255', '199, 155, 255', '255, 210, 122'][(p.variant ?? 0) % 3]
      : p.kind === 'icecrystal' ? '191, 228, 255' : p.kind === 'moonflower' ? '232, 226, 255' : '255, 210, 130';
    const isLamp = p.kind === 'lamp' || p.kind === 'lantern' || p.kind === 'campfire' || p.kind === 'oldlamp';
    if (isLamp) { drawLamp(ctx, p.x, p.y, p.y - (p.kind === 'campfire' ? 6 : p.kind === 'lantern' ? 16 : 18), color, lampLight(night)); continue; }
    const base = 0.06 + night * 0.2;
    const r = 8 + night * 10;
    const big = p.kind === 'shop' || p.kind === 'cafe' || p.kind === 'cinema' || p.kind === 'citystation' || p.kind === 'arcadebldg'
      || p.kind === 'oldshop' || p.kind === 'librarybldg' || p.kind === 'apartment' || p.kind === 'townhouse' || p.kind === 'clocktower' || p.kind === 'roofcafe' || p.kind === 'archway' || p.kind === 'parkgate';
    if (big && night < 0.3) continue; // building windows only glow in the evening
    const cy = p.y - (p.kind === 'lamp' ? 18 : p.kind === 'lantern' ? 16 : p.kind === 'cabinet' ? 20 : big ? 14 : 6);
    const g = ctx.createRadialGradient(p.x, cy, 1, p.x, cy, r);
    g.addColorStop(0, `rgba(${color}, ${base.toFixed(3)})`);
    g.addColorStop(1, `rgba(${color}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(p.x - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
}

function drawAurora(ctx: CanvasRenderingContext2D, f: FrameState) {
  const clear = f.env.weather === 'sunny' || f.env.weather === 'windy' || f.env.weather === 'cloudy';
  const a = clear ? (f.env.darkness - 0.45) * 1.6 : 0;
  if (a <= 0.05) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let band = 0; band < 3; band++) {
    for (let x = 0; x < f.viewW; x += 2) {
      const y = f.viewH * (0.08 + band * 0.07) + Math.sin(x / 40 + f.time * (f.reducedMotion ? 0 : 0.4) + band) * 10;
      const h = 18 + Math.sin(x / 23 + band) * 8;
      ctx.globalAlpha = Math.min(0.45, a) * (0.5 + 0.5 * Math.sin(x / 31 + band * 2));
      ctx.fillStyle = band === 1 ? '#c79bff' : '#7dffb0';
      ctx.fillRect(x, y, 2, h);
    }
  }
  ctx.restore();
}

export function drawRegionFrame(ctx: CanvasRenderingContext2D, art: RegionArt, f: FrameState): void {
  const def = art.def;
  ctx.imageSmoothingEnabled = false;
  if (def.climate.sky === 'void') drawVoidSky(ctx, f);
  else if (def.climate.sky === 'skyline') drawSkyline(ctx, f);
  else if (def.climate.indoor) { ctx.fillStyle = '#1b1530'; ctx.fillRect(0, 0, f.viewW, f.viewH); }
  else {
    ctx.fillStyle = def.climate.dark ? '#17131d' : def.climate.snow ? '#dfe6f2' : '#31609a';
    ctx.fillRect(0, 0, f.viewW, f.viewH);
  }
  ctx.save();
  ctx.translate(-f.camX, -f.camY);
  ctx.drawImage(art.ground as unknown as CanvasImageSource, 0, 0);
  drawWaterAnim(ctx, def, f);
  const left = f.camX - 64, right = f.camX + f.viewW + 64, top = f.camY - 16, bottom = f.camY + f.viewH + 80;
  const visible = (x: number, y: number) => x >= left && x <= right && y >= top && y <= bottom;
  const v = f.adv?.view;
  // snow paw prints (always snowy up here)
  if (def.climate.snow) for (const p of f.dyn.pawprints) {
    const a = Math.max(0, 1 - p.age / 20);
    if (a > 0) rect(ctx, Math.round(p.x - 1), Math.round(p.y - 1), 2, 2, `rgba(150, 160, 190, ${(a * 0.7).toFixed(3)})`);
  }
  for (const tr of def.trails ?? []) if (v && tr.when(v)) drawTrail(ctx, tr.points, tr.color, f.time, f.reducedMotion);
  for (const p of def.props) if (FLAT.has(p.kind) && visible(p.x, p.y) && (!p.when || !v || p.when(v))) drawDynamicProp(ctx, art, p.kind, p.x, p.y, p.variant ?? 0, f);
  for (const g of def.gates) if (v && g.closed(v)) drawGate(ctx, g);
  if (f.adv) drawSpotMarkers(ctx, f.adv, f.time, f.reducedMotion, { x: f.camX, y: f.camY, w: f.viewW, h: f.viewH });
  // interaction ring
  const target = f.target ? f.adv?.spots.find((s) => s.id === f.target) : undefined;
  if (target) {
    const k = f.reducedMotion ? 0.5 : (Math.sin(f.time * 4) + 1) / 2;
    ctx.globalAlpha = 0.35 + k * 0.25;
    ctx.strokeStyle = '#ffc94a';
    ctx.beginPath();
    ctx.ellipse(target.point.x + 0.5, target.point.y + 0.5, 9 + k * 2, 3 + k, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const list: { y: number; draw: () => void }[] = [];
  for (const p of def.props) {
    if (FLAT.has(p.kind) || (p.when && v && !p.when(v))) continue;
    const wide = p.kind !== 'tree' && p.kind !== 'bush' && p.kind !== 'pine'; // Milestone 8: buildings are culled generously
    if (wide ? visible(p.x, p.y - 60) || visible(p.x - 60, p.y) || visible(p.x + 60, p.y) || visible(p.x + 200, p.y - 100) : visible(p.x, p.y)) {
      // Funfair rides are drawn in several passes so a rider sits BETWEEN the back and the front of its seat.
      if (p.kind === 'ferris') {
        list.push({ y: p.y - 2, draw: () => drawFairProp(ctx, art, 'ferris', p.x, p.y, f, 'shadow') });
        list.push({ y: p.y, draw: () => drawFairProp(ctx, art, 'ferris', p.x, p.y, f, 'back') });
        list.push({ y: p.y + 0.7, draw: () => drawFairProp(ctx, art, 'ferris', p.x, p.y, f, 'front') });
      } else if (p.kind === 'carousel') {
        list.push({ y: p.y - 26, draw: () => drawFairProp(ctx, art, 'carousel', p.x, p.y, f, 'base') });
        list.push({ y: p.y - 4, draw: () => drawFairProp(ctx, art, 'carousel', p.x, p.y, f, 'top') });
        for (let i = 0; i < RIDE_SEATS; i++) {
          const m = carouselMount({ x: p.x, y: p.y }, i, f.reducedMotion ? 0 : fairOf(f).clockMs);
          list.push({ y: m.y, draw: () => drawFairProp(ctx, art, 'carousel', p.x, p.y, f, `mount${i}`) });
        }
      } else if (p.kind === 'swingride') {
        list.push({ y: p.y - 12, draw: () => drawFairProp(ctx, art, 'swingride', p.x, p.y, f, 'base') });
        list.push({ y: p.y - 4, draw: () => drawFairProp(ctx, art, 'swingride', p.x, p.y, f, 'top') });
        for (let i = 0; i < RIDE_SEATS; i++) {
          const c = swingChair({ x: p.x, y: p.y }, i, f.reducedMotion ? 0 : fairOf(f).clockMs);
          list.push({ y: c.y, draw: () => drawFairProp(ctx, art, 'swingride', p.x, p.y, f, `chair${i}`) });
        }
      } else list.push({ y: p.y, draw: () => drawDynamicProp(ctx, art, p.kind, p.x, p.y, p.variant ?? 0, f) });
    }
  }
  for (const c of f.creatures ?? []) if (visible(c.x, c.y)) list.push({ y: c.y, draw: () => drawLumi(ctx, c.x, c.y, f.time, f.reducedMotion) });
  const fx: FxItem[] = [];
  const catArt = { cats: art.cats } as unknown as TownArt;
  for (const c of f.cats) if (visible(c.x, c.y)) list.push({ y: c.sortY ?? c.y + (c.isSelf ? 0.01 : 0), draw: () => drawCat(ctx, catArt, c, f.time, f.reducedMotion, fx) });
  list.sort((a, b) => a.y - b.y);
  for (const d of list) d.draw();
  ctx.restore();
  drawGrade(ctx, f);
  ctx.save();
  ctx.translate(-f.camX, -f.camY);
  drawRegionGlows(ctx, art, f, visible);
  drawFx(ctx, fx, f);
  // quest markers over NPCs with something new to say
  if (f.adv) for (const s of f.adv.spots) if (s.role === 'npc' && f.adv.highlight.has(s.id) && visible(s.point.x, s.point.y)) questBang(ctx, s.point.x, s.point.y - 38 + (f.reducedMotion ? 0 : Math.round(Math.sin(f.time * 5) * 1.5)));
  if (target) {
    const y = target.point.y - 34 + (f.reducedMotion ? 0 : Math.round(Math.sin(f.time * 6) * 2));
    rect(ctx, target.point.x - 4, y - 6, 9, 3, '#2a1d2f'); rect(ctx, target.point.x - 3, y - 3, 7, 2, '#2a1d2f'); rect(ctx, target.point.x - 1, y - 1, 3, 2, '#2a1d2f');
    rect(ctx, target.point.x - 3, y - 5, 7, 1, '#ffc94a'); rect(ctx, target.point.x - 2, y - 4, 5, 1, '#ffc94a'); rect(ctx, target.point.x - 1, y - 3, 3, 1, '#ffc94a'); rect(ctx, target.point.x, y - 2, 1, 1, '#ffc94a');
  }
  ctx.restore();
  if (!def.climate.dark && !def.climate.sky && !def.climate.indoor) drawSky(ctx, f);
  if (def.climate.snow) drawAurora(ctx, f);
  if (v?.has('constellation-lumi') && !def.climate.dark) {
    const clear = f.env.weather === 'sunny' || f.env.weather === 'windy';
    drawConstellation(ctx, f.viewW, f.viewH, clear ? Math.max(f.env.darkness, def.climate.sky === 'void' ? 0.8 : 0) : 0, f.time, LUMI_STARS, { x: 0.72, y: 0.06, s: 46 });
  }
  if (v?.has('our-constellation') && def.climate.sky === 'void') drawConstellation(ctx, f.viewW, f.viewH, 0.9, f.time, [[0, 0.5], [0.9, 0.3]], { x: 0.2, y: 0.08, s: 40 });
  if (!def.climate.dark && !def.climate.indoor) drawWeather(ctx, f);
  drawVignette(ctx, f);
}
