/**
 * Pixel art for "The Song Beneath the Stars": the little chimes, bells and stones of the five places (drawn as
 * "glyphs" over any map, so they work in the original town as well as in every region), and the temple's props.
 * Procedural, same scale and palette language as the rest of Pawville; no image files. Everything here is a pure
 * function of (state, time) so two partners always see the same thing.
 */
import { context2d, pixelEllipse, rect, type CanvasFactory } from './canvasTypes.ts';
import type { PropSprite } from './townArt.ts';
import type { StoryGlyph } from '../story/kit.ts';

const INK = '#2a1d2f';
const TONE_COLORS: Record<string, string> = { kindness: '#ff9db0', curiosity: '#7fc8ff', courage: '#ffb85c', patience: '#9fe0c0', playfulness: '#c8a2ff' };

const glow = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rgba: string) => {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  pixelEllipse(ctx, x, y, rx, ry, rgba);
  ctx.restore();
};

/** One hanging chime: a hook, a cord and 3 tubes of different lengths. `broken` shows cracked tubes and a fallen striker. */
function chime(ctx: CanvasRenderingContext2D, x: number, y: number, tube: string, light: string, o: { broken?: boolean; ribbon?: string; caps?: boolean; sway?: number; crack?: boolean } = {}) {
  const sw = o.sway ?? 0;
  rect(ctx, x - 5, y - 24, 10, 2, '#5a3a22'); rect(ctx, x - 5, y - 24, 2, 6, '#5a3a22'); // bracket
  rect(ctx, x, y - 22, 1, 5, '#3a2a1e');
  const lens = [11, 15, 9];
  for (let i = 0; i < 3; i++) {
    const tx = x - 4 + i * 4 + (i === 1 ? sw : -sw);
    const len = o.broken ? lens[i] - (i === 1 ? 5 : 0) : lens[i];
    rect(ctx, tx, y - 17, 1, 2, '#3a2a1e');
    if (o.caps) { for (let k = 0; k < len; k += 3) rect(ctx, tx - 1, y - 15 + k, 3, 2, ['#ff8fb1', '#7ee0d2', '#ffd36b'][(i + k) % 3]); }
    else { rect(ctx, tx - 1, y - 15, 3, len, tube); rect(ctx, tx - 1, y - 15, 1, len, light); }
    if (o.crack && i === 1) { rect(ctx, tx, y - 11, 1, 3, INK); rect(ctx, tx + 1, y - 8, 1, 2, INK); }
    if (o.ribbon) rect(ctx, tx - 1, y - 12, 3, 1, o.ribbon);
  }
  rect(ctx, x - 1, y - 3, 3, 2, '#d8c8a8'); // striker
  if (o.broken) { rect(ctx, x + 5, y - 1, 3, 1, '#d8c8a8'); rect(ctx, x - 7, y, 3, 1, '#cfe4ff'); }
}

