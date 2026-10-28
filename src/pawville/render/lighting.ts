/**
 * Milestone 8.1 lighting model (shared by the town and every region).
 * Before: night multiplied the frame by near-black #1b1840 at up to 85% and lamps added 38px additive halos,
 * so roads, dark cats and props vanished while lamps washed out their surroundings.
 * Now: a lighter plum grade capped at 70% (night stays night, detail survives), a mild vignette, and compact
 * lamp light = a small bulb halo + a soft elliptical pool on the ground where the light actually lands.
 */
export const NIGHT_TINT = '#4a3f7a';
export const NIGHT_MAX_ALPHA = 0.7;

export interface LampLight { haloR: number; haloA: number; poolRx: number; poolRy: number; poolA: number }
export function lampLight(night: number, flicker = 0): LampLight {
  const n = Math.max(0, Math.min(1, night));
  return { haloR: 9 + n * 9 + flicker, haloA: 0.16 + n * 0.22, poolRx: 12 + n * 6, poolRy: 4 + n * 2, poolA: n * 0.2 };
}

/** Effective multiply strength for the grade (what drawGrade applies). */
export function nightGradeAlpha(tintAlpha: number): number { return Math.min(NIGHT_MAX_ALPHA, tintAlpha * 1.15); }
export function vignetteAlpha(darkness: number): number { return 0.32 + darkness * 0.1; }

export function drawLamp(ctx: CanvasRenderingContext2D, x: number, footY: number, bulbY: number, rgb: string, l: LampLight) {
  const g = ctx.createRadialGradient(x, bulbY, 1, x, bulbY, l.haloR);
  g.addColorStop(0, `rgba(${rgb}, ${l.haloA.toFixed(3)})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - l.haloR, bulbY - l.haloR, l.haloR * 2, l.haloR * 2);
  if (l.poolA > 0.01) {
    ctx.save();
    ctx.translate(x, footY + 1);
    ctx.scale(1, l.poolRy / l.poolRx);
    const p = ctx.createRadialGradient(0, 0, 1, 0, 0, l.poolRx);
    p.addColorStop(0, `rgba(${rgb}, ${l.poolA.toFixed(3)})`);
    p.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = p;
    ctx.fillRect(-l.poolRx, -l.poolRx, l.poolRx * 2, l.poolRx * 2);
    ctx.restore();
  }
}
