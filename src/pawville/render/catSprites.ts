/**
 * Pixel-art sprites for every Pawville cat. The pixel maps are the Milestone 1 Tangerine/Midnight
 * sprites; colours come from appearance.ts (the same values as the Paw vs Paw vector cats), so
 * all coats share one renderer. Poses: stand/walk/run, sit, and loaf (lying down / sleepy).
 *
 * Milestone 4: one sprite system for every cat, extended with
 *   - character markings (Puchu/Chutki orange dots + Chutki's forehead heart, Magic's white tummy)
 *     read from appearance.ts — the same definition the wardrobe, home, photos and multiplayer use;
 *   - expressions for emotes and idle life: eyes (open/happy/closed/wide/sad/glow), ears
 *     (up/down/perk), puffed cheeks, raised / waving / forward paws, tail-sway override;
 *   - whiskers and a two-tone contact shadow (drawn by the renderer).
 * Every variant is cached; the cache is bounded.
 */
import type { Accessory } from '../../game/types';
import { COAT_INFO, type CoatId, type ExtraId, type Markings } from '../appearance.ts';
import type { BodyMode, EarState, EyeState, PawState } from './emoteAnim.ts';
import type { Facing } from '../world/movement.ts';
import { context2d, pixelEllipse, type CanvasFactory, type CanvasLike } from './canvasTypes.ts';

type PixelPalette = (typeof COAT_INFO)['tangerine']['pixel'];
export type CatPose = 'stand' | 'sit' | 'loaf';

const FRONT_HALF = [
  '..o.....', '..oo....', '..oioooo', '.ofifsfs', '.offlfff', 'offfewff', 'offfekff',
  'offffmmn', '.offfmmm', '..offfff', '..odffbb', '..odfbbb', '..odfbbb',
];
// Milestone 10: the back view has a real head (rounded, ears apart), a narrower neck and wider
// hips — so a cat walking away reads as a cat, not a block. Drawn whole (16 wide), not mirrored.
const BACK_FULL = [
  '..o..........o..', '..oo........oo..', '..odoooooooodo..', '.offffffffffffo.', '.offffsffsffffo.', 'offfffsffsfffffo',
  'offffffffffffffo', '.offffffffffffo.', '..offffffffffo..', '..offffssffffo..', '.offffffffffffo.', '.offfffsffffffo.', '.oddffffffffddo.',
];
const SIDE = [
  '...o...o........', '..oio.oio.......', '..oifffifo......', '.offsfsffo......', '.offlfffffo.....',
  'ofweffffffo.....', 'ofkeffffffo.....', 'nmmmffffffo.....', '.ommfffffo......', '..obffffffffo...',
  '..obbfffffffdo..', '..obbfffffffdo..', '..oddffffffddo..',
];
const mirror = (half: readonly string[]) => half.map((row) => row + [...row].reverse().join(''));
const FRONT = mirror(FRONT_HALF);
const BACK = BACK_FULL;

export const SPRITE_W = 18;
export const SPRITE_H = 24;
export const SPRITE_ANCHOR = { x: 9, y: 22 };
const OX = 1;
const OY = 6;
export const WALK_FRAMES = 4;

function paintMap(ctx: CanvasRenderingContext2D, map: readonly string[], pal: PixelPalette, flip: boolean, dy: number, rows = map.length, opts: { dx?: number; headRows?: number; headDx?: number; c0?: number; c1?: number; r0?: number } = {}) {
  const { dx = 0, headRows = 0, headDx = 0, c0 = 0, c1 = 15, r0 = 0 } = opts;
  for (let r = r0; r < rows; r++) {
    const row = map[r];
    const rdx = dx + (r < headRows ? headDx : 0);
    for (let c = c0; c <= Math.min(c1, row.length - 1); c++) {
      let key = row[c] as keyof PixelPalette | '.';
      if (key === '.') continue;
      // Milestone 10 shading: fur touching the outline above catches the light; fur resting on the
      // outline below falls into shadow. Gives every coat volume without per-coat art.
      if (key === 'f') {
        const up = r > 0 ? map[r - 1][c] : '.';
        const down = r + 1 < rows ? map[r + 1][c] : 'o';
        if (up === '.' || up === 'o') key = 'l';
        else if (down === '.' || down === 'o') key = 'd';
      }
      ctx.fillStyle = pal[key];
      ctx.fillRect(OX + (flip ? 15 - c : c) + rdx, OY + r + dy, 1, 1);
    }
  }
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(OX + x, OY + y, w, h);
}

/**
 * Milestone 8.1 gait. The old cycle was [0, 1, 0, -1]: frames 0 and 2 were pixel-identical and each leg
 * only moved 1px, so walking read as sliding. Now every frame of the 4-frame cycle is a distinct pose:
 * stride → passing (near legs lifted) → opposite stride → passing (far legs lifted), with the far-side
 * legs drawn one shade darker so the diagonal pairs read clearly in side view.
 */
export const GAIT = [
  // side view: [nearBack col, nearFront col, farBack col, farFront col, lift near, lift far]
  { nb: 2, nf: 11, fb: 5, ff: 8, ln: 0, lf: 0 },
  { nb: 4, nf: 10, fb: 3, ff: 9, ln: 1, lf: 0 },
  { nb: 5, nf: 8, fb: 2, ff: 11, ln: 0, lf: 0 },
  { nb: 3, nf: 9, fb: 4, ff: 10, ln: 0, lf: 1 },
] as const;
/** Front/back view: which leg is lifted on each frame (L, R). */
export const GAIT_FRONT = [[1, 0], [0, 0], [0, 1], [0, 0]] as const;

function drawLegs(ctx: CanvasRenderingContext2D, facing: Facing, frame: number, pal: PixelPalette, moving: boolean) {
  const f = frame % 4;
  if (facing === 'left' || facing === 'right') {
    const flip = facing === 'right';
    const leg = (col: number, lift: number, fur: string, w = 2) => {
      const c = flip ? 15 - col - w + 1 : col;
      px(ctx, c, 13 - lift, fur, w, 2);
      px(ctx, c, 15 - lift, pal.o, w, 1);
    };
    if (!moving) { leg(4, 0, pal.d); leg(9, 0, pal.d); leg(3, 0, pal.f); leg(10, 0, pal.f); return; }
    const g = GAIT[f];
    leg(g.fb, g.lf, pal.d); leg(g.ff, g.lf, pal.d); // far side, shaded
    leg(g.nb, g.ln, pal.f); leg(g.nf, g.ln, pal.f); // near side
    return;
  }
  const leg = (col: number, lift: number) => {
    px(ctx, col, 13, pal.o, 1, 2 - lift);
    px(ctx, col + 1, 13, pal.f, 2, 2 - lift);
    px(ctx, col + 3, 13, pal.o, 1, 2 - lift);
    px(ctx, col, 15 - lift, pal.o, 4, 1);
  };
  const [l, r] = moving ? GAIT_FRONT[f] : [0, 0];
  leg(3, l);
  leg(9, r);
}

