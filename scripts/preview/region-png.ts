/** Renders a region (ground + y-sorted prop sprites) with the software rasterizer to JSON pixels for a PNG preview. */
import { regionDef } from '../../src/pawville/adventure/regions.ts';
import { renderRegionGround, buildRegionSprites, regionSpriteKey } from '../../src/pawville/render/regionArt.ts';
import { rasterFactory } from './raster.ts';
const id = process.argv[2] as never; const [x0, y0, w, h] = (process.argv[3] ?? '0,0,1024,768').split(',').map(Number);
const { factory } = rasterFactory();
const def = regionDef(id);
const ground = renderRegionGround(factory as never, def) as never as { __r: { px: Map<string, string> } };
const sprites = buildRegionSprites(factory as never);
const out = new Map<string, string>();
for (const [k, v] of ground.__r.px) out.set(k, v);
for (const p of [...def.props].filter((p) => !p.when).sort((a, b) => a.y - b.y)) {
  const s = sprites[regionSpriteKey(p.kind, p.variant ?? 0)] as never as { canvas: { __r: { px: Map<string, string> } }; ox: number; oy: number } | undefined;
  if (!s) continue;
  for (const [k, v] of s.canvas.__r.px) { const [a, b] = k.split(',').map(Number); out.set(`${a + p.x + s.ox},${b + p.y + s.oy}`, v); }
}
const px: [number, number, string][] = [];
for (const [k, v] of out) { const [a, b] = k.split(',').map(Number); if (a >= x0 && b >= y0 && a < x0 + w && b < y0 + h) px.push([a - x0, b - y0, v]); }
console.log(JSON.stringify({ w, h, px }));
