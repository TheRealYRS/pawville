/**
 * Per-frame rendering of the town: static layer + y-sorted props and cats + animated details,
 * the live park objects (swing, seesaw, picnic, garden, bobber), and the environment
 * (weather particles, puddles, snow, stars, fireflies, day/night grading).
 * Standard Canvas 2D only, so it runs in browsers and in Node (skia-canvas) for previews/tests.
 * Particles are stateless (derived from time + index), so there is nothing to leak or grow.
 */
import type { FairFrame } from './funfairArt.ts';
import type { Accessory } from '../../game/types';
import type { CoatId, ExtraId } from '../appearance.ts';
import { gradeFor, type Environment } from '../world/environment.ts';
import { drawLamp, lampLight, nightGradeAlpha, vignetteAlpha } from './lighting.ts';
import type { Facing } from '../world/movement.ts';
import {
  BUILDINGS, FOUNTAIN, GARDEN_RECT, HILL, INTERACTABLES, POND_RECT, SEATS, TILE, WORLD_H, WORLD_W,
  type Prop, type TownLayout,
} from '../world/townMap.ts';
import { pixelEllipse, rect, type CanvasFactory, type CanvasLike } from './canvasTypes.ts';
import type { EmoteId } from '../net/presenceProtocol.ts';
import { CatSpriteCache, SPRITE_ANCHOR, eyeSpritePixels, type CatPose, type SpriteKey } from './catSprites.ts';
import { emoteFrame, emoteParticles, type EmoteFrame, type Particle } from './emoteAnim.ts';
import { emoteDef } from '../couple/emotes.ts';
import { COAT_INFO } from '../appearance.ts';
import { buildPropSprites, propSpriteKey, renderStaticWorld, type PropSprite } from './townArt.ts';
import { drawConstellation, drawSpotMarkers, drawTownGate, drawTrail, LUMI_STARS, questBang, type AdvFrame } from './adventureFx.ts';
import { TOWN_CABLECAR, TOWN_FOREST_GATE, TOWN_PIER_END } from '../adventure/regions.ts';

export interface CatRenderState {
  id: string;
  coat: CoatId;
  accessory: Accessory;
  extra: ExtraId;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  pose: CatPose;
  /** Extra vertical offset (e.g. swinging). */
  lift: number;
  animTime: number;
  isSelf: boolean;
  /** Decorative stand-in for an offline partner — drawn faded, never presented as live. */
  placeholder?: boolean;
  /** Milestone 4: the emote being played and how far into it we are (ms). */
  emote?: EmoteId | null;
  emoteT?: number;
  /** World x of the partner this cat is interacting with (shared emotes turn toward it). */
  towardX?: number | null;
  running?: boolean;
  /** Funfair: draw order override (a rider sits between the back and the front of its seat) … */
  sortY?: number;
  /** … and riders in the air have no ground shadow / "this is you" ring (the ride draws its own). */
  noShadow?: boolean;
}

export interface GardenPlantView {
  plot: number; // 0..5
  stage: number; // 0 seed, 1 sprout, 2 bud, 3 bloom
  color: string;
}

export interface WorldDynamics {
  swingAngles: [number, number];
  seesawTilt: number; // -1..1 (left seat down = -1)
  picnic: { x: number; y: number; blanket: string } | null;
  garden: GardenPlantView[];
  collected: ReadonlySet<string>; // shell-n / toy-n already found
  bobber: { x: number; y: number; bite: boolean } | null;
  pawprints: readonly { x: number; y: number; age: number }[];
  shootingStar: number | null; // 0..1 progress
}

export const EMPTY_DYNAMICS: WorldDynamics = {
  swingAngles: [0, 0], seesawTilt: 0, picnic: null, garden: [], collected: new Set(), bobber: null, pawprints: [], shootingStar: null,
};

export interface FrameState {
  camX: number;
  camY: number;
  viewW: number;
  viewH: number;
  time: number;
  cats: readonly CatRenderState[];
  target: string | null;
  reducedMotion: boolean;
  env: Environment;
  dyn: WorldDynamics;
  /** Lower particle counts for weak devices. */
  lowPower?: boolean;
  ferrisAngle?: number;
  /** Funfair: the shared ride clock and which seats are taken (rides animate from it). */
  fair?: FairFrame;
  /** Milestone 6: the adventure layer (quest spots, markers, world flags). Optional — without it the town draws exactly as before. */
  adv?: AdvFrame;
  /** Milestone 6: non-cat creatures (Lumi) at feet positions. */
  creatures?: readonly { x: number; y: number; kind: 'lumi' }[];
}

export interface TownArt {
  staticLayer: CanvasLike;
  props: PropSprite[];
  layout: TownLayout;
  cats: CatSpriteCache;
}

export function createTownArt(factory: CanvasFactory, layout: TownLayout): TownArt {
  const sprites = buildPropSprites(factory);
  return {
    staticLayer: renderStaticWorld(factory, layout.ground),
    props: layout.props.map((p) => sprites[propSpriteKey(p.kind, p.variant)]),
    layout,
    cats: new CatSpriteCache(factory),
  };
}

const LAMP_GLOW = 'rgba(255, 196, 110, 0.16)';
const MARKER_Y: Record<string, number> = { 'event-board': 383, 'whack-a-cat': 437 };

/** Hash-based pseudo random in [0,1) for stateless particles. */
function h1(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function drawFountain(ctx: CanvasRenderingContext2D, t: number, still: boolean, frozen: boolean) {
  const { x, y } = FOUNTAIN;
  pixelEllipse(ctx, x, y - 6, 30, 13, 'rgba(20,12,30,0.25)');
  pixelEllipse(ctx, x, y - 10, 29, 13, '#7d6f94');
  pixelEllipse(ctx, x, y - 12, 27, 12, '#cfc6e3');
  pixelEllipse(ctx, x, y - 12, 23, 9, frozen ? '#bcd6ef' : '#3a6ea8');
  const phase = still ? 0 : Math.floor(t * 4) % 3;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + phase * 0.35;
    rect(ctx, x + Math.cos(a) * 15, y - 12 + Math.sin(a) * 5, 3, 1, frozen ? '#e8f3ff' : '#7fb2e6');
  }
  rect(ctx, x - 3, y - 30, 6, 18, '#b7aac8');
  rect(ctx, x - 3, y - 30, 2, 18, '#d9cfee');
  pixelEllipse(ctx, x, y - 31, 10, 4, '#cfc6e3');
  pixelEllipse(ctx, x, y - 31, 7, 2, '#5d93c9');
  rect(ctx, x - 3, y - 41, 6, 7, '#e9dccf');
  rect(ctx, x - 3, y - 43, 2, 2, '#e9dccf');
  rect(ctx, x + 1, y - 43, 2, 2, '#e9dccf');
  rect(ctx, x - 2, y - 39, 1, 1, '#7d6f94');
  rect(ctx, x + 1, y - 39, 1, 1, '#7d6f94');
  if (frozen) return;
  const drops = still ? 1 : 4;
  for (let i = 0; i < drops; i++) {
    const k = still ? 0.5 : (t * 1.6 + i / drops) % 1;
    for (const side of [-1, 1]) rect(ctx, x + side * (2 + k * 12), y - 36 + k * 24 - Math.sin(k * Math.PI) * 6, 2, 2, '#bfe1ff');
  }
}