function drawTail(ctx: CanvasRenderingContext2D, facing: Facing, sway: number, pal: PixelPalette, dy: number, marks?: Markings) {
  const tip = marks?.tail === 'tip' ? marks.color : pal.s;
  if (facing === 'down') {
    px(ctx, 13, 11 + dy, pal.o, 1, 2);
    px(ctx, 14, 9 + dy + sway, pal.f, 1, 3);
    px(ctx, 15, 8 + dy + sway, tip, 1, 2);
    if (marks?.tail === 'dot') px(ctx, 14, 10 + dy + sway, marks.color, 1, 1);
    return;
  }
  if (facing === 'up') {
    // Milestone 10: from behind, the tail rises beside the body (drawn before it) and its tip curls in.
    const seg: [number, number][] = [[12, 13], [13, 12], [14, 11], [15, 10], [15, 9], [15, 8], [14, 7]];
    seg.forEach(([c, r], i) => {
      const sx = i >= 3 ? sway : 0;
      px(ctx, c - 1 + sx, r + dy, pal.o, 3, 1);
      px(ctx, c + sx, r + dy, i === seg.length - 1 ? tip : i === 3 ? pal.l : pal.f, 1, 1);
    });
    px(ctx, 13 + sway, 6 + dy, pal.o, 2, 1);
    if (marks?.tail === 'dot') px(ctx, 15 + sway, 9 + dy, marks.color, 1, 1);
    return;
  }
  const flip = facing === 'right';
  const at = (c: number, r: number, color: string, w = 1, h = 1) => px(ctx, flip ? 15 - c - (w - 1) : c, r + dy, color, w, h);
  at(14, 6 + sway, pal.f, 1, 6);
  at(15, 6 + sway, pal.o, 1, 5);
  at(13, 6 + sway, pal.o, 1, 4);
  at(14, 5 + sway, tip, 1, 2);
  if (marks?.tail === 'dot') at(14, 8 + sway, marks.color, 1, 1);
}

function drawAccessory(ctx: CanvasRenderingContext2D, accessory: Accessory, facing: Facing, dy: number) {
  const side = facing === 'left' || facing === 'right';
  const flip = facing === 'right';
  const cx = side ? (flip ? 10 : 5) : 7;
  const at = (c: number, r: number, color: string, w = 1, h = 1) => px(ctx, flip && side ? 15 - c - (w - 1) : c, r + dy, color, w, h);
  switch (accessory) {
    case 'crown':
      px(ctx, cx - 2, 0 + dy, '#FFCB4A', 6, 2);
      px(ctx, cx - 2, -1 + dy, '#FFCB4A', 1, 1);
      px(ctx, cx, -2 + dy, '#FFCB4A', 2, 2);
      px(ctx, cx + 3, -1 + dy, '#FFCB4A', 1, 1);
      px(ctx, cx, 0 + dy, '#FF6FA1', 2, 1);
      return;
    case 'wizard':
      px(ctx, cx - 3, 1 + dy, '#3E2B7A', 8, 1);
      px(ctx, cx - 2, 0 + dy, '#6B4FBF', 6, 1);
      px(ctx, cx - 1, -2 + dy, '#6B4FBF', 4, 2);
      px(ctx, cx, -4 + dy, '#6B4FBF', 2, 2);
      px(ctx, cx + 1, -5 + dy, '#6B4FBF', 1, 1);
      px(ctx, cx - 1, -1 + dy, '#FFCB4A', 1, 1);
      return;
    case 'bow':
      if (facing === 'up') { px(ctx, 11, 1 + dy, '#FF6FA1', 3, 2); px(ctx, 12, 1 + dy, '#C93D74', 1, 2); return; }
      at(side ? 7 : 11, 1, '#FF6FA1', 3, 2);
      at(side ? 8 : 12, 1, '#C93D74', 1, 2);
      return;
    case 'bell':
      if (facing === 'up') return;
      px(ctx, side ? (flip ? 11 : 3) : 5, 9 + dy, '#E0475C', side ? 2 : 6, 1);
      px(ctx, side ? (flip ? 11 : 3) : 7, 10 + dy, '#FFCB4A', 2, 1);
      return;
    default:
      return;
  }
}

