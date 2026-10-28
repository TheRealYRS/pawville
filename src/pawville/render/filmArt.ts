/**
 * Milestone 8.2: paints one frame of a Bijou film (city/cinema.ts) at 160×90 "film pixels".
 * Everything is drawn from pixel rectangles like the rest of the game — no image files. Old films
 * are converted to sepia black-and-white with grain and the odd scratch, in software, so it looks
 * the same in every browser.
 */
import type { FilmActor, FilmScene } from '../city/cinema.ts';
import { pixelEllipse, rect } from './canvasTypes.ts';
import { drawLumi } from './adventureFx.ts';
import { drawSignText } from './pixelFont.ts';

export const FILM_W = 160;
export const FILM_H = 90;

function h1(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function sky(ctx: CanvasRenderingContext2D, top: string, bottom: string, h = FILM_H) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FILM_W, h);
}
function stars(ctx: CanvasRenderingContext2D, t: number, n = 40, maxY = 50) {
  for (let i = 0; i < n; i++) {
    const tw = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.7);
    ctx.globalAlpha = 0.35 + tw * 0.6;
    rect(ctx, Math.floor(h1(i * 3.1) * FILM_W), Math.floor(h1(i * 7.7) * maxY), 1, 1, '#fff3c4');
  }
  ctx.globalAlpha = 1;
}
function sea(ctx: CanvasRenderingContext2D, y: number, t: number, deep: string, light: string, rough = 1) {
  rect(ctx, 0, y, FILM_W, FILM_H - y, deep);
  for (let r = 0; r < 6; r++) for (let i = 0; i < 12; i++) {
    const x = Math.floor((i * 17 + r * 9 + t * (8 + r * 3) * rough) % (FILM_W + 20)) - 10;
    rect(ctx, x, y + 3 + r * 6 + Math.round(Math.sin(t * 2 * rough + i + r) * rough), 6 + (r % 3), 1, light);
  }
}
function hills(ctx: CanvasRenderingContext2D, y: number, col: string, seed: number) {
  ctx.fillStyle = col;
  for (let x = 0; x < FILM_W; x++) {
    const hh = Math.round(6 + Math.sin(x / 13 + seed) * 4 + Math.sin(x / 5 + seed * 2) * 1.5);
    ctx.fillRect(x, y - hh, 1, FILM_H - y + hh);
  }
}
function pine(ctx: CanvasRenderingContext2D, x: number, base: number, s: number, col: string) {
  for (let r = 0; r < s; r++) rect(ctx, x - Math.floor(r / 2), base - s + r, Math.floor(r / 2) * 2 + 1, 1, col);
  rect(ctx, x, base, 1, 2, '#2a1d2f');
}

