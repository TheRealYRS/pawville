/**
 * Photo framing maths (pure, unit tested): which part of the world a photo shows, and how far
 * to shift the live camera so the subject sits in the area the photo controls do NOT cover.
 */
export type Framing = 'portrait' | 'medium' | 'wide' | 'couple' | 'environment';
export const FRAMINGS: readonly Framing[] = ['portrait', 'medium', 'wide', 'couple', 'environment'];
/** Max output width of a captured photo (before the scrapbook's own size cap). */
export const MAX_CAPTURE_W = 1280;

/**
 * Crop rectangle (world pixels) + zoom for a framing. Pure, so the "subject always in frame"
 * rule can be unit tested: every subject must lie inside the crop with a margin.
 */
export function framingRect(framing: Framing, subjects: readonly { x: number; y: number }[], world: { w: number; h: number }): { x: number; y: number; w: number; h: number; zoom: number } {
  const SIZES: Record<Framing, { w: number; h: number; zoom: number; lift: number }> = {
    portrait: { w: 120, h: 90, zoom: 6, lift: 12 },
    medium: { w: 200, h: 140, zoom: 4, lift: 10 },
    wide: { w: 320, h: 214, zoom: 3, lift: 8 },
    couple: { w: 150, h: 100, zoom: 5, lift: 12 },
    environment: { w: 400, h: 260, zoom: 2, lift: 40 }, // subject in the lower third
  };
  const cfg = SIZES[framing];
  const list = subjects.length ? subjects : [{ x: world.w / 2, y: world.h / 2 }];
  const minX = Math.min(...list.map((p) => p.x));
  const maxX = Math.max(...list.map((p) => p.x));
  const minY = Math.min(...list.map((p) => p.y));
  const maxY = Math.max(...list.map((p) => p.y));
  // Keep every subject (feet + ~28px of cat above them) inside with a margin.
  let w = Math.max(cfg.w, maxX - minX + 64);
  let h = Math.max(cfg.h, maxY - minY + 72);
  // keep the aspect ratio of the framing
  const aspect = cfg.w / cfg.h;
  if (w / h > aspect) h = Math.round(w / aspect); else w = Math.round(h * aspect);
  const zoom = Math.max(1, Math.min(cfg.zoom, Math.floor(MAX_CAPTURE_W / w))); // never wider than 1280 output px
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2 - cfg.lift;
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h), zoom };
}


export interface PanelRect { left: number; top: number; width: number; height: number }

/**
 * Camera bias (fractions of the viewport, + = right/down) that centres the subject in the free
 * area next to a side panel, or above a bottom sheet.
 */
export function biasForPanel(panel: PanelRect, vw: number, vh: number): { x: number; y: number } {
  const docked = panel.height > vh * 0.7 && panel.width < vw * 0.6;
  if (docked) return { x: panel.left > vw / 2 ? -(panel.width / 2) / vw : (panel.width / 2) / vw, y: 0 };
  return { x: 0, y: -(panel.height / 2) / vh };
}

/** Where the subject appears on screen for a given bias (used to verify it's not under the panel). */
export function subjectOnScreen(bias: { x: number; y: number }, vw: number, vh: number): { x: number; y: number } {
  return { x: vw * (0.5 + bias.x), y: vh * (0.5 + bias.y) };
}