function drawWaterShimmer(ctx: CanvasRenderingContext2D, f: FrameState) {
  if (f.reducedMotion) return;
  const rain = f.env.weather.includes('rain');
  const startCol = Math.max(41, Math.floor(f.camX / TILE));
  const endCol = Math.min(47, Math.ceil((f.camX + f.viewW) / TILE));
  const startRow = Math.max(0, Math.floor(f.camY / TILE));
  const endRow = Math.min(53, Math.ceil((f.camY + f.viewH) / TILE));
  for (let r = startRow; r <= endRow; r++) {
    if (r === 22 || r === 23) continue;
    for (let c = startCol; c <= endCol; c++) {
      const k = Math.sin(f.time * (1.7 + f.env.wind) + c * 1.3 + r * 0.7);
      if (k > 0.55) rect(ctx, c * TILE + 3 + Math.round(k * 4), r * TILE + 6 + (c % 3) * 2, 5, 1, 'rgba(216,236,255,0.55)');
      if (rain && h1(c * 31 + r * 7 + Math.floor(f.time * 3)) > 0.8) pixelEllipse(ctx, c * TILE + 8, r * TILE + 8, 3, 1, 'rgba(216,236,255,0.5)');
    }
  }
}

function drawPond(ctx: CanvasRenderingContext2D, f: FrameState) {
  // lily pads + (at night) a little moon reflection
  for (const [dx, dy] of [[14, 12], [52, 30], [30, 38]]) {
    pixelEllipse(ctx, POND_RECT.x + dx, POND_RECT.y + dy, 5, 3, '#4f9a67');
    rect(ctx, POND_RECT.x + dx, POND_RECT.y + dy - 1, 2, 1, '#2f6b3a');
  }
  if (f.env.darkness > 0.5) pixelEllipse(ctx, POND_RECT.x + 44, POND_RECT.y + 14, 4, 2, 'rgba(255,243,230,0.6)');
}

/** Small per-cat hash so idle blinks / ear twitches are never in sync between cats. */
function catSeed(id: string): number {
  let hsh = 7;
  for (let i = 0; i < id.length; i++) hsh = (hsh * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(hsh) % 1000) / 1000;
}

/** Resolve the facing for an emote frame (camera / partner) without changing the cat's own state. */
function emoteFacing(c: CatRenderState, f: EmoteFrame | null): CatRenderState['facing'] {
  if (!f || f.face === 'keep') return c.facing;
  if (f.face === 'camera') return 'down';
  if (typeof c.towardX === 'number') return c.towardX >= c.x ? 'right' : 'left';
  return c.facing;
}

export interface CatPlan {
  key: SpriteKey;
  dx: number;
  dy: number;
  frame: EmoteFrame | null;
  facing: CatRenderState['facing'];
}

/** Everything about how a cat looks this frame (pure; shared by the town renderer and photo mode). */
export function planCat(c: CatRenderState, time: number, reducedMotion: boolean): CatPlan {
  const ef = c.emote ? emoteFrame(c.emote, c.emoteT ?? 0, reducedMotion) : null;
  const facing = emoteFacing(c, ef);
  const moving = c.moving && !ef;
  // The emote timeline drives the pose unless the cat is held in a different pose by a seat.
  const defPose = c.emote ? emoteDef(c.emote)?.pose : undefined;
  const pose: CatPose = ef && (c.pose === 'stand' || c.pose === defPose) ? ef.pose : c.pose;
  const speed = moving ? (c.running ? 13 : 9) : 1.6;
  const frame = reducedMotion && !moving ? 0 : Math.floor(c.animTime * speed) % 4;
  const seed = catSeed(c.id);
  // Idle life: a blink every few seconds, an occasional ear twitch, slow breathing.
  const idle = !moving && !ef && pose !== 'loaf';
  const cyc = (time + seed * 7) % 4.2;
  const blink = idle && !reducedMotion && cyc < 0.13;
  const twitch = idle && !reducedMotion && ((time + seed * 11) % 9.3) < 0.18;
  // Milestone 10 idle life: a cat that has been still for a while grooms (paw to face, eyes shut)
  // and flicks its tail now and then. Timed from when the cat stopped (animTime resets on stop).
  const longIdle = idle && !reducedMotion && c.animTime > 5 && c.pose === 'stand';
  const ic = longIdle ? (c.animTime + seed * 3) % 12 : -1;
  const grooming = ic >= 0 && ic < 1.6 && (facing === 'down' || facing === 'left' || facing === 'right');
  const flick = ic >= 6 && ic < 6.8;
  let dx = ef?.dx ?? 0;
  if (ef && ef.face === 'partner' && typeof c.towardX === 'number' && c.towardX < c.x) dx = -dx; // lean TOWARD the partner
  const key: SpriteKey = {
    coat: c.coat, accessory: c.accessory, extra: c.extra, facing, frame, moving, pose,
    eyes: ef ? ef.eyes : blink || grooming ? 'closed' : 'open',
    ears: ef ? ef.ears : twitch ? 'perk' : 'up',
    paw: ef?.paw ?? (grooming ? (facing === 'down' ? 'right' : 'forward') : 'none'),
    pawLift: ef?.pawLift ?? (grooming ? 2 + (Math.floor(ic * 6) % 2) : 0), pawDx: ef?.pawDx ?? 0, cheeks: ef?.cheeks ?? false,
    tail: ef && ef.tail !== 0 ? (ef.tail > 0.33 ? 1 : ef.tail < -0.33 ? -1 : 0) : flick ? (Math.floor(ic * 5) % 2 ? 1 : -1) : 0,
    run: !!c.running && moving,
  };
  // Milestone 6: whole-body signature poses only while the emote owns the pose (never on a seat).
  if (ef && ef.body !== 'none' && pose === ef.pose) {
    key.body = ef.body;
    key.bodyK = ef.bodyK;
    key.arms = ef.arms;
  }
  if (ef && ef.tilt) key.tilt = ef.tilt;
  return { key, dx, dy: ef?.dy ?? 0, frame: ef, facing };
}