function drawExtra(ctx: CanvasRenderingContext2D, extra: ExtraId, facing: Facing, dy: number) {
  const side = facing === 'left' || facing === 'right';
  const flip = facing === 'right';
  switch (extra) {
    case 'glasses':
      if (facing === 'up') return;
      if (side) { px(ctx, flip ? 12 : 1, 5 + dy, '#2a1d2f', 3, 1); px(ctx, flip ? 12 : 1, 7 + dy, '#2a1d2f', 3, 1); return; }
      px(ctx, 3, 5 + dy, '#2a1d2f', 4, 1); px(ctx, 9, 5 + dy, '#2a1d2f', 4, 1);
      px(ctx, 3, 7 + dy, '#2a1d2f', 4, 1); px(ctx, 9, 7 + dy, '#2a1d2f', 4, 1);
      px(ctx, 7, 6 + dy, '#2a1d2f', 2, 1);
      return;
    case 'scarf':
      px(ctx, side ? 2 : 3, 9 + dy, '#E0475C', side ? 9 : 10, 2);
      px(ctx, side ? 2 : 3, 9 + dy, '#FF8FA3', side ? 9 : 10, 1);
      if (!side && facing === 'down') px(ctx, 10, 11 + dy, '#E0475C', 2, 3);
      return;
    case 'flower':
      if (facing === 'up') { px(ctx, 3, 1 + dy, '#FFF3E6', 3, 3); px(ctx, 4, 2 + dy, '#FFC94A', 1, 1); return; }
      px(ctx, side ? (flip ? 5 : 8) : 3, 1 + dy, '#FFF3E6', 3, 3);
      px(ctx, side ? (flip ? 6 : 9) : 4, 2 + dy, '#FFC94A', 1, 1);
      return;
    case 'leafcrown':
      for (let i = 0; i < 4; i++) px(ctx, (side ? 3 : 4) + i * 2, 1 + dy - (i % 2), i % 2 ? '#7EDB8C' : '#4F9A67', 2, 2);
      return;
    case 'starclip':
      px(ctx, side ? (flip ? 5 : 8) : 11, 0 + dy, '#FFC94A', 1, 3);
      px(ctx, side ? (flip ? 4 : 7) : 10, 1 + dy, '#FFC94A', 3, 1);
      return;
    case 'captainhat': {
      // navy captain's cap with a white band and a gold anchor badge
      const cx = side ? (flip ? 7 : 2) : 3;
      px(ctx, cx, 0 + dy, '#1F2A4D', 10, 2);
      px(ctx, cx + 1, -1 + dy, '#2B3A66', 8, 1);
      px(ctx, cx, 2 + dy, '#FFF3E6', 10, 1);
      if (facing !== 'up') px(ctx, cx + 4, 0 + dy, '#FFC94A', 2, 1);
      if (side) px(ctx, flip ? cx + 9 : cx - 2, 2 + dy, '#1F2A4D', 3, 1); // the peak
      else if (facing === 'down') px(ctx, cx + 1, 3 + dy, '#1F2A4D', 8, 1);
      return;
    }
    case 'starcharm':
      // Lumi's little star on a ribbon collar
      if (facing === 'up') return;
      px(ctx, side ? 3 : 4, 9 + dy, '#7FC8FF', side ? 9 : 8, 1);
      px(ctx, side ? (flip ? 10 : 5) : 7, 10 + dy, '#FFE27A', 2, 2);
      px(ctx, side ? (flip ? 10 : 5) : 7, 10 + dy, '#FFFFFF', 1, 1);
      return;
    default:
      return;
  }
}

export interface SpriteKey {
  coat: CoatId;
  accessory: Accessory;
  extra: ExtraId;
  facing: Facing;
  frame: number;
  moving: boolean;
  pose: CatPose;
  /** Milestone 4 expression/emote fields (all optional; defaults = the Milestone 3 look). */
  eyes?: EyeState;
  ears?: EarState;
  paw?: PawState;
  pawLift?: number;
  pawDx?: number;
  cheeks?: boolean;
  /** Tail sway override: -1, 0 (idle default) or 1. */
  tail?: -1 | 0 | 1;
  run?: boolean;
  /**
   * Milestone 6 signature-animation body modes (quantised so the sprite cache stays bounded):
   *   'stretch' (Magic's long stretch: bodyK 0..3 = how deep), 'belly' (Chutki's upside-down nap:
   *   bodyK 0..1 = breath), 'upright' (Racon's fence dance: arms 0..4 = crossing phase, bodyK
   *   -1..1 = lean). 'none'/undefined = the normal cat.
   */
  body?: BodyMode;
  bodyK?: number;
  arms?: number;
  /** Head tilt in pixels (-1, 0, 1) — Tangerine's curious tilt. */
  tilt?: number;
}

/**
 * Vertical body offset of a frame (pixels, relative to the standing pose): the walk bounce, the run bounce and the lowered
 * sitting pose. The ONE definition: both sprite renderers (cat and raccoon) and every overlay that has to stay on the face
 * (the night-time eye glint, glowing eyes) use it, so the face and its light can never drift apart.
 */
export function catBob(k: Pick<SpriteKey, 'frame' | 'moving' | 'run' | 'pose'>): number {
  const sitting = k.pose === 'sit';
  const moving = !!k.moving && !sitting;
  const f = ((k.frame % 4) + 4) % 4;
  return (moving ? [0, -1, 0, -1][f] : sitting ? 2 : 0) + (moving && k.run ? [0, -1, -1, -1][f] : 0);
}

/**
 * Where the eyes really are in a rendered sprite, in SPRITE-CANVAS pixels (add to the sprite's draw origin
 * `feet − SPRITE_ANCHOR`). Read from the same maps the sprite is painted from, so it is exact for every coat, species,
 * facing, walk/run frame, sitting pose, mirrored (right-facing) sprite and head tilt. Empty when the eyes are not visible
 * (facing away, curled up, or a whole-body signature pose that has its own face).
 */
export function eyeSpritePixels(k: SpriteKey): readonly (readonly [number, number])[] {
  if (k.facing === 'up' || k.pose === 'loaf') return [];
  if (k.body && k.body !== 'none') return [];
  const raccoon = COAT_INFO[k.coat]?.species === 'raccoon';
  const map = k.facing === 'down' ? (raccoon ? R_FRONT : FRONT) : raccoon ? R_SIDE : SIDE;
  const flip = k.facing === 'right';
  const bob = catBob(k);
  const tilt = k.tilt ? Math.max(-1, Math.min(1, Math.round(k.tilt))) : 0;
  const out: [number, number][] = [];
  for (let r = 0; r < map.length; r++) {
    const row = map[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch !== 'e' && ch !== 'w') continue; // iris and glint (the mask 'k' around a raccoon's eye is not part of the eye)
      out.push([OX + (flip ? 15 - c : c) + (tilt && r < 9 ? tilt : 0), OY + r + bob]);
    }
  }
  return out;
}

/** Eye pixels in sprite-map coordinates for a facing (kept for older callers; prefer eyeSpritePixels). */
export function eyePixels(facing: Facing): readonly (readonly [number, number])[] {
  if (facing === 'up') return [];
  if (facing === 'down') return [[4, 5], [5, 5], [4, 6], [10, 5], [11, 5], [11, 6]];
  const cols = facing === 'right' ? [15 - 3, 15 - 2] : [3, 2];
  return [[cols[0], 5], [cols[0], 6], [cols[1], 5]];
}
/** Convert a sprite-map pixel to an offset from the cat's feet anchor. */
export function mapToAnchor(c: number, r: number, dy = 0): { x: number; y: number } {
  return { x: OX + c - SPRITE_ANCHOR.x, y: OY + r + dy - SPRITE_ANCHOR.y };
}

function markPixels(ctx: CanvasRenderingContext2D, marks: Markings | undefined, facing: Facing, dy: number, rows: number) {
  if (!marks) return;
  const list = facing === 'down' ? marks.front : facing === 'up' ? marks.back : marks.side;
  const flip = facing === 'right';
  for (const [c, r] of list) {
    if (r >= rows) continue;
    px(ctx, flip ? 15 - c : c, r + dy, marks.color);
  }
}

