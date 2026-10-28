/** Tiny software rasterizer for canvas fillRect/drawImage — lets tests and previews read real sprite pixels without a browser. */
export interface Raster { width: number; height: number; px: Map<string, string>; canvas: unknown }
export function rasterFactory() {
  const made: Raster[] = [];
  const factory = (width: number, height: number) => {
    const r: Raster = { width, height, px: new Map(), canvas: null };
    let fill = '#000'; let alpha = 1; let tx = 0, ty = 0; const stack: [number, number, string, number][] = [];
    const ctx: Record<string, unknown> = {
      get fillStyle() { return fill; }, set fillStyle(v: string) { fill = String(v); },
      get globalAlpha() { return alpha; }, set globalAlpha(v: number) { alpha = v; },
      imageSmoothingEnabled: false, strokeStyle: '#000', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'top', globalCompositeOperation: 'source-over',
      fillRect(x: number, y: number, w: number, h: number) {
        for (let yy = Math.round(y + ty); yy < Math.round(y + ty + h); yy++) for (let xx = Math.round(x + tx); xx < Math.round(x + tx + w); xx++)
          if (xx >= 0 && yy >= 0 && xx < width && yy < height) { if (fill === 'transparent' || alpha === 0) continue; r.px.set(`${xx},${yy}`, fill); }
      },
      clearRect(x: number, y: number, w: number, h: number) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) r.px.delete(`${xx},${yy}`); },
      drawImage(src: { __r?: Raster }, dx: number, dy: number) { const s = src?.__r; if (!s) return; for (const [k, v] of s.px) { const [a, b] = k.split(',').map(Number); const X = a + Math.round(dx + tx), Y = b + Math.round(dy + ty); if (X >= 0 && Y >= 0 && X < width && Y < height) r.px.set(`${X},${Y}`, v); } },
      save() { stack.push([tx, ty, fill, alpha]); }, restore() { const s = stack.pop(); if (s) [tx, ty, fill, alpha] = s; },
      translate(x: number, y: number) { tx += x; ty += y; }, scale() {}, rotate() {}, setTransform() { tx = 0; ty = 0; },
      beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, fill() {}, stroke() {}, rect() {}, clip() {}, quadraticCurveTo() {},
      fillText() {}, strokeText() {}, measureText: (t: string) => ({ width: t.length * 4 }),
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), putImageData() {},
    };
    const canvas = { width, height, getContext: () => ctx, __r: r };
    r.canvas = canvas; made.push(r);
    return canvas;
  };
  return { factory, made };
}
export const sig = (r: Raster) => [...r.px.entries()].sort().map((e) => e.join('=')).join(';');
