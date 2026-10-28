/** Milestone 8.1: `node --experimental-strip-types scripts/map-audit.ts` — prints every map-audit issue for every region. */
import { EXPLORE_REGIONS, regionDef } from '../src/pawville/adventure/regions.ts';
import { auditRegion } from '../src/pawville/world/mapAudit.ts';
import { buildRegionSprites, regionSpriteKey } from '../src/pawville/render/regionArt.ts';
import { rasterFactory } from './preview/raster.ts';

const { factory } = rasterFactory();
const sprites = buildRegionSprites(factory as never);
let total = 0;
for (const id of EXPLORE_REGIONS) {
  const def = regionDef(id);
  const issues = auditRegion(def, (p) => {
    const s = sprites[regionSpriteKey(p.kind, p.variant ?? 0)] as { canvas: { width: number; height: number }; ox: number; oy: number } | undefined;
    return s ? { x: p.x + s.ox, y: p.y + s.oy, w: s.canvas.width, h: s.canvas.height } : null;
  });
  total += issues.length;
  for (const i of issues) console.log(`${i.region.padEnd(12)} ${i.rule.padEnd(22)} ${i.detail}`);
}
console.log(`\n${total} issue(s)`);
process.exitCode = total ? 1 : 0;