function bellyPixels(ctx: CanvasRenderingContext2D, marks: Markings | undefined, facing: Facing, pal: PixelPalette, dy: number, rows: number) {
  if (!marks?.bellyFront || facing !== 'down') return;
  for (const [c, r] of marks.bellyFront) if (r < rows) px(ctx, c, r + dy, pal.b);
}

function drawEyes(ctx: CanvasRenderingContext2D, eyes: EyeState, facing: Facing, pal: PixelPalette, dy: number) {
  if (facing === 'up' || eyes === 'open') return;
  const blocks: [number, number][] = facing === 'down' ? [[4, 5], [10, 5]] : [[facing === 'right' ? 12 : 2, 5]];
  for (const [c, r] of blocks) {
    const y = r + dy;
    switch (eyes) {
      case 'closed': // sleepy / blink: a soft line
        px(ctx, c, y, pal.f, 2, 2);
        px(ctx, c, y + 1, pal.o, 2, 1);
        break;
      case 'happy': // ^ ^
        px(ctx, c, y, pal.f, 2, 2);
        px(ctx, c, y, pal.o, 2, 1);
        px(ctx, facing === 'right' ? c + 1 : c, y + 1, pal.o, 1, 1);
        break;
      case 'wide':
        px(ctx, c, y - 1, pal.e, 2, 1);
        px(ctx, c, y, pal.e, 2, 2);
        px(ctx, c + (c < 8 ? 1 : 0), y + 1, pal.k, 1, 1);
        px(ctx, c + (c < 8 ? 0 : 1), y - 1, pal.w, 1, 1);
        break;
      case 'sad': // droopy brow over the eye
        px(ctx, c < 8 ? c : c + 1, y - 1, pal.o, 1, 1);
        px(ctx, c < 8 ? c + 1 : c, y - 1, pal.d, 1, 1);
        break;
      case 'glow': // bright emerald with a star glint
        px(ctx, c, y, pal.e, 2, 2);
        px(ctx, c + (c < 8 ? 1 : 0), y + 1, pal.k, 1, 1);
        px(ctx, c + (c < 8 ? 0 : 1), y, '#FFFFFF', 1, 1);
        break;
    }
  }
}

function drawEars(ctx: CanvasRenderingContext2D, ears: EarState, facing: Facing, pal: PixelPalette, dy: number) {
  if (ears === 'up') return;
  const side = facing === 'left' || facing === 'right';
  if (ears === 'perk') {
    if (side) { px(ctx, facing === 'right' ? 12 : 3, -1 + dy, pal.o); px(ctx, facing === 'right' ? 8 : 7, -1 + dy, pal.o); }
    else { px(ctx, 2, -1 + dy, pal.o); px(ctx, 13, -1 + dy, pal.o); }
    return;
  }
  // ears down: fold the tips flat against the head
  ctx.clearRect(OX, OY + dy, 16, 2);
  if (side) {
    px(ctx, facing === 'right' ? 9 : 2, 1 + dy, pal.o, 5, 1);
    px(ctx, facing === 'right' ? 10 : 3, 2 + dy, pal.i, 3, 1);
  } else {
    px(ctx, 1, 2 + dy, pal.o, 3, 1); px(ctx, 12, 2 + dy, pal.o, 3, 1);
    px(ctx, 2, 3 + dy, pal.i, 1, 1); px(ctx, 13, 3 + dy, pal.i, 1, 1);
  }
}

function drawCheeks(ctx: CanvasRenderingContext2D, facing: Facing, pal: PixelPalette, dy: number) {
  if (facing === 'up') return;
  if (facing === 'down') {
    px(ctx, 0, 6 + dy, pal.f, 1, 3); px(ctx, -1, 6 + dy, pal.o, 1, 3);
    px(ctx, 15, 6 + dy, pal.f, 1, 3); px(ctx, 16, 6 + dy, pal.o, 1, 3);
    px(ctx, 1, 7 + dy, '#FF9DB0', 1, 1); px(ctx, 14, 7 + dy, '#FF9DB0', 1, 1);
    return;
  }
  const c = facing === 'right' ? 15 : 0;
  px(ctx, c, 7 + dy, pal.f, 1, 2);
  px(ctx, facing === 'right' ? 16 : -1, 7 + dy, pal.o, 1, 2);
}

function drawWhiskers(ctx: CanvasRenderingContext2D, facing: Facing, pal: PixelPalette, dy: number) {
  if (facing === 'up') return;
  const c = pal.w;
  if (facing === 'down') {
    px(ctx, -1, 7 + dy, c); px(ctx, 16, 7 + dy, c);
    return;
  }
  px(ctx, facing === 'right' ? 16 : -1, 7 + dy, c);
}

function paw(ctx: CanvasRenderingContext2D, col: number, top: number, pal: PixelPalette) {
  px(ctx, col - 1, top - 1, pal.o, 4, 5);
  px(ctx, col, top, pal.f, 2, 3);
  px(ctx, col, top, pal.i, 2, 1);
}

function drawPaw(ctx: CanvasRenderingContext2D, which: PawState, lift: number, pdx: number, facing: Facing, pal: PixelPalette, dy: number) {
  if (which === 'none') return;
  const top = 8 - lift + dy;
  if (facing === 'left' || facing === 'right') {
    const c = facing === 'right' ? 13 + Math.max(-1, Math.min(1, pdx)) : 1 + Math.max(-1, Math.min(1, pdx));
    paw(ctx, c, which === 'forward' ? 9 - Math.min(lift, 1) + dy : top, pal);
    return;
  }
  // facing camera (down) or away (up): viewer's left/right
  const mirror = facing === 'up';
  const right = (col: number) => (mirror ? 15 - col - 1 : col);
  if (which === 'right' || which === 'both') paw(ctx, (mirror ? 0 : 14) + pdx, top, pal);
  if (which === 'left' || which === 'both') paw(ctx, (mirror ? 14 : 0) - pdx, top, pal);
  if (which === 'forward') paw(ctx, right(10) + pdx, 10 - Math.min(lift, 2) + dy, pal);
}