/** Draw every story glyph visible on screen. */
export function drawStoryGlyphs(ctx: CanvasRenderingContext2D, glyphs: readonly StoryGlyph[], time: number, still: boolean, cam: { x: number; y: number; w: number; h: number }) {
  for (const g of glyphs) {
    const { x, y } = g;
    if (x < cam.x - 30 || x > cam.x + cam.w + 30 || y < cam.y - 40 || y > cam.y + cam.h + 40) continue;
    const sway = still ? 0 : Math.round(Math.sin(time * 2 + x * 0.1) * 1);
    const pulse = still ? 0.7 : 0.55 + 0.25 * Math.sin(time * 2.4 + x);
    pixelEllipse(ctx, x, y, 7, 2, 'rgba(20,12,30,0.28)');
    switch (g.glyph) {
      case 'chime': // the old street chime in the village, and the broken/mended chime in Old Town
        if (g.state === 'broken') chime(ctx, x, y, '#b9c3d3', '#e8eef7', { broken: true, crack: true });
        else if (g.state === 'careful') { chime(ctx, x, y, '#cfe4ff', '#ffffff', { sway }); glow(ctx, x, y - 12, 9, 7, `rgba(207,228,255,${(pulse * 0.25).toFixed(2)})`); }
        else if (g.state === 'craft') chime(ctx, x, y, '#d9c9a8', '#f5ecd8', { sway, ribbon: '#e0475c' });
        else if (g.state === 'improv') chime(ctx, x, y, '#ffffff', '#ffffff', { sway: sway * 2, caps: true });
        else if (g.state === 'wait') chime(ctx, x, y, '#b9c3d3', '#e8eef7', { sway, crack: true });
        else { chime(ctx, x, y, '#b9c3d3', '#e8eef7', { sway }); if (g.state === 'alive') glow(ctx, x, y - 12, 8, 6, `rgba(207,228,255,${(pulse * 0.2).toFixed(2)})`); }
        break;
      case 'fogbell': {
        rect(ctx, x - 1, y - 20, 3, 20, '#5a3a22'); rect(ctx, x - 6, y - 21, 13, 2, '#5a3a22');
        pixelEllipse(ctx, x, y - 14, 4, 4, '#c9a24a'); rect(ctx, x - 4, y - 12, 9, 2, '#c9a24a'); rect(ctx, x - 1, y - 9, 3, 2, '#7a5a22');
        rect(ctx, x + 5, y - 19, 1, 8, '#8a7a62'); // the frayed cord
        break;
      }
      case 'stone': {
        pixelEllipse(ctx, x, y - 6, 6, 7, '#8f8a99'); rect(ctx, x - 5, y - 8, 10, 2, '#a9a4b5');
        for (let i = 0; i < 5; i++) rect(ctx, x - 4 + i * 2, y - 8 - (i % 2), 1, 3, g.state === 'bloom' ? '#7fc8ff' : '#6d6878'); // five-part symbol
        rect(ctx, x + 6, y - 6, 1, 6, '#4f9a67'); pixelEllipse(ctx, x + 6, y - 8, 2, 2, '#7fc8ff'); rect(ctx, x + 6, y - 8, 1, 1, '#fff3e6');
        if (g.state === 'bloom') glow(ctx, x, y - 8, 9, 8, `rgba(127,200,255,${(pulse * 0.2).toFixed(2)})`);
        break;
      }
      case 'archive': {
        rect(ctx, x - 7, y - 10, 14, 10, '#6b4a2e'); rect(ctx, x - 7, y - 10, 14, 2, '#8a5a3b'); rect(ctx, x - 5, y - 7, 10, 5, '#3a2a1e');
        rect(ctx, x - 2, y - 6, 5, 4, '#f3e2c4'); rect(ctx, x - 1, y - 5, 3, 1, '#8a7a62');
        break;
      }
      case 'gate': {
        const open = g.state === 'open';
        rect(ctx, x - 14, y - 34, 4, 34, '#5a5a66'); rect(ctx, x + 10, y - 34, 4, 34, '#5a5a66'); rect(ctx, x - 14, y - 36, 28, 4, '#6e6e7c'); // stone frame
        if (open) {
          rect(ctx, x - 10, y - 32, 20, 32, '#1b1424'); rect(ctx, x - 10, y - 30, 3, 30, '#8a5a3b'); rect(ctx, x + 7, y - 30, 3, 30, '#8a5a3b');
          glow(ctx, x, y - 14, 8, 12, `rgba(255,226,122,${(pulse * 0.35).toFixed(2)})`);
          rect(ctx, x - 1, y - 12, 2, 1, '#fff3c4');
        } else {
          rect(ctx, x - 10, y - 32, 20, 32, '#6b4a2e');
          for (let i = 0; i < 4; i++) rect(ctx, x - 10 + i * 5 + 1, y - 32, 1, 32, '#8a5a3b');
          rect(ctx, x - 10, y - 24, 20, 2, '#3a3a46'); rect(ctx, x - 10, y - 10, 20, 2, '#3a3a46'); rect(ctx, x + 2, y - 16, 4, 4, '#c9a24a');
        }
        if (g.state !== 'open') glow(ctx, x - 8, y - 8, 6, 5, `rgba(255,226,122,${(pulse * 0.18).toFixed(2)})`); // the lantern left on the ground
        break;
      }
      case 'steps': {
        for (let i = 0; i < 4; i++) rect(ctx, x - 12 + i * 6, y - 3 - i * 2, 12, 3, i % 2 ? '#9a96a6' : '#8a8696');
        rect(ctx, x - 12, y - 20, 24, 2, '#5a3a22');
        for (let i = 0; i < 3; i++) { rect(ctx, x - 8 + i * 8, y - 18, 1, 3, '#3a2a1e'); rect(ctx, x - 9 + i * 8, y - 15, 3, 6 + (i % 2) * 2, g.state === 'heard' ? '#cfe4ff' : '#6d7080'); }
        break;
      }
      case 'lantern5': {
        rect(ctx, x - 1, y - 24, 3, 24, '#3a2a1e'); rect(ctx, x - 7, y - 30, 15, 3, '#3a2a1e');
        const cols = ['#ff9db0', '#7fc8ff', '#ffb85c', '#9fe0c0', '#c8a2ff'];
        const lit = g.state === 'lit' ? 5 : 0;
        for (let i = 0; i < 5; i++) { rect(ctx, x - 6 + i * 3, y - 28, 3, 9, i < lit || (!still && g.state === 'cold' && false) ? cols[i] : '#5a5668'); rect(ctx, x - 6 + i * 3, y - 28, 1, 9, '#2a1d2f'); }
        if (lit) glow(ctx, x, y - 24, 12, 9, `rgba(255,226,170,${(pulse * 0.3).toFixed(2)})`);
        break;
      }
      case 'gardenchime': {
        const free = g.state === 'free' || g.state === 'singing';
        rect(ctx, x, y - 18, 1, 6, '#3a2a1e'); rect(ctx, x - 3, y - 19, 7, 2, '#4f9a67');
        rect(ctx, x - 2, y - 12, 5, 6, g.state === 'tangled' ? '#8a8a8a' : '#cfe4ff'); rect(ctx, x - 2, y - 12, 1, 6, '#ffffff');
        if (g.state === 'tangled') { rect(ctx, x - 5, y - 14, 10, 1, '#7a6a52'); rect(ctx, x - 3, y - 11, 8, 1, '#7a6a52'); rect(ctx, x + 2, y - 15, 1, 6, '#7a6a52'); }
        if (free) glow(ctx, x, y - 9, 7, 6, `rgba(159,224,192,${(pulse * 0.28).toFixed(2)})`);
        rect(ctx, x - 4, y - 3, 1, 3, '#4f9a67'); rect(ctx, x + 4, y - 4, 1, 4, '#4f9a67'); rect(ctx, x + 4, y - 5, 2, 1, '#7fc8ff');
        break;
      }
      case 'echo': {
        for (let i = 0; i < 3; i++) { const r = 6 + i * 5 + (still ? 0 : Math.round(((time * 4 + i * 2) % 6))); ctx.globalAlpha = Math.max(0.12, 0.5 - i * 0.15); pixelEllipse(ctx, x, y - 2, r, Math.max(1, Math.round(r / 3)), g.state === 'answered' ? '#fff3c4' : '#9fc8ff'); }
        ctx.globalAlpha = 1;
        rect(ctx, x - 1, y - 8, 3, 8, '#cfc6e3'); rect(ctx, x - 3, y - 10, 7, 3, '#ffffff');
        break;
      }
      case 'rise': {
        rect(ctx, x - 5, y - 20, 10, 20, '#7d7a8a'); rect(ctx, x - 5, y - 20, 2, 20, '#a9a6b8');
        rect(ctx, x - 1, y - 20, 1, 8, INK); rect(ctx, x, y - 12, 1, 4, INK); rect(ctx, x + 1, y - 9, 1, 3, INK); // the crack
        if (g.state === 'ribbons') { rect(ctx, x + 5, y - 17, 6, 1, '#7fc8ff'); rect(ctx, x + 9, y - 18, 1, 3, '#7fc8ff'); }
        if (g.state === 'seen') glow(ctx, x, y - 22, 8, 6, `rgba(255,243,196,${(pulse * 0.2).toFixed(2)})`);
        break;
      }
      case 'mark': {
        const c = TONE_COLORS[g.state ?? ''] ?? '#fff3c4';
        pixelEllipse(ctx, x, y - 8, 6, 8, '#8a8696'); rect(ctx, x - 3, y - 13, 7, 9, '#6d6878');
        rect(ctx, x - 1, y - 12, 3, 7, c); rect(ctx, x - 3, y - 9, 7, 2, c);
        if (g.read) glow(ctx, x, y - 9, 10, 9, `rgba(255,243,196,${(pulse * 0.3).toFixed(2)})`);
        break;
      }
      case 'hearth': { // a small five-chime frame (The Purring Cup stage)
        rect(ctx, x - 12, y - 30, 24, 2, '#5a3a22'); rect(ctx, x - 12, y - 30, 2, 30, '#5a3a22'); rect(ctx, x + 10, y - 30, 2, 30, '#5a3a22');
        const cols = ['#ff9db0', '#7fc8ff', '#ffb85c', '#9fe0c0', '#c8a2ff'];
        for (let i = 0; i < 5; i++) { rect(ctx, x - 8 + i * 4, y - 28, 1, 3, INK); rect(ctx, x - 9 + i * 4, y - 25, 3, 8 + (i % 3) * 2, cols[i]); }
        glow(ctx, x, y - 18, 14, 10, `rgba(255,226,170,${(pulse * 0.22).toFixed(2)})`);
        break;
      }
    }
  }
}