export function drawCat(ctx: CanvasRenderingContext2D, art: TownArt, c: CatRenderState, time: number, reducedMotion: boolean, fx: FxItem[]) {
  const plan = planCat(c, time, reducedMotion);
  const sprite = art.cats.get(plan.key);
  const x = Math.round(c.x + plan.dx);
  const y = Math.round(c.y + plan.dy - c.lift);
  // Two-tone contact shadow (soft outer, darker core). Shrinks while the cat is airborne.
  const air = Math.max(0, -plan.dy) + c.lift;
  const sw = Math.max(3, 7 - Math.round(air / 2));
  if (!c.noShadow) {
    pixelEllipse(ctx, Math.round(c.x + plan.dx), Math.round(c.y), sw + 1, 2, 'rgba(20,12,30,0.18)');
    pixelEllipse(ctx, Math.round(c.x + plan.dx), Math.round(c.y), sw - 1, 1, 'rgba(20,12,30,0.32)');
  }
  if (c.isSelf && !c.placeholder && !c.noShadow) {
    // "This one is you": a small cream ring at your own cat's feet (never drawn for remote cats).
    const rx = sw + 3, ry = 3, cx = Math.round(c.x), cy = Math.round(c.y);
    ctx.globalAlpha = 0.75;
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * Math.PI * 2;
      rect(ctx, cx + Math.round(Math.cos(t) * rx), cy + Math.round(Math.sin(t) * ry), 1, 1, '#fff3e6');
    }
    ctx.globalAlpha = 1;
  }
  if (c.placeholder) ctx.globalAlpha = 0.45;
  ctx.drawImage(sprite as unknown as CanvasImageSource, x - SPRITE_ANCHOR.x, y - SPRITE_ANCHOR.y);
  ctx.globalAlpha = 1;
  if (c.isSelf && c.noShadow && !c.placeholder) {
    // "This one is you" when there is no ground under the cat for the ring (up on a Ferris wheel): a small cream marker above the head,
    // so two cats of the same colour sharing a ride can always be told apart.
    rect(ctx, x - 2, y - 24, 5, 1, '#fff3e6'); rect(ctx, x - 1, y - 23, 3, 1, '#fff3e6'); rect(ctx, x, y - 22, 1, 1, '#fff3e6');
  }
  if (c.placeholder) return;
  // Effects (and the night-time eye glint) are drawn later, in the light pass, so they stay
  // bright at night and are never hidden behind a tree drawn after this cat.
  fx.push({ c, x, y, plan });
}

export interface FxItem {
  c: CatRenderState;
  x: number;
  y: number;
  plan: CatPlan;
}

function particle(ctx: CanvasRenderingContext2D, p: Particle, ox: number, oy: number) {
  const x = Math.round(ox + p.x);
  const y = Math.round(oy + p.y);
  ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
  const c = p.color;
  const big = p.size === 2;
  switch (p.kind) {
    case 'heart':
      if (big) { rect(ctx, x - 3, y - 2, 2, 1, c); rect(ctx, x + 1, y - 2, 2, 1, c); rect(ctx, x - 4, y - 1, 8, 2, c); rect(ctx, x - 3, y + 1, 6, 1, c); rect(ctx, x - 2, y + 2, 4, 1, c); rect(ctx, x - 1, y + 3, 2, 1, c); rect(ctx, x - 3, y - 1, 1, 1, '#FFFFFF'); }
      else { rect(ctx, x - 2, y - 1, 1, 1, c); rect(ctx, x, y - 1, 1, 1, c); rect(ctx, x - 2, y, 3, 1, c); rect(ctx, x - 1, y + 1, 1, 1, c); }
      break;
    case 'note': rect(ctx, x, y - 3, 1, 4, c); rect(ctx, x - 2, y, 2, 2, c); rect(ctx, x + 1, y - 3, 2, 1, c); break;
    case 'star':
      rect(ctx, x, y - 2, 1, 5, c); rect(ctx, x - 2, y, 5, 1, c);
      if (big) { rect(ctx, x - 1, y - 1, 3, 3, c); rect(ctx, x, y, 1, 1, '#FFFFFF'); }
      break;
    case 'spark': rect(ctx, x, y, 1, 1, c); if (big) { rect(ctx, x - 1, y, 3, 1, c); rect(ctx, x, y - 1, 1, 3, c); } break;
    case 'z':
      if (big) { rect(ctx, x, y, 4, 1, c); rect(ctx, x + 2, y + 1, 1, 1, c); rect(ctx, x + 1, y + 2, 1, 1, c); rect(ctx, x, y + 3, 4, 1, c); }
      else { rect(ctx, x, y, 3, 1, c); rect(ctx, x + 1, y + 1, 1, 1, c); rect(ctx, x, y + 2, 3, 1, c); }
      break;
    case 'puff': pixelEllipse(ctx, x, y, 2, 1, c); rect(ctx, x - 1, y - 1, 2, 1, c); break;
    case 'drop': rect(ctx, x, y, 1, 1, c); rect(ctx, x - 1, y + 1, 3, 2, c); break;
    case 'paw': rect(ctx, x - 1, y, 3, 2, c); rect(ctx, x - 2, y - 1, 1, 1, c); rect(ctx, x, y - 2, 1, 1, c); rect(ctx, x + 2, y - 1, 1, 1, c); break;
    case 'bang': rect(ctx, x, y - 4, 2, 5, c); rect(ctx, x, y + 2, 2, 2, c); rect(ctx, x - 1, y - 4, 1, 4, '#2a1d2f'); break;
    case 'wave': rect(ctx, x - 3, y, 2, 1, c); rect(ctx, x - 1, y - 1, 2, 1, c); rect(ctx, x + 1, y, 2, 1, c); rect(ctx, x + 3, y - 1, 2, 1, c); break;
    case 'ring': {
      // a thin, hollow emerald halo (never a filled blob over the fur)
      const rx = big ? 10 : 7, ry = big ? 7 : 5;
      for (let a = 0; a < 20; a++) {
        const t = (a / 20) * Math.PI * 2;
        rect(ctx, x + Math.round(Math.cos(t) * rx), y + Math.round(Math.sin(t) * ry), 1, 1, c);
      }
      break;
    }
    case 'text': {
      const t = p.text ?? '';
      ctx.font = '600 6px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      const w = Math.ceil(ctx.measureText(t).width) + 4;
      rect(ctx, x - Math.ceil(w / 2), y - 6, w, 8, 'rgba(23,19,30,0.82)');
      ctx.fillStyle = c;
      ctx.fillText(t, x, y);
      break;
    }
  }
  ctx.globalAlpha = 1;
}

/** Glowing emerald eyes (Starpaw Serenade) and a soft eye glint at night so eyes stay readable. */
function eyeLight(ctx: CanvasRenderingContext2D, item: FxItem, darkness: number) {
  const { c, plan } = item;
  if (plan.key.pose === 'loaf' || plan.facing === 'up') return;
  if (plan.key.body && plan.key.body !== 'none') return; // eye positions differ in body poses
  if (COAT_INFO[c.coat]?.species === 'raccoon' && darkness < 0.45) return;
  const glow = plan.frame?.glow ?? 0;
  const eyes = plan.key.eyes ?? 'open';
  if (eyes === 'closed' || eyes === 'happy') return;
  const info = COAT_INFO[c.coat] ?? COAT_INFO.tangerine;
  const vivid = c.coat === 'mini';
  const a = Math.max(glow, darkness > 0.45 ? (vivid ? 0.75 : 0.35) * Math.min(1, (darkness - 0.45) * 3) : 0);
  if (a <= 0.02) return;
  // The light sits exactly on the sprite's own eye pixels: eyeSpritePixels follows the body bob (walk, run, sit), the mirrored
  // sprite and the head tilt, because it is read from the same maps and the same bob the sprite itself is painted with.
  const ox = item.x - SPRITE_ANCHOR.x, oy = item.y - SPRITE_ANCHOR.y;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [sx, sy] of eyeSpritePixels(plan.key)) {
    ctx.globalAlpha = a;
    rect(ctx, ox + sx, oy + sy, 1, 1, info.pixel.e);
    if (glow > 0.2) {
      // a 1px soft bloom around each eye pixel (plus-shaped, restrained)
      ctx.globalAlpha = glow * 0.22;
      rect(ctx, ox + sx - 1, oy + sy, 3, 1, info.pixel.e);
      rect(ctx, ox + sx, oy + sy - 1, 1, 3, info.pixel.e);
    }
  }
  ctx.restore();
}