export function renderCatFrame(factory: CanvasFactory, k: SpriteKey): CanvasLike {
  const canvas = factory(SPRITE_W, SPRITE_H);
  const ctx = context2d(canvas);
  const info = COAT_INFO[k.coat] ?? COAT_INFO.tangerine; // unknown ids never produce a missing sprite
  const pal = info.pixel;
  const marks = info.marks;
  // Milestone 6: species-aware rendering. Racon is a raccoon — he has his own maps and poses.
  if (info.species === 'raccoon') {
    drawRaccoon(ctx, k, pal);
    return canvas;
  }
  if (k.body === 'stretch') {
    drawStretch(ctx, k, pal, marks);
    return canvas;
  }
  if (k.body === 'belly') {
    drawBellyUp(ctx, k, pal, marks);
    return canvas;
  }
  if (k.pose === 'loaf') {
    // Milestone 10: a proper loaf (curled up, seen from the front): round body, head resting on top
    // with ears, sleepy eyes, paws tucked under the chin and the tail curled at the side. Breathes slowly.
    const breathe = k.frame % 4 < 2 ? 0 : 1;
    pixelEllipse(ctx, 9, 22, 8, 1, 'rgba(20,12,30,0.25)');
    // tail curled round the right side (behind the body)
    px(ctx, 12, 13, pal.o, 4, 3); px(ctx, 13, 14, pal.f, 2, 1); px(ctx, 14, 14, marks?.tail === 'tip' ? marks.color : pal.s, 1, 1);
    pixelEllipse(ctx, 9, 18, 8, 4, pal.o);
    pixelEllipse(ctx, 9, 18, 7, 3 - breathe * 0, pal.f);
    pixelEllipse(ctx, 9, 16, 5, 1, pal.l);
    pixelEllipse(ctx, 9, 21, 6, 0, pal.d);
    if (marks?.bellyFront) pixelEllipse(ctx, 9, 19, 2, 1, pal.b);
    if (marks) for (const [c, r] of marks.back.slice(0, 6)) px(ctx, Math.round(1 + (c / 15) * 13), Math.round(10 + (r / 12) * 4), marks.color);
    // head resting on the body
    const hy = 2 + breathe;
    px(ctx, 4, hy + 2, pal.o, 8, 6); px(ctx, 3, hy + 3, pal.o, 10, 4);
    px(ctx, 4, hy + 3, pal.f, 8, 4); px(ctx, 5, hy + 2, pal.f, 6, 1);
    px(ctx, 5, hy + 2, pal.l, 6, 1);
    px(ctx, 3, hy, pal.o, 2, 3); px(ctx, 11, hy, pal.o, 2, 3); px(ctx, 4, hy + 1, pal.i, 1, 1); px(ctx, 11, hy + 1, pal.i, 1, 1);
    px(ctx, 5, hy + 4, pal.o, 2, 1); px(ctx, 9, hy + 4, pal.o, 2, 1); // sleepy eyes
    px(ctx, 7, hy + 5, pal.n, 2, 1);
    if (marks) for (const [c, r] of marks.front.filter(([, rr]) => rr <= 4).slice(0, 5)) px(ctx, 3 + Math.round((c / 15) * 9), hy + 1 + Math.round((r / 4) * 3), marks.color);
    // paws peeking out under the chin
    px(ctx, 5, hy + 8, pal.m, 2, 1); px(ctx, 9, hy + 8, pal.m, 2, 1);
    px(ctx, 5, hy + 9, pal.o, 2, 1); px(ctx, 9, hy + 9, pal.o, 2, 1);
    drawExtra(ctx, k.extra, 'down', hy - 1);
    return canvas;
  }
  const sitting = k.pose === 'sit';
  const moving = k.moving && !sitting;
  const bob = catBob(k);
  const sway = k.tail !== undefined && k.tail !== 0 ? k.tail : moving ? [0, 1, 0, -1][k.frame % 4] : [0, 0, 1, 1][k.frame % 4];
  const rows = sitting ? 12 : 13;
  if (!sitting) drawLegs(ctx, k.facing, k.frame, pal, moving);
  if (k.facing !== 'down') drawTail(ctx, k.facing, sway, pal, bob, marks); // side + back: behind the body
  const map = k.facing === 'down' ? FRONT : k.facing === 'up' ? BACK : SIDE;
  const tilt = k.tilt ? Math.max(-1, Math.min(1, Math.round(k.tilt))) : 0;
  paintMap(ctx, map, pal, k.facing === 'right', bob, rows, { headRows: tilt ? 9 : 0, headDx: tilt });
  bellyPixels(ctx, marks, k.facing, pal, bob, rows);
  // Idle breathing: the chest catches the light on the "in" breath (frames 2–3).
  if (!moving && k.facing === 'down' && k.frame % 4 >= 2) px(ctx, 7, 10 + bob, marks?.bellyFront ? pal.l : pal.l, 2, 1);
  markPixels(ctx, marks, k.facing, bob, rows);
  if (sitting) {
    // tucked paws (with a white chest showing for cats that have one)
    px(ctx, 3, 12 + bob, pal.o, 10, 1);
    px(ctx, 4, 11 + bob, pal.f, 3, 1);
    px(ctx, 9, 11 + bob, pal.f, 3, 1);
    if (marks?.bellyFront && k.facing === 'down') px(ctx, 7, 11 + bob, pal.b, 2, 1);
  }
  if (k.facing === 'down') drawTail(ctx, k.facing, sway, pal, bob, marks);
  drawWhiskers(ctx, k.facing, pal, bob);
  drawEyes(ctx, k.eyes ?? 'open', k.facing, pal, bob);
  drawEars(ctx, k.ears ?? 'up', k.facing, pal, bob);
  if (k.cheeks) drawCheeks(ctx, k.facing, pal, bob);
  drawPaw(ctx, k.paw ?? 'none', k.pawLift ?? 0, k.pawDx ?? 0, k.facing, pal, bob);
  drawAccessory(ctx, k.accessory, k.facing, bob);
  drawExtra(ctx, k.extra, k.facing, bob);
  return canvas;
}

export class CatSpriteCache {
  private readonly cache = new Map<string, CanvasLike>();
  private readonly factory: CanvasFactory;
  constructor(factory: CanvasFactory) {
    this.factory = factory;
  }

  get(k: SpriteKey): CanvasLike {
    const frame = k.frame % WALK_FRAMES;
    const key = `${k.coat}|${k.accessory}|${k.extra}|${k.facing}|${frame}|${k.moving ? 1 : 0}|${k.pose}|${k.eyes ?? ''}|${k.ears ?? ''}|${k.paw ?? ''}|${k.pawLift ?? 0}|${k.pawDx ?? 0}|${k.cheeks ? 1 : 0}|${k.tail ?? 0}|${k.run ? 1 : 0}|${k.body ?? ''}|${k.bodyK ?? 0}|${k.arms ?? 0}|${k.tilt ?? 0}`;
    let c = this.cache.get(key);
    if (!c) {
      c = renderCatFrame(this.factory, { ...k, frame });
      if (this.cache.size > 1500) this.cache.clear(); // bounded
      this.cache.set(key, c);
    }
    return c;
  }
}

