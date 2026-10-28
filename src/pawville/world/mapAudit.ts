/**
 * Milestone 8.1 map audit. Pure checks over a RegionDef (ground tiles + props + spots) that catch the kinds of
 * layout bugs found in Milestone 8: roads running behind/under buildings, paths painted over water with no bridge,
 * buildings/props standing on roads or over the void, and spots that can't be walked to.
 * The visual footprint of each prop comes from its real sprite (passed in), so the audit matches what is drawn.
 */
import { RG, RTILE, SOLID_GROUND, groundAtR, reachableTiles, regionPropCollider, type RegionDef, type RegionProp } from '../adventure/regionKit.ts';
import type { Rect } from './geometry.ts';

export interface AuditIssue { region: string; rule: string; detail: string; at: { x: number; y: number } }
export type VisualRect = (p: RegionProp) => Rect | null;

export const ROAD: ReadonlySet<number> = new Set<number>([RG.Path, RG.Cobble, RG.Paving]);
/** Streets (not plazas/platforms): a prop with a collider must not stand in one. */
export const STREET: ReadonlySet<number> = new Set<number>([RG.Path, RG.Cobble]);
const WATERISH: ReadonlySet<number> = new Set<number>([RG.Water, RG.Deep, RG.Shallows]);
/** Props that are buildings: the ground under their body must not be road. */
export const BUILDING_KINDS: ReadonlySet<string> = new Set([
  'house', 'shop', 'cafe', 'arcadebldg', 'citystation', 'cinema', 'apartment', 'townhouse', 'oldshop', 'lighthouse',
  'observatory', 'cabin', 'station', 'conservatory', 'library', 'bookshop',
]);
/** Props that may stand on a road / plaza surface. */
const ROAD_OK = new Set(['lamp', 'lantern', 'signpost', 'bench', 'parkbench', 'flag', 'planter', 'cityfountain', 'icecart', 'marketstall', 'cafetable', 'noticeboard', 'telescope', 'ticketmachine', 'stall', 'busstop', 'mailbox', 'barrel', 'crate',
  // plaza furniture & landmarks that are meant to stand on paving
  'flowerbed', 'statue', 'well', 'oldlamp', 'clocktower', 'campfire', 'laundry',
  // the temple's furniture (The Song Beneath the Stars)
  'templepillar', 'hearthsong', 'templelamp', 'templebowl', 'trailstone']);
const FLOATS_OK = new Set(['boat', 'duck', 'gull', 'lilypad', 'buoy', 'reeds', 'wreck', 'starbridge', 'cloud', 'waterfall', 'starfall']);

const tileOf = (x: number, y: number) => ({ c: Math.floor(x / RTILE), r: Math.floor(y / RTILE) });
const inRect = (x: number, y: number, r: Rect) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export function auditRegion(def: RegionDef, visual: VisualRect): AuditIssue[] {
  const out: AuditIssue[] = [];
  const add = (rule: string, detail: string, x: number, y: number) => out.push({ region: def.id, rule, detail, at: { x, y } });
  const g = (c: number, r: number) => groundAtR(def, c, r);
  const props = def.props.filter((p) => !p.when);

  // 1. road behind / under a building: road tile centres inside the building's drawn body (not the doorstep row)
  for (const p of props) {
    if (!BUILDING_KINDS.has(p.kind)) continue;
    const v = visual(p); if (!v) continue;
    let n = 0;
    for (let r = Math.floor(v.y / RTILE); r <= Math.floor((v.y + v.h - 10) / RTILE); r++)
      for (let c = Math.floor(v.x / RTILE); c <= Math.floor((v.x + v.w - 1) / RTILE); c++) {
        const cx = c * RTILE + 8, cy = r * RTILE + 8;
        if (cy > p.y - 8 || !inRect(cx, cy, v)) continue;
        if (ROAD.has(g(c, r))) n++;
      }
    if (n) add('road-under-building', `${p.kind}@${p.x},${p.y}: ${n} road tile(s) run behind/under it`, p.x, p.y);
  }
  // 2. props standing on roads (their collider blocks the road) and props over the void / open water
  for (const p of props) {
    const col = regionPropCollider(p);
    const { c, r } = tileOf(p.x, p.y - 1);
    const t = g(c, r);
    if (t === RG.Void && !FLOATS_OK.has(p.kind)) add('prop-over-void', `${p.kind}@${p.x},${p.y} stands on nothing`, p.x, p.y);
    else if (WATERISH.has(t) && !FLOATS_OK.has(p.kind)) add('prop-in-water', `${p.kind}@${p.x},${p.y} stands in water`, p.x, p.y);
    if (!col || ROAD_OK.has(p.kind) || p.kind.startsWith('decor:')) continue;
    let onRoad = 0, cells = 0;
    for (let y = col.y + 1; y < col.y + col.h; y += 4) for (let x = col.x + 1; x < col.x + col.w; x += 4) { cells++; const q = tileOf(x, y); if (STREET.has(g(q.c, q.r))) onRoad++; }
    if (cells && onRoad / cells > 0.5) add('prop-on-road', `${p.kind}@${p.x},${p.y} blocks a road`, p.x, p.y);
  }
  // 3. a road/path run that starts and ends in water = a path painted over water (it must be a bridge)
  const runEnd = (c: number, r: number, dc: number, dr: number) => { let k = 1; while (ROAD.has(g(c + dc * k, r + dr * k))) k++; return g(c + dc * k, r + dr * k); };
  for (let r = 0; r < def.rows; r++) for (let c = 0; c < def.cols; c++) {
    const t = g(c, r);
    if (!ROAD.has(t)) continue;
    const ns = WATERISH.has(runEnd(c, r, 0, -1)) && WATERISH.has(runEnd(c, r, 0, 1));
    const ew = WATERISH.has(runEnd(c, r, -1, 0)) && WATERISH.has(runEnd(c, r, 1, 0));
    const wetSides = [g(c - 1, r), g(c + 1, r), g(c, r - 1), g(c, r + 1)].filter((x) => WATERISH.has(x)).length;
    if ((ns || ew) && wetSides >= 1) add('path-over-water', `tile ${c},${r} is ${t === RG.Path ? 'dirt' : 'paving'} across water — should be a bridge`, c * RTILE + 8, r * RTILE + 8);
  }
  // 4. every always-visible spot is reachable on foot from the spawn (props count as solid)
  const solids = props.map(regionPropCollider).filter((x): x is Rect => !!x);
  const reach = reachableTiles(def, def.spawn, solids);
  const reachNoProps = reachableTiles(def, def.spawn);
  for (const s of def.spots) {
    if (s.when) continue;
    const near: number[] = [];
    for (let dy = -s.radius; dy <= s.radius; dy += 4) for (let dx = -s.radius; dx <= s.radius; dx += 4) {
      if (dx * dx + dy * dy > s.radius * s.radius) continue;
      const { c, r } = tileOf(s.point.x + dx, s.point.y + dy);
      if (c >= 0 && r >= 0 && c < def.cols && r < def.rows) near.push(r * def.cols + c);
    }
    if (!near.some((k) => reach.has(k))) add(near.some((k) => reachNoProps.has(k)) ? 'spot-blocked-by-prop' : 'spot-unreachable', `${s.id} (${s.label})`, s.point.x, s.point.y);
  }
  // 5. spawn on solid ground
  { const { c, r } = tileOf(def.spawn.x, def.spawn.y); if (SOLID_GROUND.has(g(c, r))) add('spawn-solid', 'spawn point is inside solid ground', def.spawn.x, def.spawn.y); }
  return out;
}