function backdrop(ctx: CanvasRenderingContext2D, s: FilmScene, t: number) {
  switch (s.backdrop) {
    case 'title': rect(ctx, 0, 0, FILM_W, FILM_H, '#120e1f'); for (let i = 0; i < 18; i++) rect(ctx, 0, i * 5, FILM_W, 1, 'rgba(255,255,255,0.03)'); return;
    case 'sea-night': sky(ctx, '#141235', '#3a2f6b', 56); stars(ctx, t); sea(ctx, 56, t, '#1d2a52', '#5d7fc0'); return;
    case 'sea-storm': {
      sky(ctx, '#1b1d2c', '#3b4256', 54);
      for (let i = 0; i < 5; i++) pixelEllipse(ctx, ((i * 41 + t * 6) % 200) - 20, 10 + (i % 3) * 7, 24, 6, '#2a2e40');
      if (Math.floor(t * 1.3) % 5 === 0 && (t * 1.3) % 1 < 0.12) rect(ctx, 0, 0, FILM_W, 54, 'rgba(255,255,255,0.35)'); // lightning
      sea(ctx, 54, t, '#1a2236', '#8796b8', 2.4);
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 60; i++) rect(ctx, Math.floor((h1(i) * FILM_W + t * 40) % FILM_W), Math.floor((h1(i * 3) * FILM_H + t * 120) % FILM_H), 1, 3, '#cfd8ee');
      ctx.globalAlpha = 1;
      return;
    }
    case 'harbor-dawn': {
      sky(ctx, '#ffb27a', '#ffe3c0', 56);
      pixelEllipse(ctx, 120, 54, 12, 12, '#fff3c4');
      sea(ctx, 56, t, '#4a80bb', '#cfe4ff', 0.6);
      rect(ctx, 0, 50, 34, 8, '#6b4329'); for (let x = 2; x < 34; x += 6) rect(ctx, x, 58, 2, 10, '#5a3a22'); // the harbour wall
      return;
    }
    case 'forest-night': {
      sky(ctx, '#0f1530', '#1f2f4a');
      stars(ctx, t, 25, 30);
      for (let i = 0; i < 9; i++) pine(ctx, 8 + i * 19, 62 + (i % 2) * 4, 26 + (i % 3) * 6, '#16302a');
      rect(ctx, 0, 66, FILM_W, 24, '#1d3a2c'); for (let i = 0; i < 40; i++) rect(ctx, Math.floor(h1(i * 9) * FILM_W), 68 + Math.floor(h1(i * 4) * 20), 2, 1, '#2c5a3e');
      return;
    }
    case 'sky-fall': sky(ctx, '#0b0a24', '#2a1f4a'); stars(ctx, t, 60, 80); hills(ctx, 82, '#141030', 1.3); return;
    case 'meadow': sky(ctx, '#9cc3ff', '#e8f4ff', 60); hills(ctx, 66, '#4f9a67', 0.4); return;
    case 'clock-square': {
      sky(ctx, '#3a2f6b', '#ff9d5c', 70);
      rect(ctx, 60, 10, 40, 64, '#8a6a52'); rect(ctx, 62, 12, 36, 60, '#a07c5e'); rect(ctx, 56, 6, 48, 6, '#5a3a22'); rect(ctx, 72, 0, 16, 8, '#5a3a22');
      pixelEllipse(ctx, 80, 30, 12, 12, '#fff3e6'); pixelEllipse(ctx, 80, 30, 11, 11, '#f3e2c4');
      for (let i = 0; i < 12; i++) rect(ctx, 80 + Math.round(Math.sin((i / 12) * Math.PI * 2) * 9), 30 - Math.round(Math.cos((i / 12) * Math.PI * 2) * 9), 1, 1, '#2a1d2f');
      rect(ctx, 0, 74, FILM_W, 16, '#7a6a8a'); for (let x = 0; x < FILM_W; x += 8) for (let y = 74; y < 90; y += 4) rect(ctx, x + ((y / 4) % 2 ? 4 : 0), y, 7, 3, '#8a7da0');
      return;
    }
    case 'clock-face': {
      rect(ctx, 0, 0, FILM_W, FILM_H, '#5a3a22');
      pixelEllipse(ctx, 80, 45, 38, 38, '#3a2414'); pixelEllipse(ctx, 80, 45, 35, 35, '#fff3e6'); pixelEllipse(ctx, 80, 45, 33, 33, '#f3e2c4');
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; rect(ctx, 80 + Math.round(Math.sin(a) * 28) - 1, 45 - Math.round(Math.cos(a) * 28) - 1, 3, 3, '#2a1d2f'); }
      return;
    }
    case 'rooftops-night': {
      sky(ctx, '#141235', '#2a1f4a');
      stars(ctx, t, 40, 40);
      for (let i = 0; i < 7; i++) { const x = i * 24 - 4, h = 22 + (i % 3) * 9; rect(ctx, x, FILM_H - h, 22, h, '#231c44'); rect(ctx, x + 14, FILM_H - h - 8, 4, 8, '#1b1530'); if (i % 2) rect(ctx, x + 5, FILM_H - h + 6, 3, 4, '#ffd68c'); }
      return;
    }
  }
}

function tinyCat(ctx: CanvasRenderingContext2D, x: number, y: number, fur: string, flip = false, t = 0) {
  const d = flip ? -1 : 1;
  rect(ctx, x - 4, y - 5, 8, 5, fur); // body
  rect(ctx, x + d * 3 - (flip ? 3 : 0), y - 9, 4, 4, fur); // head
  rect(ctx, x + d * 3 - (flip ? 3 : 0), y - 10, 1, 1, fur); rect(ctx, x + d * 3 + 3 - (flip ? 3 : 0), y - 10, 1, 1, fur); // ears
  rect(ctx, x - d * 5 - (flip ? 0 : 0), y - 8 + Math.round(Math.sin(t * 3)), 1, 4, fur); // tail
  rect(ctx, x + d * 4 - (flip ? 2 : -1) , y - 8, 1, 1, '#2a1d2f'); // eye
}