// =============================================================================================
// Temple props (region sprites)
// =============================================================================================
function sprite(factory: CanvasFactory, w: number, h: number, ax: number, ay: number, draw: (ctx: CanvasRenderingContext2D) => void): PropSprite {
  const canvas = factory(w, h);
  draw(context2d(canvas));
  return { canvas, ox: -ax, oy: -ay };
}

function hearthsong(ctx: CanvasRenderingContext2D, lit: boolean) {
  const cols = ['#ff9db0', '#7fc8ff', '#ffb85c', '#9fe0c0', '#c8a2ff'];
  pixelEllipse(ctx, 30, 35, 28, 3, 'rgba(20,12,30,0.3)');
  rect(ctx, 4, 30, 52, 6, '#6d6878'); rect(ctx, 4, 30, 52, 2, '#9a96a6'); // base
  rect(ctx, 6, 4, 4, 28, '#7d7a8a'); rect(ctx, 50, 4, 4, 28, '#7d7a8a'); rect(ctx, 6, 4, 1, 28, '#a9a6b8'); rect(ctx, 50, 4, 1, 28, '#a9a6b8');
  rect(ctx, 4, 2, 52, 4, '#8a8696'); rect(ctx, 4, 2, 52, 1, '#b7b3c4'); // lintel
  for (let i = 0; i < 6; i++) {
    const x = 12 + i * 7, len = 10 + ((i * 5) % 4) * 3;
    rect(ctx, x, 6, 1, 3, INK);
    if (i === 5) { rect(ctx, x - 1, 9, 3, len, lit ? '#fff3c4' : '#4a4658'); continue; } // the sixth: Biscuit's phrase
    rect(ctx, x - 1, 9, 3, len, lit ? cols[i % 5] : '#5a5668'); rect(ctx, x - 1, 9, 1, len, lit ? '#ffffff' : '#6d6878');
  }
  if (lit) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; pixelEllipse(ctx, 30, 18, 28, 16, 'rgba(255,226,170,0.18)'); ctx.restore(); }
}