export function spriteMapsAreValid(): boolean {
  const ok = (m: readonly string[]) => m.length === 13 && m.every((r) => r.length === 16);
  return ok(FRONT) && ok(BACK) && ok(SIDE) && ok(R_FRONT) && ok(R_BACK) && ok(R_SIDE);
}

// ============================================================================================
// Milestone 6 — signature body poses for cats, and Racon the raccoon.
// ============================================================================================

/** Magic's long stretch (a play-bow), always drawn side-on. bodyK 0..3 = depth of the stretch. */
function drawStretch(ctx: CanvasRenderingContext2D, k: SpriteKey, pal: PixelPalette, marks: Markings | undefined) {
  const facing: Facing = k.facing === 'left' ? 'left' : 'right';
  const flip = facing === 'right';
  const depth = Math.max(0, Math.min(3, Math.round(k.bodyK ?? 0)));
  const front = depth; // the chest and head go DOWN
  const rear = -Math.ceil(depth / 2); // the hips go UP
  const at = (c: number, r: number, color: string, w = 1, h = 1) => px(ctx, flip ? 15 - c - (w - 1) : c, r, color, w, h);
  // hind legs: straight, longer as the hips lift
  at(10, 12 + rear, pal.o, 4, 4 - rear);
  at(11, 12 + rear, pal.f, 2, 3 - rear);
  // tail: raised high and curled at the tip
  const tailTop = 3 + rear - (depth > 1 ? 1 : 0);
  at(14, tailTop, pal.o, 2, 7);
  at(14, tailTop + 1, pal.f, 1, 6);
  at(13, tailTop - 1, pal.o, 2, 1);
  at(12, tailTop, marks?.tail === 'tip' ? marks.color : pal.s, 2, 1);
  // body halves: the rear half lifted, the front half lowered (seam filled by drawing both)
  paintMap(ctx, SIDE, pal, flip, rear, 13, { c0: 7, c1: 15 });
  paintMap(ctx, SIDE, pal, flip, front, 13, { c0: 0, c1: 8 });
  if (marks) {
    for (const [c, r] of marks.side) px(ctx, flip ? 15 - c : c, r + (c <= 7 ? front : rear), marks.color);
    if (marks.bellyFront) at(4, 10 + front, pal.b, 4, 2); // the white tummy shows under the chest
  }
  // front legs stretched FORWARD along the ground, paws spread
  const reach = 2 + depth;
  at(-reach, 14, pal.o, reach + 5, 2);
  at(-reach + 1, 14, pal.f, reach + 3, 1);
  at(-reach, 13, pal.o, 2, 1);
  at(-reach + 1, 15, pal.i, 1, 1);
  // closed, content eyes at the deepest point; a blink on the way back up
  if ((k.eyes ?? 'open') !== 'open') drawEyes(ctx, k.eyes ?? 'closed', facing, pal, front);
  drawEars(ctx, k.ears ?? 'up', facing, pal, front);
  drawWhiskers(ctx, facing, pal, front);
  drawAccessory(ctx, k.accessory, facing, front);
  drawExtra(ctx, k.extra, facing, front);
}

/** Chutki's upside-down nap: on her back, tummy up, paws curled, ears and tail twitching. */
function drawBellyUp(ctx: CanvasRenderingContext2D, k: SpriteKey, pal: PixelPalette, marks: Markings | undefined) {
  const breath = (k.bodyK ?? 0) > 0 ? 1 : 0;
  const twitch = (k.frame % 4) === 3;
  // body lying on its back (feet anchor stays at the same ground point)
  pixelEllipse(ctx, 10, 18, 7, 3 + breath, pal.o);
  pixelEllipse(ctx, 10, 18, 6, 2 + breath, pal.f);
  pixelEllipse(ctx, 10, 17, 4, 1 + breath, pal.b); // the tummy, facing the sky
  // curled paws sticking up
  for (const [x, y] of [[6, 14], [8, 13 - breath], [12, 13 - breath], [14, 14]] as const) {
    ctx.fillStyle = pal.o; ctx.fillRect(x, y - 1, 3, 3);
    ctx.fillStyle = pal.f; ctx.fillRect(x + 1, y, 1, 1);
    ctx.fillStyle = pal.i; ctx.fillRect(x + 1, y - 1, 1, 1);
  }
  // upside-down head on the left: chin up, ears pointing DOWN to the ground
  pixelEllipse(ctx, 3, 17, 3, 3, pal.o);
  pixelEllipse(ctx, 3, 17, 2, 2, pal.f);
  ctx.fillStyle = pal.o; ctx.fillRect(0, 20, 2, 2 + (twitch ? 0 : 1)); ctx.fillRect(4, 20, 2, 2);
  ctx.fillStyle = pal.i; ctx.fillRect(1, 20, 1, 1); ctx.fillRect(4, 20, 1, 1);
  // closed eyes (a sleepy line) — the forehead (and Chutki's heart) sits below them, upside down
  const eyes = k.eyes ?? 'closed';
  ctx.fillStyle = pal.o;
  if (eyes === 'open' || eyes === 'wide') { ctx.fillStyle = pal.e; ctx.fillRect(1, 17, 1, 1); ctx.fillRect(4, 17, 1, 1); }
  else { ctx.fillRect(1, 17, 2, 1); ctx.fillRect(4, 17, 2, 1); }
  ctx.fillStyle = pal.n; ctx.fillRect(3, 16, 1, 1); // nose (chin side up)
  if (marks) {
    if (marks.svgForehead) { ctx.fillStyle = marks.color; ctx.fillRect(2, 19, 1, 1); ctx.fillRect(4, 19, 1, 1); ctx.fillRect(3, 19, 1, 2); }
    for (const [c, r] of marks.back.slice(0, 3)) { ctx.fillStyle = marks.color; ctx.fillRect(7 + Math.round((c / 15) * 8), 18 + (r % 2), 1, 1); }
  }
  // tail out to the right, tip flicking
  ctx.fillStyle = pal.o; ctx.fillRect(16, 18, 2, 2);
  ctx.fillStyle = pal.f; ctx.fillRect(16, 18, 1, 1);
  ctx.fillStyle = marks?.tail === 'tip' ? marks.color : pal.s; ctx.fillRect(17, twitch ? 16 : 17, 1, 2);
}