export function drawFx(ctx: CanvasRenderingContext2D, items: readonly FxItem[], f: FrameState) {
  for (const it of items) {
    eyeLight(ctx, it, f.env.darkness);
    if (!it.c.emote) continue;
    let parts: Particle[] = [];
    try {
      parts = emoteParticles(it.c.emote, it.c.emoteT ?? 0, f.reducedMotion, it.plan.frame);
    } catch {
      parts = []; // a broken effect must never break the frame
    }
    // Mirror horizontal offsets for shared emotes when the partner is on the left.
    const flip = it.plan.frame?.face === 'partner' && typeof it.c.towardX === 'number' && it.c.towardX < it.c.x ? -1 : 1;
    const baseX = Math.round(it.c.x);
    const baseY = Math.round(it.c.y - it.c.lift);
    for (const p of parts) particle(ctx, flip === 1 ? p : { ...p, x: -p.x }, baseX, baseY);
  }
}

function drawSwingSeats(ctx: CanvasRenderingContext2D, angles: [number, number]) {
  SEATS.swing.forEach((seat, i) => {
    const pivot = { x: seat.x, y: seat.y - 38 };
    const a = angles[i];
    const sx = pivot.x + Math.sin(a) * 30;
    const sy = pivot.y + Math.cos(a) * 30;
    ctx.strokeStyle = '#3b2b3f';
    ctx.lineWidth = 1;
    for (const off of [-5, 5]) {
      ctx.beginPath();
      ctx.moveTo(pivot.x + off, pivot.y);
      ctx.lineTo(sx + off, sy);
      ctx.stroke();
    }
    rect(ctx, sx - 7, sy, 14, 3, '#ff8a35');
    rect(ctx, sx - 7, sy + 2, 14, 1, '#b54f14');
  });
}

/** Seat position for swing seat i at angle a (used to place sitting cats). */
export function swingSeatPos(i: 0 | 1, a: number): { x: number; y: number } {
  const seat = SEATS.swing[i];
  return { x: seat.x + Math.sin(a) * 30, y: seat.y - 38 + Math.cos(a) * 30 + 1 };
}

export function seesawSeatPos(i: 0 | 1, tilt: number): { x: number; y: number } {
  const seat = SEATS.seesaw[i];
  const side = i === 0 ? -1 : 1;
  return { x: seat.x, y: seat.y - 8 - tilt * side * -6 };
}

function drawSeesawPlank(ctx: CanvasRenderingContext2D, tilt: number) {
  const cx = 304;
  const cy = 762;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt * 0.22);
  ctx.fillStyle = '#9b6b43';
  ctx.fillRect(-30, -2, 60, 4);
  ctx.fillStyle = '#b5835a';
  ctx.fillRect(-30, -2, 60, 1);
  ctx.fillStyle = '#ff8a35';
  ctx.fillRect(-30, -4, 5, 2);
  ctx.fillStyle = '#a89bc9';
  ctx.fillRect(25, -4, 5, 2);
  ctx.restore();
}

function drawPicnic(ctx: CanvasRenderingContext2D, p: NonNullable<WorldDynamics['picnic']>) {
  const colors: Record<string, [string, string]> = {
    gingham: ['#ff8a35', '#ffe9cf'], lavender: ['#a89bc9', '#efeaff'], mint: ['#7ee0d2', '#e9fffb'], rose: ['#ff6fa1', '#ffe1ec'],
  };
  const [a, b] = colors[p.blanket] ?? colors.gingham;
  for (let y = 0; y < 16; y += 4) for (let x = 0; x < 40; x += 4) rect(ctx, p.x - 20 + x, p.y - 10 + y, 4, 4, (x / 4 + y / 4) % 2 ? a : b);
  rect(ctx, p.x - 6, p.y - 8, 10, 6, '#8a5a3b'); rect(ctx, p.x - 6, p.y - 8, 10, 2, '#b5835a'); rect(ctx, p.x - 3, p.y - 12, 4, 4, '#5a3a22');
  pixelEllipse(ctx, p.x + 10, p.y - 4, 3, 2, '#fff3e6'); rect(ctx, p.x + 9, p.y - 6, 3, 2, '#e0475c');
}

function drawGarden(ctx: CanvasRenderingContext2D, plants: readonly GardenPlantView[], sway: number) {
  for (const p of plants) {
    const x = GARDEN_RECT.x + 10 + p.plot * 15;
    const y = GARDEN_RECT.y + GARDEN_RECT.h - 8;
    if (p.stage === 0) { rect(ctx, x, y, 3, 2, '#3a2416'); continue; }
    const h = p.stage === 1 ? 5 : p.stage === 2 ? 10 : 14;
    const s = Math.round(sway * (p.stage / 3));
    rect(ctx, x + 1 + s, y - h, 1, h, '#4f9a67');
    rect(ctx, x - 1 + s, y - h / 2, 2, 1, '#7edb8c'); rect(ctx, x + 2 + s, y - h / 2 - 2, 2, 1, '#7edb8c');
    if (p.stage === 2) rect(ctx, x + s, y - h - 2, 3, 3, '#4f9a67');
    if (p.stage === 3) { rect(ctx, x - 1 + s, y - h - 3, 5, 3, p.color); rect(ctx, x + s, y - h - 4, 3, 5, p.color); rect(ctx, x + 1 + s, y - h - 2, 1, 1, '#ffd36b'); }
  }
}

function drawCollectibles(ctx: CanvasRenderingContext2D, collected: ReadonlySet<string>, t: number) {
  for (const it of INTERACTABLES) {
    if (it.action !== 'shell' && it.action !== 'toy') continue;
    if (collected.has(it.id)) continue;
    const { x, y } = it.point;
    if (it.action === 'shell') {
      pixelEllipse(ctx, x, y - 2, 3, 2, '#ffe1ec'); rect(ctx, x - 1, y - 3, 1, 2, '#e8a7bc'); rect(ctx, x + 1, y - 3, 1, 2, '#e8a7bc');
    } else {
      const bob = Math.round(Math.sin(t * 3 + x) * 1);
      pixelEllipse(ctx, x, y - 3 + bob, 3, 3, '#ff6fa1'); rect(ctx, x - 1, y - 7 + bob, 2, 2, '#ffd36b');
      if (Math.floor(t * 2 + x) % 6 === 0) rect(ctx, x + 4, y - 9, 1, 1, '#fff3e6');
    }
  }
}