export function buildStorySprites(factory: CanvasFactory, s: Record<string, PropSprite>): void {
  s.hearthsong0 = sprite(factory, 60, 38, 30, 36, (ctx) => hearthsong(ctx, false));
  s.hearthsong1 = sprite(factory, 60, 38, 30, 36, (ctx) => hearthsong(ctx, true));
  s.templepillar = sprite(factory, 16, 46, 8, 44, (ctx) => {
    pixelEllipse(ctx, 8, 44, 7, 2, 'rgba(20,12,30,0.3)');
    rect(ctx, 3, 8, 10, 34, '#a9a6b8'); rect(ctx, 3, 8, 2, 34, '#cfcbd8'); rect(ctx, 11, 8, 2, 34, '#8a8696');
    rect(ctx, 1, 4, 14, 5, '#c0bccb'); rect(ctx, 1, 40, 14, 4, '#8a8696'); rect(ctx, 5, 14, 1, 24, '#8a8696'); rect(ctx, 9, 16, 1, 22, '#8a8696');
  });
  s.templebowl = sprite(factory, 14, 10, 7, 9, (ctx) => {
    pixelEllipse(ctx, 7, 9, 6, 1, 'rgba(20,12,30,0.25)'); rect(ctx, 3, 5, 8, 3, '#b5835a'); rect(ctx, 2, 4, 10, 2, '#d8a97a');
    rect(ctx, 4, 3, 1, 1, '#ffd36b'); rect(ctx, 7, 2, 1, 1, '#e0475c'); rect(ctx, 9, 3, 1, 1, '#7ee0d2');
  });
  s.templelamp0 = sprite(factory, 10, 26, 5, 25, (ctx) => { rect(ctx, 4, 8, 2, 17, '#3a3a46'); rect(ctx, 1, 3, 8, 6, '#3a3a46'); rect(ctx, 2, 4, 6, 4, '#5a5668'); });
  s.templelamp1 = sprite(factory, 22, 34, 11, 25, (ctx) => {
    rect(ctx, 10, 8, 2, 17, '#3a3a46'); rect(ctx, 7, 3, 8, 6, '#3a3a46'); rect(ctx, 8, 4, 6, 4, '#ffe27a');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; pixelEllipse(ctx, 11, 6, 10, 8, 'rgba(255,226,122,0.25)'); ctx.restore();
  });
  s.templearch = sprite(factory, 76, 44, 38, 42, (ctx) => {
    rect(ctx, 2, 6, 8, 36, '#a9a6b8'); rect(ctx, 66, 6, 8, 36, '#a9a6b8'); rect(ctx, 2, 6, 2, 36, '#cfcbd8');
    rect(ctx, 0, 2, 76, 6, '#c0bccb'); rect(ctx, 0, 2, 76, 1, '#e2dfea');
    for (let i = 0; i < 5; i++) rect(ctx, 14 + i * 11, 8, 2, 6, ['#ff9db0', '#7fc8ff', '#ffb85c', '#9fe0c0', '#c8a2ff'][i]);
  });
  s.trailstone = sprite(factory, 14, 12, 7, 11, (ctx) => { pixelEllipse(ctx, 7, 11, 6, 1, 'rgba(20,12,30,0.25)'); rect(ctx, 3, 3, 8, 8, '#9a96a6'); rect(ctx, 3, 3, 8, 2, '#c0bccb'); rect(ctx, 5, 6, 4, 1, '#6d6878'); });
}