function actor(ctx: CanvasRenderingContext2D, a: FilmActor, k: number, t: number, s: FilmScene) {
  switch (a) {
    case 'moon': pixelEllipse(ctx, 132, 14, 7, 7, '#fff3c4'); pixelEllipse(ctx, 135, 12, 6, 6, s.backdrop === 'sky-fall' ? '#0b0a24' : '#1b1844'); return;
    case 'boat': {
      const storm = s.backdrop === 'sea-storm';
      const bx = Math.round(30 + k * 70), by = 56 + Math.round(Math.sin(t * (storm ? 3 : 1.5)) * (storm ? 3 : 1));
      rect(ctx, bx - 12, by - 2, 24, 4, '#6b4329'); rect(ctx, bx - 10, by + 2, 20, 2, '#5a3a22');
      rect(ctx, bx, by - 22, 1, 20, '#3a2414');
      for (let r = 0; r < 16; r++) rect(ctx, bx + 1, by - 21 + r, Math.floor((16 - r) * 0.7), 1, '#f3e2c4');
      return;
    }
    case 'sailor': { const bx = Math.round(30 + k * 70) - 6, by = 54 + Math.round(Math.sin(t * 1.5)); tinyCat(ctx, bx, by, '#ff8a35', false, t); rect(ctx, bx + 2, by - 11, 5, 1, '#2a2a4a'); return; }
    case 'lighthouse': case 'lighthouse-lit': {
      const x = 140, base = 56;
      rect(ctx, x - 4, base - 30, 8, 30, '#f3e2c4'); rect(ctx, x - 4, base - 22, 8, 4, '#e0475c'); rect(ctx, x - 4, base - 10, 8, 4, '#e0475c'); rect(ctx, x - 5, base - 34, 10, 4, '#3a2a3e');
      if (a === 'lighthouse-lit') {
        rect(ctx, x - 3, base - 33, 6, 2, '#ffe9a8');
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25;
        const sw = Math.sin(t * 1.2);
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath(); ctx.moveTo(x, base - 32); ctx.lineTo(x - 90, base - 40 + sw * 12); ctx.lineTo(x - 90, base - 24 + sw * 12); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      return;
    }
    case 'star': { const p = 0.6 + 0.4 * Math.sin(t * 3); ctx.globalAlpha = p; rect(ctx, 79, 14, 3, 9, '#ffe27a'); rect(ctx, 76, 17, 9, 3, '#ffe27a'); rect(ctx, 80, 18, 1, 1, '#ffffff'); ctx.globalAlpha = 1; return; }
    case 'star-fall': {
      const x = Math.round(30 + k * 80), y = Math.round(10 + k * 60);
      for (let i = 1; i < 12; i++) { ctx.globalAlpha = 1 - i / 12; rect(ctx, x - i * 3, y - i * 2, 2, 2, '#fff3c4'); }
      ctx.globalAlpha = 1; rect(ctx, x - 1, y - 1, 3, 3, '#ffe27a');
      return;
    }
    case 'lumi': drawLumi(ctx, s.backdrop === 'sky-fall' ? 80 : Math.round(60 + Math.sin(t * 0.8) * 6), s.backdrop === 'sky-fall' ? 40 : 70, t, false); return;
    case 'two-cats': tinyCat(ctx, 96, 76, '#ff8a35', true, t); tinyCat(ctx, 110, 76, '#3a3348', true, t + 1); return;
    case 'kitten': tinyCat(ctx, 80, 76, '#cfc6e3', false, t); return;
    case 'clock-11': case 'clock-12': {
      const face = s.backdrop === 'clock-face';
      const cx = 80, cy = face ? 45 : 30, L = face ? 22 : 7, M = face ? 15 : 5;
      const hourA = a === 'clock-11' ? (11 / 12) * Math.PI * 2 : 0;
      const minA = a === 'clock-12' ? Math.min(1, k * 2) * 0 : 0;
      for (let i = 0; i <= L; i++) rect(ctx, cx + Math.round(Math.sin(minA) * i), cy - Math.round(Math.cos(minA) * i), face ? 2 : 1, face ? 2 : 1, '#2a1d2f');
      for (let i = 0; i <= M; i++) rect(ctx, cx + Math.round(Math.sin(hourA) * i), cy - Math.round(Math.cos(hourA) * i), face ? 3 : 1, face ? 3 : 1, '#5a2a0e');
      if (a === 'clock-12' && face) for (let i = 0; i < 6; i++) { const r = 40 + ((t * 30 + i * 9) % 30); ctx.globalAlpha = 0.5 - (r - 40) / 60; ctx.strokeStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(cx, cy, r, -0.6, 0.6); ctx.stroke(); }
      ctx.globalAlpha = 1;
      return;
    }
    case 'lamplighter': {
      const x = s.backdrop === 'rooftops-night' ? Math.round(30 + k * 60) : 40, y = s.backdrop === 'rooftops-night' ? 64 : 82;
      tinyCat(ctx, x, y, '#8a7da0', false, t); rect(ctx, x + 6, y - 18, 1, 12, '#3a2414'); rect(ctx, x + 5, y - 20, 3, 3, '#ffd27a');
      return;
    }
    case 'key': { const y = 58 + Math.round(Math.sin(t * 3) * 1); rect(ctx, 120, y, 6, 2, '#ffc94a'); pixelEllipse(ctx, 118, y + 1, 2, 2, '#ffc94a'); rect(ctx, 124, y + 2, 1, 2, '#ffc94a'); return; }
    case 'fireflies': for (let i = 0; i < 10; i++) { ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i)); rect(ctx, Math.round((h1(i) * FILM_W + Math.sin(t + i) * 6)), Math.round(40 + h1(i * 5) * 30 + Math.cos(t * 1.3 + i) * 4), 1, 1, '#d7ff7a'); } ctx.globalAlpha = 1; return;
    case 'birds': for (let i = 0; i < 4; i++) { const x = Math.round((i * 30 + t * 14) % (FILM_W + 20)) - 10, y = 14 + i * 5 + Math.round(Math.sin(t * 4 + i) * 1); rect(ctx, x, y, 2, 1, '#3a2a3e'); rect(ctx, x + 2, y + 1, 1, 1, '#3a2a3e'); rect(ctx, x + 3, y, 2, 1, '#3a2a3e'); } return;
  }
}