// ---- Racon (raccoon) -----------------------------------------------------------------------
// Palette letters re-used with raccoon meanings: k = black mask, m = white face, i = dark ear,
// s = dark rings / legs, e = shiny brown eye, w = eye glint.
const R_FRONT_HALF = [
  '.oo.....', 'oiio....', 'oioooooo', 'ofmmfffs', 'okkkkkfs', 'okkkewkf', 'okkkekkf',
  'ommmmmmn', '.ommmmmm', '..offfff', '..odffbb', '..odfbbb', '..odfbbb',
];
const R_BACK_HALF = [
  '.oo.....', 'oiio....', 'oioooooo', 'offfffss', 'offfffsf', 'offfffff', 'offfffff',
  'offfffff', '.offffff', '..offfff', '..odffff', '..odffsf', '..odffff',
];
const R_SIDE = [
  '...oo...........', '..oiio..........', '..oioooo........', '.offmmffo.......', 'okkkkkffo.......',
  'okewkkffo.......', 'nmkkkmffo.......', 'ommmmmfffo......', '.oommfffffooo...', '..obffffffffo...',
  '..obbfffffffdo..', '..obbfffffffdo..', '..oddffffffddo..',
];
const R_FRONT = mirror(R_FRONT_HALF);
const R_BACK = mirror(R_BACK_HALF);

/** A bushy ringed tail: `x0` column, `y0` top row, `len` rows, drawn as a 3-wide column. */
function ringedTail(ctx: CanvasRenderingContext2D, pal: PixelPalette, x0: number, y0: number, len: number, phase = 0) {
  px(ctx, x0 - 1, y0 - 1, pal.o, 5, len + 2);
  for (let r = 0; r < len; r++) px(ctx, x0, y0 + r, ((r + phase) >> 1) % 2 === 0 ? pal.s : pal.l, 3, 1);
  px(ctx, x0, y0, pal.s, 3, 1); // dark tip
}

/** Side view: a fat tail sweeping up and back, with vertical rings. */
function sideTail(ctx: CanvasRenderingContext2D, pal: PixelPalette, flip: boolean, top: number) {
  const at = (c: number, r: number, color: string, w = 1, h = 1) => px(ctx, flip ? 15 - c - (w - 1) : c, r, color, w, h);
  at(12, top + 1, pal.o, 5, 5);
  at(14, top - 1, pal.o, 3, 3);
  for (let i = 0; i < 4; i++) at(12 + i, top + 2 - (i > 1 ? 1 : 0), i % 2 ? pal.l : pal.s, 1, 3);
  at(15, top, pal.s, 1, 2);
}

function raccoonEyes(ctx: CanvasRenderingContext2D, eyes: EyeState, facing: Facing, pal: PixelPalette, dy: number, dx = 0) {
  if (facing === 'up' || eyes === 'open' || eyes === 'wide' || eyes === 'glow') return;
  const blocks: [number, number][] = facing === 'down' ? [[4, 5], [10, 5]] : [[facing === 'right' ? 12 : 2, 5]];
  for (const [c, r] of blocks) {
    px(ctx, c + dx, r + dy, pal.k, 2, 2); // eyes closed into the mask…
    px(ctx, c + dx, r + dy + (eyes === 'happy' ? 0 : 1), pal.m, 2, 1); // …with a light lid line (^ ^ when happy)
  }
}

function drawRaccoon(ctx: CanvasRenderingContext2D, k: SpriteKey, pal: PixelPalette) {
  if (k.body === 'upright') { drawRaccoonUpright(ctx, k, pal); return; }
  const legPal: PixelPalette = { ...pal, f: pal.s }; // dark little hands and feet
  if (k.pose === 'loaf' || k.body === 'belly' || k.body === 'stretch') {
    // curled up: grey ball, mask peeking out, ringed tail wrapped around
    const breathe = k.frame % 4 < 2 ? 0 : 1;
    pixelEllipse(ctx, 9, 19, 8, 3 + breathe, pal.o);
    pixelEllipse(ctx, 9, 18, 7, 3 + breathe, pal.f);
    px(ctx, 1, 9, pal.o, 4, 5); px(ctx, 2, 10, pal.m, 2, 3); px(ctx, 2, 11, pal.k, 3, 1);
    px(ctx, 1, 8, pal.o, 1, 1); px(ctx, 4, 8, pal.o, 1, 1);
    for (let i = 0; i < 5; i++) px(ctx, 9 + i, 14, i % 2 ? pal.l : pal.s, 1, 1);
    drawExtra(ctx, k.extra, 'left', 6);
    return;
  }
  const sitting = k.pose === 'sit';
  const moving = k.moving && !sitting;
  const bob = catBob(k);
  const sway = k.tail !== undefined && k.tail !== 0 ? k.tail : moving ? [0, 1, 0, -1][k.frame % 4] : [0, 0, 1, 1][k.frame % 4];
  const rows = sitting ? 12 : 13;
  if (!sitting) drawLegs(ctx, k.facing, k.frame, legPal, moving);
  const side = k.facing === 'left' || k.facing === 'right';
  const flip = k.facing === 'right';
  if (side) sideTail(ctx, pal, flip, 6 + bob + sway);
  const map = k.facing === 'down' ? R_FRONT : k.facing === 'up' ? R_BACK : R_SIDE;
  paintMap(ctx, map, pal, flip, bob, rows, { headRows: k.tilt ? 9 : 0, headDx: k.tilt ?? 0 });
  // M10: dedicated Racon mask and muzzle shading across all directional walk frames.
  if (k.facing === 'down') {
    px(ctx, 4, 4 + bob, pal.s, 2, 1); px(ctx, 10, 4 + bob, pal.s, 2, 1);
    px(ctx, 6, 8 + bob, pal.l, 4, 1);
    px(ctx, 4, 9 + bob, pal.m, 2, 1); px(ctx, 10, 9 + bob, pal.m, 2, 1);
    px(ctx, 7, 7 + bob, pal.n, 2, 1);
  } else if (k.facing === 'up') {
    px(ctx, 6, 3 + bob, pal.l, 4, 1);
    px(ctx, 5, 9 + bob, pal.d, 6, 1);
  } else {
    const col = flip ? 12 : 3;
    px(ctx, col, 3 + bob, pal.s, 3, 1);
    px(ctx, col, 8 + bob, pal.m, 3, 1);
  }
  // M10 Racon detailing: mask brow sculpting, muzzle highlights and ringed cheek fur.
  // Applied consistently to both normal and walking frames; the signature fence dance
  // continues to use the dedicated upright timeline.
  if (k.facing === 'down') {
    px(ctx, 4, 4 + bob, pal.s, 2, 1); px(ctx, 10, 4 + bob, pal.s, 2, 1);
    px(ctx, 6, 8 + bob, pal.l, 4, 1);
    px(ctx, 4, 9 + bob, pal.m, 2, 1); px(ctx, 10, 9 + bob, pal.m, 2, 1);
    px(ctx, 7, 7 + bob, pal.n, 2, 1);
  } else if (k.facing === 'up') {
    px(ctx, 6, 3 + bob, pal.l, 4, 1);
    px(ctx, 5, 9 + bob, pal.d, 6, 1);
  } else {
    const col = flip ? 12 : 3;
    px(ctx, col, 3 + bob, pal.s, 3, 1);
    px(ctx, col, 8 + bob, pal.m, 3, 1);
  }
  if (sitting) { px(ctx, 3, 12 + bob, pal.o, 10, 1); px(ctx, 4, 11 + bob, pal.s, 3, 1); px(ctx, 9, 11 + bob, pal.s, 3, 1); }
  if (k.facing === 'down') ringedTail(ctx, pal, 14, 6 + bob + sway, 6, k.frame);
  if (k.facing === 'up') ringedTail(ctx, pal, 6, 9 + bob, 5, k.frame); // hangs down the back, rings showing
  if (k.facing !== 'up') px(ctx, side ? (flip ? 16 : -1) : -1, 7 + bob, pal.w); // whisker
  raccoonEyes(ctx, k.eyes ?? 'open', k.facing, pal, bob);
  drawPaw(ctx, k.paw ?? 'none', k.pawLift ?? 0, k.pawDx ?? 0, k.facing, legPal, bob);
  drawAccessory(ctx, k.accessory, k.facing, bob);
  drawExtra(ctx, k.extra, k.facing, bob);
}

