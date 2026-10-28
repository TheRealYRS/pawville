/**
 * Photo composition (filters, vignette, frames, captions) applied to the CAPTURED scene canvas —
 * never to the live interface. Pure apart from the injected canvas factory, so it can run in
 * tests (skia-canvas) and the browser alike.
 */
import type { CanvasFactory, CanvasLike } from '../render/canvasTypes.ts';

export type PhotoFilter = 'none' | 'warm' | 'dusk' | 'film' | 'mono';
export type PhotoFrame = 'polaroid' | 'plain' | 'stars' | 'booth';

/** Gentle filters: coat colours must stay recognisable (tested on Puchu's orange dots). */
export const FILTERS: readonly { id: PhotoFilter; label: string; css: string; tint: string | null }[] = [
  { id: 'none', label: 'Natural', css: 'none', tint: null },
  { id: 'warm', label: 'Warm', css: 'sepia(0.16) saturate(1.12) brightness(1.03)', tint: 'rgba(255,170,90,0.10)' },
  { id: 'dusk', label: 'Dusk', css: 'hue-rotate(-8deg) saturate(1.05) brightness(0.95)', tint: 'rgba(120,80,160,0.13)' },
  { id: 'film', label: 'Film', css: 'contrast(1.06) saturate(0.9) sepia(0.1)', tint: 'rgba(255,240,210,0.08)' },
  { id: 'mono', label: 'Mono', css: 'grayscale(1) contrast(1.08)', tint: null },
];

export interface ComposeOptions {
  filter: PhotoFilter;
  frame: PhotoFrame;
  vignette: boolean;
  caption: string;
  /** Small second line: place and/or date. */
  subline: string;
}

/** Simple tint-only fallback for canvases without `ctx.filter` (e.g. older Safari). */
function monoFallback(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  try {
    const img = ctx.getImageData(x, y, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.round(d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11);
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, x, y);
  } catch {
    /* tainted canvases can't be read — the scene is drawn locally, so this shouldn't happen */
  }
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

export function composePhoto(scene: CanvasLike, opts: ComposeOptions, factory: CanvasFactory): CanvasLike | null {
  const f = FILTERS.find((x) => x.id === opts.filter) ?? FILTERS[0];
  const framed = opts.frame !== 'plain';
  const pad = framed ? Math.round(scene.width * 0.04) : 0;
  const bottom = framed ? Math.round(scene.width * 0.16) : 0;
  const out = factory(scene.width + pad * 2, scene.height + pad * 2 + bottom);
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  if (framed) {
    ctx.fillStyle = opts.frame === 'stars' ? '#1d1830' : opts.frame === 'booth' ? '#f6d5e3' : '#fff8ef';
    ctx.fillRect(0, 0, out.width, out.height);
  }
  const hasFilter = 'filter' in ctx && f.css !== 'none';
  if (hasFilter) (ctx as CanvasRenderingContext2D & { filter: string }).filter = f.css;
  ctx.drawImage(scene as unknown as CanvasImageSource, pad, pad);
  if (hasFilter) (ctx as CanvasRenderingContext2D & { filter: string }).filter = 'none';
  if (!('filter' in ctx) && f.id === 'mono') monoFallback(ctx, pad, pad, scene.width, scene.height);
  if (f.tint) {
    ctx.fillStyle = f.tint;
    ctx.fillRect(pad, pad, scene.width, scene.height);
  }
  if (opts.vignette) {
    const g = ctx.createRadialGradient(pad + scene.width / 2, pad + scene.height / 2, Math.min(scene.width, scene.height) * 0.42, pad + scene.width / 2, pad + scene.height / 2, Math.max(scene.width, scene.height) * 0.72);
    g.addColorStop(0, 'rgba(13,11,18,0)');
    g.addColorStop(1, 'rgba(13,11,18,0.38)');
    ctx.fillStyle = g;
    ctx.fillRect(pad, pad, scene.width, scene.height);
  }
  if (framed) {
    const s = scene.width / 600;
    if (opts.frame === 'booth') {
      ctx.fillStyle = '#b74882';
      for (let i = 0; i < 5; i++) {
        const y = pad + (i + 0.5) * scene.height / 5;
        ctx.fillRect(Math.max(1, pad / 4), y, Math.max(2, pad / 3), Math.max(2, pad / 3));
        ctx.fillRect(out.width - Math.max(1, pad * 0.75), y, Math.max(2, pad / 3), Math.max(2, pad / 3));
      }
    }
    if (opts.frame === 'stars') {
      // "Magic Moment" frame: a dark border with green-gold stars.
      const stars: [number, number, number][] = [[0.06, 0.05, 10], [0.94, 0.06, 8], [0.03, 0.5, 6], [0.97, 0.45, 9], [0.12, 0.98, 7], [0.88, 0.97, 10], [0.5, 0.02, 6]];
      stars.forEach(([fx, fy, r], i) => drawStar(ctx, fx * out.width, fy * (scene.height + pad * 2), r * s * 1.4, i % 2 ? '#FFD45E' : '#57F28A'));
    }
    ctx.fillStyle = opts.frame === 'stars' ? '#E9FFF0' : '#3a2a3f';
    ctx.font = `600 ${Math.round(26 * s)}px Fredoka, Nunito, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(opts.caption, out.width / 2, scene.height + pad * 2 + bottom * 0.45);
    if (opts.subline) {
      ctx.fillStyle = opts.frame === 'stars' ? '#9FE8B8' : '#8a7a6b';
      ctx.font = `600 ${Math.round(15 * s)}px Nunito, sans-serif`;
      ctx.fillText(opts.subline, out.width / 2, scene.height + pad * 2 + bottom * 0.78);
    }
  }
  return out;
}