/** Sepia black-and-white with grain and scratches (software, so it works everywhere). */
function mono(ctx: CanvasRenderingContext2D, t: number) {
  try {
    const img = ctx.getImageData(0, 0, FILM_W, FILM_H);
    const d = img.data;
    const seed = Math.floor(t * 12);
    for (let i = 0; i < d.length; i += 4) {
      const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      const n = (h1(i * 0.37 + seed) - 0.5) * 18;
      const v = Math.max(0, Math.min(255, l + n));
      d[i] = Math.min(255, v * 1.07); d[i + 1] = v * 0.98; d[i + 2] = v * 0.86;
    }
    ctx.putImageData(img, 0, 0);
  } catch { /* canvas not readable — skip the effect */ }
  if (h1(Math.floor(t * 8)) > 0.6) rect(ctx, Math.floor(h1(Math.floor(t * 8) + 1) * FILM_W), 0, 1, FILM_H, 'rgba(255,248,230,0.35)');
}

/** Draw one film frame. `fade` 0..1 fades to black for scene changes. */
export function drawFilmFrame(ctx: CanvasRenderingContext2D, scene: FilmScene, k: number, t: number, fade: number, still = false): void {
  const tt = still ? 0 : t;
  ctx.imageSmoothingEnabled = false;
  backdrop(ctx, scene, tt);
  for (const a of scene.actors) actor(ctx, a, k, tt, scene);
  if (scene.backdrop === 'title') {
    const title = scene.caption.split(' — ')[0].slice(0, 36);
    const sc = title.length * 8 <= 150 ? 2 : 1;
    drawSignText(ctx, title, FILM_W / 2, sc === 2 ? 38 : 42, '#ffd27a', '#5a2a0e', sc);
  }
  if (scene.mono) mono(ctx, tt);
  if (fade < 1) { ctx.globalAlpha = 1 - fade; rect(ctx, 0, 0, FILM_W, FILM_H, '#000000'); ctx.globalAlpha = 1; }
}