/**
 * Racon standing up for the Fence Dance (always facing the camera). `arms` is the crossing
 * phase: 0 = left forearm over right, 1 = opening, 2 = right over left, 3 = opening the other way,
 * 4 = the finishing "ta-da" (both paws up). `bodyK` -1..1 leans the upper body (the sway).
 */
function drawRaccoonUpright(ctx: CanvasRenderingContext2D, k: SpriteKey, pal: PixelPalette) {
  const lean = Math.max(-1, Math.min(1, Math.round(k.bodyK ?? 0)));
  const phase = ((Math.round(k.arms ?? 0) % 5) + 5) % 5;
  const headDx = lean; // the head leans a little further than the body
  // tail counter-balances the sway (opposite side), ringed, swishing
  const tailX = lean > 0 ? 1 : lean < 0 ? 13 : 14;
  ringedTail(ctx, pal, tailX, 7, 7, k.frame);
  // legs and feet
  px(ctx, 4, 13, pal.o, 3, 3); px(ctx, 5, 13, pal.s, 1, 2);
  px(ctx, 9, 13, pal.o, 3, 3); px(ctx, 10, 13, pal.s, 1, 2);
  px(ctx, 3, 15, pal.o, 4, 1); px(ctx, 9, 15, pal.o, 4, 1);
  // torso (rounded, standing tall) with a light belly
  const t = lean; // torso shift
  px(ctx, 3 + t, 5, pal.o, 10, 9);
  px(ctx, 4 + t, 5, pal.f, 8, 8);
  px(ctx, 6 + t, 6, pal.b, 4, 7);
  // head: the front-facing raccoon head, lifted 4px above the walking position
  paintMap(ctx, R_FRONT, pal, false, -4, 9, { dx: t, headRows: 9, headDx });
  raccoonEyes(ctx, k.eyes ?? 'happy', 'down', pal, -4, t + headDx);
  // forearms: drawn back-arm first, then the front arm, so they visibly cross over each other
  const shoulderL = { x: 4 + t, y: 6 };
  const shoulderR = { x: 11 + t, y: 6 };
  // A forearm is a 2-px stroke: a dark under-edge, a lit upper edge, and a small dark hand. The
  // FRONT arm is drawn last and lighter, so the crossing reads clearly even at 1x.
  const arm = (from: { x: number; y: number }, to: { x: number; y: number }, front: boolean) => {
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1);
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) pts.push({ x: Math.round(from.x + ((to.x - from.x) * i) / steps), y: Math.round(from.y + ((to.y - from.y) * i) / steps) });
    for (const q of pts) px(ctx, q.x, q.y + 1, pal.o, 1, 1);
    for (const q of pts) { px(ctx, q.x, q.y, front ? pal.l : pal.f, 1, 1); px(ctx, q.x, q.y - 1, pal.o, 1, 1); }
    for (const q of pts) px(ctx, q.x, q.y, front ? pal.l : pal.f, 1, 1);
    px(ctx, to.x - 1, to.y - 1, pal.o, 3, 3);
    px(ctx, to.x, to.y, pal.s, 1, 1);
    px(ctx, to.x - 1, to.y, pal.s, 1, 1);
  };
  if (phase === 4) {
    arm(shoulderL, { x: 1 + t, y: 1 }, true);
    arm(shoulderR, { x: 14 + t, y: 1 }, true);
  } else if (phase === 1 || phase === 3) {
    // opening: forearms swing out to the sides, paws apart in front of the belly
    const up = phase === 1 ? 0 : 1;
    arm(shoulderL, { x: 3 + t, y: 9 - up }, phase === 1);
    arm(shoulderR, { x: 12 + t, y: 8 + up }, phase === 3);
  } else {
    // crossed: each paw reaches past the middle to the other side; one forearm over the other
    const leftOver = phase === 0;
    const lTo = { x: 11 + t, y: leftOver ? 9 : 10 };
    const rTo = { x: 4 + t, y: leftOver ? 10 : 9 };
    if (leftOver) { arm(shoulderR, rTo, false); arm(shoulderL, lTo, true); }
    else { arm(shoulderL, lTo, false); arm(shoulderR, rTo, true); }
  }
  drawAccessory(ctx, k.accessory, 'down', -4);
  drawExtra(ctx, k.extra, 'down', -4);
}