export function drawProp(ctx: CanvasRenderingContext2D, prop: Prop, sprite: PropSprite | undefined, f: FrameState) {
  if (prop.kind === 'fountain') {
    drawFountain(ctx, f.time, f.reducedMotion, f.env.weather === 'snow' && f.env.blend > 0.6);
    return;
  }
  if (!sprite) return;
  let y = prop.y;
  if (prop.kind === 'boat' && !f.reducedMotion) y += Math.round(Math.sin(f.time * 1.4) * (1.5 + f.env.wind * 2));
  ctx.drawImage(sprite.canvas as unknown as CanvasImageSource, Math.round(prop.x + sprite.ox), Math.round(y + sprite.oy));
  // snow caps on trees and roofs-ish props
  if (f.env.snowCover > 0.3 && (prop.kind === 'tree' || prop.kind === 'pine' || prop.kind === 'appletree' || prop.kind === 'bush')) {
    ctx.globalAlpha = Math.min(1, f.env.snowCover);
    pixelEllipse(ctx, prop.x - 1, prop.y + sprite.oy + 4, prop.kind === 'bush' ? 6 : 8, 2, '#f4f8ff');
    ctx.globalAlpha = 1;
  }
  if (prop.kind === 'napcat' && !f.reducedMotion) {
    const k = (f.time * 0.45) % 1;
    ctx.globalAlpha = 1 - k;
    rect(ctx, prop.x + 4 + k * 6, prop.y - 12 - k * 10, 3, 1, '#fff3e6');
    rect(ctx, prop.x + 6 + k * 6, prop.y - 11 - k * 10, 1, 1, '#fff3e6');
    rect(ctx, prop.x + 4 + k * 6, prop.y - 10 - k * 10, 3, 1, '#fff3e6');
    ctx.globalAlpha = 1;
  }
  if (prop.kind === 'swing') drawSwingSeats(ctx, f.dyn.swingAngles);
  if (prop.kind === 'seesaw') drawSeesawPlank(ctx, f.dyn.seesawTilt);
  if (prop.kind === 'fence') drawGarden(ctx, f.dyn.garden, f.reducedMotion ? 0 : Math.sin(f.time * 2) * f.env.wind * 2);
}

export function drawGlows(ctx: CanvasRenderingContext2D, props: readonly Prop[], f: FrameState) {
  const night = f.env.darkness;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of props) {
    if (p.kind !== 'lamp') continue;
    const flicker = f.reducedMotion ? 0 : Math.sin(f.time * 3 + p.x) * 0.6;
    drawLamp(ctx, p.x, p.y, p.y - 18, '255, 210, 130', lampLight(night, flicker));
    pixelEllipse(ctx, p.x, p.y - 20, 4, 3, LAMP_GLOW);
  }
  for (const b of BUILDINGS) pixelEllipse(ctx, b.door.x + b.door.w / 2, b.rect.y + b.rect.h + 4, 20, 6, `rgba(255, 210, 140, ${(0.12 + night * 0.2).toFixed(3)})`);
  const arcade = BUILDINGS[0];
  const pulse = f.reducedMotion ? 0.12 : 0.08 + (Math.sin(f.time * 2.2) + 1) * 0.06 + night * 0.08;
  ctx.fillStyle = `rgba(255, 138, 53, ${pulse.toFixed(3)})`;
  ctx.fillRect(arcade.rect.x + 28, arcade.rect.y - 4, arcade.rect.w - 56, 34);
  ctx.restore();
}

export function drawButterflies(ctx: CanvasRenderingContext2D, f: FrameState) {
  if (f.reducedMotion || f.env.darkness > 0.4 || f.env.weather !== 'sunny') return;
  const spots = [
    { x: 80, y: 500, c: '#ffd36b' }, { x: 240, y: 410, c: '#ff8fb1' }, { x: 300, y: 120, c: '#b9a5ff' }, { x: 640, y: 380, c: '#fff3e6' },
    { x: 440, y: 640, c: '#ff8fb1' }, { x: 300, y: 760, c: '#ffd36b' }, { x: 470, y: 780, c: '#fff3e6' },
  ];
  spots.forEach((s, i) => {
    const t = f.time * 0.6 + i * 1.7;
    const x = s.x + Math.sin(t) * 26 + Math.sin(t * 2.3) * 6 + f.env.wind * 10;
    const y = s.y + Math.cos(t * 0.8) * 14 - 10;
    const open = Math.floor(f.time * 10 + i) % 2 === 0;
    rect(ctx, x - (open ? 2 : 1), y, open ? 2 : 1, 2, s.c);
    rect(ctx, x + 1, y, open ? 2 : 1, 2, s.c);
    rect(ctx, x, y, 1, 2, '#2a1d2f');
  });
}

export function drawFireflies(ctx: CanvasRenderingContext2D, f: FrameState) {
  if (f.env.darkness < 0.55 || f.env.weather.includes('rain') || f.env.weather === 'snow') return;
  const n = f.lowPower ? 14 : 34;
  const areas = [{ x: POND_RECT.x + 40, y: POND_RECT.y + 10, r: 70 }, { x: 440, y: 640, r: 80 }, { x: 140, y: 500, r: 60 }, { x: 590, y: 640, r: 60 }];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const a = areas[i % areas.length];
    const t = f.reducedMotion ? 0 : f.time * (0.3 + h1(i) * 0.4);
    const x = a.x + Math.sin(t + i * 2.1) * a.r * h1(i + 1);
    const y = a.y + Math.cos(t * 1.3 + i) * a.r * 0.5 * h1(i + 2);
    const on = (Math.sin(f.time * 2 + i * 1.7) + 1) / 2;
    if (on < 0.35) continue;
    pixelEllipse(ctx, x, y, 3, 3, `rgba(220, 255, 140, ${(0.12 * on).toFixed(3)})`);
    rect(ctx, x, y, 1, 1, `rgba(240, 255, 170, ${on.toFixed(3)})`);
  }
  ctx.restore();
}

function drawPuddles(ctx: CanvasRenderingContext2D, f: FrameState) {
  if (f.env.wetness < 0.15) return;
  ctx.globalAlpha = Math.min(0.85, f.env.wetness);
  for (const it of INTERACTABLES) {
    if (it.action !== 'puddle') continue;
    pixelEllipse(ctx, it.point.x, it.point.y - 2, 10, 4, '#5d7fa8');
    pixelEllipse(ctx, it.point.x - 2, it.point.y - 3, 5, 1, '#9cc3ff');
  }
  const extra = [[200, 316], [460, 320], [560, 496], [120, 488], [300, 720], [470, 712], [384, 520], [384, 180]];
  for (const [x, y] of extra) pixelEllipse(ctx, x, y, 6, 2, '#5d7fa8');
  ctx.globalAlpha = 1;
  // Milestone 4: raindrop ripples in every puddle + a faint sky sheen (wet-ground reflection).
  if (f.reducedMotion || !f.env.weather.includes('rain')) return;
  const spots: [number, number, number][] = [
    ...INTERACTABLES.filter((i) => i.action === 'puddle').map((i): [number, number, number] => [i.point.x, i.point.y - 2, 8]),
    ...extra.map(([x, y]): [number, number, number] => [x, y, 5]),
  ];
  spots.forEach(([x, y, r], i) => {
    for (let k = 0; k < 2; k++) {
      const ph = (f.time * 1.3 + h1(i * 7 + k * 13)) % 1;
      const rx = Math.max(1, Math.round(ph * r));
      ctx.globalAlpha = (1 - ph) * 0.7 * f.env.wetness;
      const ox = Math.round((h1(i * 3 + k + Math.floor(f.time * 1.3)) - 0.5) * r);
      ctx.strokeStyle = '#cfe4ff';
      ctx.beginPath();
      ctx.ellipse(x + ox + 0.5, y + 0.5, rx, Math.max(1, Math.round(rx / 2.5)), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.25 * f.env.wetness;
    rect(ctx, x - Math.round(r / 2), y - 1, Math.round(r / 2), 1, '#e9f3ff');
  });
  ctx.globalAlpha = 1;
}

/** Foliage life: flower heads nod in the breeze; leaves occasionally drift down (more in autumn). */
function drawFoliage(ctx: CanvasRenderingContext2D, art: TownArt, f: FrameState) {
  if (f.reducedMotion || f.lowPower) return;
  const left = f.camX - 16, right = f.camX + f.viewW + 16, top = f.camY - 40, bottom = f.camY + f.viewH + 16;
  const autumn = f.env.season === 'autumn';
  const leafColors = autumn ? ['#d9631a', '#e0a040', '#b5481d'] : ['#7aa845', '#5f8a35', '#9bcf6a'];
  let leaves = 0;
  art.layout.props.forEach((p, i) => {
    if ((p.kind !== 'tree' && p.kind !== 'appletree') || p.x < left || p.x > right || p.y < top || p.y > bottom) return;
    // occasional falling leaf: one every few seconds per tree, never more than 6 on screen
    const period = autumn ? 3.2 : 7.5;
    const ph = (f.time / period + h1(i * 1.7)) % 1;
    if (ph < 0.55 && leaves < 6 && h1(i * 5.3) > (autumn ? 0.2 : 0.55)) {
      leaves++;
      const k = ph / 0.55;
      const x = p.x - 8 + h1(i) * 16 + Math.sin(k * 9 + i) * 4 * (0.5 + f.env.wind);
      const y = p.y - 26 + k * 30;
      ctx.globalAlpha = Math.min(1, (1 - k) * 2);
      rect(ctx, x, y, 2, 1, leafColors[i % leafColors.length]);
      rect(ctx, x + (Math.sin(k * 12) > 0 ? 1 : 0), y + 1, 1, 1, leafColors[(i + 1) % leafColors.length]);
    }
  });
  ctx.globalAlpha = 1;
  // nodding flower heads on the flowerbeds (cheap: a handful per visible bed tile)
  const sway = Math.sin(f.time * (1.4 + f.env.wind * 2));
  for (const [x, y, col] of FLOWER_SPOTS) {
    if (x < left || x > right || y < top || y > bottom) continue;
    const dx = Math.round(sway * (0.6 + f.env.wind) * ((x + y) % 2 ? 1 : -1));
    rect(ctx, x + dx - 1, y - 3, 3, 1, col);
    rect(ctx, x + dx, y - 4, 1, 3, col);
    rect(ctx, x + dx, y - 3, 1, 1, '#ffe27a');
  }
}

/** Water: drifting reflections of the sky, ripple rings around the dock posts and the boat. */
function drawWaterLife(ctx: CanvasRenderingContext2D, f: FrameState) {
  if (f.reducedMotion) return;
  const rings: [number, number][] = [[660, 384], [692, 384], [724, 384], [724, 432], [200, 790]];
  rings.forEach(([x, y], i) => {
    if (x < f.camX - 20 || x > f.camX + f.viewW + 20 || y < f.camY - 20 || y > f.camY + f.viewH + 20) return;
    const ph = (f.time * 0.6 + i * 0.37) % 1;
    ctx.globalAlpha = (1 - ph) * 0.45;
    ctx.strokeStyle = '#d8ecff';
    ctx.beginPath();
    ctx.ellipse(x + 0.5, y + 0.5, 3 + ph * 8, 1 + ph * 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  // a slow band of reflected sky light sweeping across the harbour
  const band = ((f.time * 8) % 140) - 20;
  ctx.globalAlpha = f.env.darkness > 0.5 ? 0.06 : 0.1;
  for (let y = Math.max(0, Math.floor(f.camY / 16) * 16); y < Math.min(WORLD_H, f.camY + f.viewH); y += 16) {
    rect(ctx, 41 * TILE + band + ((y / 16) % 3) * 9, y + 4, 12, 1, '#ffffff');
  }
  ctx.globalAlpha = 1;
}

/** Fixed flower positions on the flowerbeds (computed once). */
const FLOWER_SPOTS: [number, number, string][] = (() => {
  const out: [number, number, string][] = [];
  const beds: [number, number, number, number][] = [[3, 30, 6, 33], [11, 32, 14, 33], [15, 24, 16, 27]];
  const cols = ['#ff8fb1', '#ffd36b', '#fff3e6', '#b9a5ff', '#ff9d5c'];
  let n = 0;
  for (const [c0, r0, c1, r1] of beds) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    out.push([c * TILE + 4 + Math.floor(h1(n) * 8), r * TILE + 6 + Math.floor(h1(n + 50) * 8), cols[n % cols.length]]);
    n++;
  }
  return out;
})();

/** Interaction feedback: a soft pulsing ring on the ground where the prompt applies. */
function drawTargetRing(ctx: CanvasRenderingContext2D, target: string | null, f: FrameState) {
  if (!target) return;
  const item = INTERACTABLES.find((i) => i.id === target) ?? f.adv?.spots.find((s) => s.id === target);
  if (!item) return;
  const k = f.reducedMotion ? 0.5 : (Math.sin(f.time * 4) + 1) / 2;
  ctx.globalAlpha = 0.35 + k * 0.25;
  ctx.strokeStyle = '#ffc94a';
  ctx.beginPath();
  ctx.ellipse(item.point.x + 0.5, item.point.y + 0.5, 9 + k * 2, 3 + k, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawSnowGround(ctx: CanvasRenderingContext2D, f: FrameState) {
  if (f.env.snowCover <= 0.02) return;
  ctx.fillStyle = `rgba(244, 248, 255, ${(f.env.snowCover * 0.55).toFixed(3)})`;
  ctx.fillRect(f.camX, f.camY, f.viewW, f.viewH);
  for (const p of f.dyn.pawprints) {
    const a = Math.max(0, 1 - p.age / 20) * f.env.snowCover;
    if (a <= 0) continue;
    ctx.fillStyle = `rgba(150, 160, 190, ${(a * 0.7).toFixed(3)})`;
    ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2);
  }
}

export function drawSky(ctx: CanvasRenderingContext2D, f: FrameState) {
  // Stars appear over the scene at night when the sky is clear.
  const clear = f.env.weather === 'sunny' || f.env.weather === 'windy';
  const amount = clear ? f.env.darkness : f.env.darkness * 0.15;
  if (amount < 0.2) return;
  const n = f.lowPower ? 40 : 90;
  for (let i = 0; i < n; i++) {
    const x = h1(i * 3) * f.viewW;
    const y = h1(i * 3 + 1) * f.viewH * 0.75;
    const tw = f.reducedMotion ? 1 : (Math.sin(f.time * (1 + h1(i)) + i) + 1.4) / 2.4;
    ctx.fillStyle = `rgba(255, 243, 230, ${(amount * tw * 0.75).toFixed(3)})`;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  if (f.dyn.shootingStar !== null && clear) {
    const k = f.dyn.shootingStar;
    const x = f.viewW * (0.2 + k * 0.5);
    const y = f.viewH * (0.1 + k * 0.18);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(255, 243, 230, ${((1 - i / 12) * (1 - k)).toFixed(3)})`;
      ctx.fillRect(Math.round(x - i * 3), Math.round(y - i * 1.1), 2, 1);
    }
  }
}

export function drawWeather(ctx: CanvasRenderingContext2D, f: FrameState) {
  const w = f.env.weather;
  const k = f.env.blend;
  const lp = f.lowPower ? 0.45 : 1;
  const t = f.reducedMotion ? 0 : f.time;
  const wind = f.env.wind;
  if (w === 'light-rain' || w === 'heavy-rain') {
    const n = Math.round((w === 'heavy-rain' ? 160 : 70) * k * lp);
    ctx.strokeStyle = w === 'heavy-rain' ? 'rgba(200, 220, 255, 0.55)' : 'rgba(200, 220, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const speed = 260 + h1(i) * 120;
      const x = (h1(i * 7) * (f.viewW + 40) + wind * t * 60) % (f.viewW + 40) - 20;
      const y = (h1(i * 13) * f.viewH + t * speed) % (f.viewH + 20) - 10;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2 - wind * 4, y + 7);
    }
    ctx.stroke();
  }
  if (w === 'snow') {
    const n = Math.round(90 * k * lp);
    for (let i = 0; i < n; i++) {
      const x = (h1(i * 5) * (f.viewW + 20) + Math.sin(t * 0.8 + i) * 6 + wind * t * 12) % (f.viewW + 20) - 10;
      const y = (h1(i * 11) * f.viewH + t * (18 + h1(i) * 18)) % (f.viewH + 10) - 5;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(Math.round(x), Math.round(y), h1(i * 2) > 0.7 ? 2 : 1, h1(i * 2) > 0.7 ? 2 : 1);
    }
  }
  if (w === 'windy') {
    const n = Math.round(24 * k * lp);
    const leaf = ['#d9631a', '#ffc94a', '#7edb8c', '#c2531a'];
    for (let i = 0; i < n; i++) {
      const x = (h1(i * 9) * f.viewW + t * (60 + h1(i) * 50)) % (f.viewW + 20) - 10;
      const y = (h1(i * 4) * f.viewH + Math.sin(t * 2 + i) * 12) % f.viewH;
      ctx.fillStyle = leaf[i % leaf.length];
      ctx.fillRect(Math.round(x), Math.round(y), 2, 1);
    }
  }
  if (w === 'fog' || w === 'cloudy') {
    const alpha = (w === 'fog' ? 0.32 : 0.1) * k;
    for (let i = 0; i < 5; i++) {
      const y = f.viewH * (0.15 + i * 0.18);
      const x = ((t * 6 + i * 90) % (f.viewW + 200)) - 100;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 120);
      g.addColorStop(0, `rgba(220, 214, 235, ${alpha.toFixed(3)})`);
      g.addColorStop(1, 'rgba(220, 214, 235, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 120, y - 120, 240, 240);
    }
  }
}

export function drawGrade(ctx: CanvasRenderingContext2D, f: FrameState) {
  const g = gradeFor(f.env);
  if (g.tintAlpha > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = nightGradeAlpha(g.tintAlpha);
    ctx.fillStyle = g.tint;
    ctx.fillRect(0, 0, f.viewW, f.viewH);
    ctx.restore();
  }
  if (g.glowAlpha > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = g.glowAlpha;
    const gr = ctx.createLinearGradient(0, 0, 0, f.viewH);
    gr.addColorStop(0, g.glow);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, f.viewW, f.viewH);
    ctx.restore();
  }
}

export function drawTargetMarker(ctx: CanvasRenderingContext2D, target: string | null, f: FrameState) {
  if (!target) return;
  const item = INTERACTABLES.find((i) => i.id === target) ?? f.adv?.spots.find((s) => s.id === target);
  if (!item) return;
  const building = item.kind === 'destination' ? BUILDINGS.find((b) => b.id === (item as { action?: string }).action) : undefined;
  const x = item.point.x;
  const baseY = building ? building.rect.y + building.rect.h - building.door.h - 8 : MARKER_Y[target] ?? item.point.y - 34;
  const y = baseY + (f.reducedMotion ? 0 : Math.round(Math.sin(f.time * 6) * 2));
  rect(ctx, x - 4, y - 6, 9, 3, '#2a1d2f');
  rect(ctx, x - 3, y - 3, 7, 2, '#2a1d2f');
  rect(ctx, x - 1, y - 1, 3, 2, '#2a1d2f');
  rect(ctx, x - 3, y - 5, 7, 1, '#ffc94a');
  rect(ctx, x - 2, y - 4, 5, 1, '#ffc94a');
  rect(ctx, x - 1, y - 3, 3, 1, '#ffc94a');
  rect(ctx, x, y - 2, 1, 1, '#ffc94a');
}

function drawBobber(ctx: CanvasRenderingContext2D, b: NonNullable<WorldDynamics['bobber']>, t: number, anglerX: number, anglerY: number) {
  const dip = b.bite ? Math.round(Math.sin(t * 30) * 2) + 2 : Math.round(Math.sin(t * 2) * 1);
  ctx.strokeStyle = 'rgba(255,243,230,0.7)';
  ctx.beginPath();
  ctx.moveTo(anglerX + 6, anglerY - 16);
  ctx.quadraticCurveTo((anglerX + b.x) / 2 + 8, anglerY - 30, b.x, b.y + dip);
  ctx.stroke();
  rect(ctx, b.x - 1, b.y - 2 + dip, 3, 2, '#e0475c');
  rect(ctx, b.x - 1, b.y + dip, 3, 1, '#fff3e6');
  if (b.bite) pixelEllipse(ctx, b.x, b.y + 2, 6, 2, 'rgba(216,236,255,0.6)');
}

export function drawVignette(ctx: CanvasRenderingContext2D, f: FrameState) {
  const g = ctx.createRadialGradient(f.viewW / 2, f.viewH / 2, Math.min(f.viewW, f.viewH) * 0.35, f.viewW / 2, f.viewH / 2, Math.max(f.viewW, f.viewH) * 0.75);
  g.addColorStop(0, 'rgba(13, 11, 18, 0)');
  g.addColorStop(1, `rgba(13, 11, 18, ${vignetteAlpha(f.env.darkness).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, f.viewW, f.viewH);
}

interface Drawable {
  y: number;
  draw: () => void;
}

export function drawTownFrame(ctx: CanvasRenderingContext2D, art: TownArt, f: FrameState): void {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#31609a';
  ctx.fillRect(0, 0, f.viewW, f.viewH);
  ctx.save();
  ctx.translate(-f.camX, -f.camY);
  ctx.drawImage(art.staticLayer as unknown as CanvasImageSource, 0, 0);
  drawWaterShimmer(ctx, f);
  drawWaterLife(ctx, f);
  drawPond(ctx, f);
  drawPuddles(ctx, f);
  drawSnowGround(ctx, f);
  // hill highlight under starlight
  if (f.env.darkness > 0.5) pixelEllipse(ctx, HILL.center.x, HILL.center.y, 30, 10, 'rgba(201, 191, 232, 0.08)');
  if (f.dyn.picnic) drawPicnic(ctx, f.dyn.picnic);
  drawCollectibles(ctx, f.dyn.collected, f.time);
  if (f.adv) drawTownAdventureGround(ctx, f);
  drawTargetRing(ctx, f.target, f);

  const left = f.camX - 64;
  const right = f.camX + f.viewW + 64;
  const top = f.camY - 16;
  const bottom = f.camY + f.viewH + 64;
  const visible = (x: number, y: number) => x >= left && x <= right && y >= top && y <= bottom;
  const list: Drawable[] = [];
  art.layout.props.forEach((p, i) => {
    const wide = p.kind === 'lot' || p.kind === 'ring' || p.kind === 'fence' || p.kind === 'swing';
    if (wide ? visible(p.x, p.y - 40) || visible(p.x - 56, p.y) || visible(p.x + 56, p.y) : visible(p.x, p.y)) {
      // seats are drawn just behind seated cats
      const yAdj = p.kind === 'napcat' ? 8 : p.kind === 'swing' ? -1 : p.kind === 'seesaw' ? -20 : 0;
      list.push({ y: p.y + yAdj, draw: () => drawProp(ctx, p, art.props[i], f) });
    }
  });
  const fx: FxItem[] = [];
  for (const c of f.cats) if (visible(c.x, c.y)) list.push({ y: c.y + (c.isSelf ? 0.01 : 0), draw: () => drawCat(ctx, art, c, f.time, f.reducedMotion, fx) });
  if (f.adv) {
    const v = f.adv.view;
    if (visible(TOWN_FOREST_GATE.x, TOWN_FOREST_GATE.y)) list.push({ y: TOWN_FOREST_GATE.y + 4, draw: () => drawTownGate(ctx, TOWN_FOREST_GATE.x, TOWN_FOREST_GATE.y + 4, v.has('region:forest')) });
    if (v.has('pier-repaired') && visible(TOWN_PIER_END.x, TOWN_PIER_END.y)) {
      const sp = art.props[art.layout.props.findIndex((p) => p.kind === 'boat')];
      if (sp) list.push({ y: TOWN_PIER_END.y + 30, draw: () => ctx.drawImage(sp.canvas as unknown as CanvasImageSource, Math.round(TOWN_PIER_END.x + 6 + sp.ox), Math.round(TOWN_PIER_END.y + 34 + sp.oy + (f.reducedMotion ? 0 : Math.round(Math.sin(f.time * 1.4) * 1.5)))) });
    }
  }
  list.sort((a, b) => a.y - b.y);
  for (const d of list) d.draw();
  if (f.dyn.bobber) {
    const angler = f.cats.find((c) => c.isSelf) ?? { x: SEATS.fishing[0].x, y: SEATS.fishing[0].y };
    drawBobber(ctx, f.dyn.bobber, f.time, angler.x, angler.y);
  }
  drawFoliage(ctx, art, f);
  drawButterflies(ctx, f);
  ctx.restore();
  // Grade first, then light sources on top so lamps, windows and fireflies glow at night.
  drawGrade(ctx, f);
  ctx.save();
  ctx.translate(-f.camX, -f.camY);
  drawGlows(ctx, art.layout.props, f);
  drawFireflies(ctx, f);
  drawFx(ctx, fx, f);
  if (f.adv) for (const s of f.adv.spots) if (s.role === 'npc' && f.adv.highlight.has(s.id)) questBang(ctx, s.point.x, s.point.y - 38 + (f.reducedMotion ? 0 : Math.round(Math.sin(f.time * 5) * 1.5)));
  drawTargetMarker(ctx, f.target, f);
  ctx.restore();
  drawSky(ctx, f);
  if (f.adv) drawTownAdventureSky(ctx, f);
  drawWeather(ctx, f);
  drawVignette(ctx, f);
}

/** Milestone 6: the pier repair, the glowing prints, quest markers and the cable-car platform. */
function drawTownAdventureGround(ctx: CanvasRenderingContext2D, f: FrameState) {
  const a = f.adv!;
  const v = a.view;
  if (v.has('pier-repaired')) {
    // new planks across the old gap at the end of the pier (lighter wood = obviously new)
    for (let x = 736; x < 768; x += 4) { rect(ctx, x, 352, 3, 32, '#c99a6a'); rect(ctx, x, 352, 3, 1, '#e0b88a'); }
    rect(ctx, 736, 366, 32, 1, '#8a5a3b');
  } else {
    for (let i = 0; i < 4; i++) rect(ctx, 738 + i * 7 + (f.reducedMotion ? 0 : Math.round(Math.sin(f.time + i) * 1)), 360 + i * 5, 5, 2, '#80553a');
  }
  if (v.onStep('lost-star', 0)) drawTrail(ctx, [{ x: 404, y: 760 }, { x: 398, y: 812 }, { x: 386, y: 846 }], '#bfe4ff', f.time, f.reducedMotion);
  if (v.has('cable-car-fixed')) {
    rect(ctx, TOWN_CABLECAR.x - 14, TOWN_CABLECAR.y - 6, 28, 8, '#8a5a3b'); rect(ctx, TOWN_CABLECAR.x - 14, TOWN_CABLECAR.y - 6, 28, 2, '#b5835a');
    rect(ctx, TOWN_CABLECAR.x - 1, TOWN_CABLECAR.y - 40, 2, 34, '#5a3a22');
    rect(ctx, TOWN_CABLECAR.x - 6, TOWN_CABLECAR.y - 22, 12, 8, '#e0475c'); rect(ctx, TOWN_CABLECAR.x - 4, TOWN_CABLECAR.y - 20, 8, 3, '#bfe4ff');
  }
  drawSpotMarkers(ctx, a, f.time, f.reducedMotion, { x: f.camX, y: f.camY, w: f.viewW, h: f.viewH });
}

/** Milestone 6: the falling light over the south woods, and Lumi's constellation once she's home. */
function drawTownAdventureSky(ctx: CanvasRenderingContext2D, f: FrameState) {
  const v = f.adv!.view;
  const clear = f.env.weather === 'sunny' || f.env.weather === 'windy';
  if (v.has('constellation-lumi')) drawConstellation(ctx, f.viewW, f.viewH, clear ? f.env.darkness : 0, f.time, LUMI_STARS, { x: 0.7, y: 0.06, s: 46 });
  const lostStarHint = (v.done('lighthouse-mystery') && !v.quest('lost-star')) || v.onStep('lost-star', 0);
  if (lostStarHint) {
    // a slow, pulsing light that hangs low over the south: visible day or night (no waiting)
    const k = f.reducedMotion ? 0.7 : 0.55 + 0.35 * Math.sin(f.time * 2.2);
    const x = Math.round(f.viewW * 0.5 + (384 - (f.camX + f.viewW / 2)) * 0.15);
    const y = Math.round(f.viewH * 0.12);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    pixelEllipse(ctx, x, y, 7, 7, `rgba(191, 228, 255, ${(0.25 * k).toFixed(3)})`);
    ctx.restore();
    rect(ctx, x - 1, y - 3, 2, 7, `rgba(255, 243, 196, ${k.toFixed(3)})`);
    rect(ctx, x - 3, y, 7, 1, `rgba(255, 243, 196, ${k.toFixed(3)})`);
  }
}

export const WORLD_SIZE = { w: WORLD_W, h: WORLD_H };
