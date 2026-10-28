/**
 * Milestone 8.1 — the telescope (pure model; no DOM).
 * A telescope site has a sky (azimuth 0–360°, altitude 0–80°) and a horizon with real Pawville/Whiskerwick
 * landmarks. What you can see follows the game's actual environment (darkness, weather), the real moon phase,
 * and quest flags. Pointing the reticle at something long enough (at enough zoom) discovers it.
 */
export type ScopeSite = 'town' | 'city' | 'rooftops';
export type SkyKind = 'moon' | 'star' | 'constellation' | 'planet' | 'deep' | 'event' | 'landmark';

export interface SkyContext {
  site: ScopeSite;
  darkness: number; // 0 day … 1 night (Environment.darkness)
  clear: boolean; // weather lets you see the sky
  moonPhase: number; // 0 new … 0.5 full … 1 new
  flags: ReadonlySet<string>;
  /** Seconds (drives the shooting star schedule). */
  time: number;
}

export interface SkyObject {
  id: string;
  title: string;
  kind: SkyKind;
  az: number;
  alt: number;
  /** Angular radius for drawing/aiming (degrees). */
  size: number;
  /** Magnification needed to make it out. */
  minZoom: number;
  sites: readonly ScopeSite[] | 'all';
  visible(c: SkyContext): boolean;
  text(c: SkyContext): string;
  /** Constellation star pattern, offsets in degrees from (az, alt). */
  stars?: readonly (readonly [number, number])[];
  lines?: readonly (readonly [number, number])[];
}

const night = (c: SkyContext) => c.darkness > 0.5 && c.clear;
const dusk = (c: SkyContext) => c.darkness > 0.3 && c.clear;

export function moonPhaseAt(ms: number): number {
  const synodic = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14); // a known new moon
  const days = (ms - ref) / 86_400_000;
  return (((days / synodic) % 1) + 1) % 1;
}
export function moonName(p: number): string {
  if (p < 0.03 || p > 0.97) return 'new moon';
  if (p < 0.22) return 'waxing crescent';
  if (p < 0.28) return 'first quarter';
  if (p < 0.47) return 'waxing gibbous';
  if (p < 0.53) return 'full moon';
  if (p < 0.72) return 'waning gibbous';
  if (p < 0.78) return 'last quarter';
  return 'waning crescent';
}

/** Shooting stars: a deterministic schedule — one every ~18 s at night, each lasting 1.4 s. */
export const SHOOT_EVERY = 18;
export function shootingStar(c: SkyContext): { az: number; alt: number; k: number } | null {
  if (!night(c)) return null;
  const n = Math.floor(c.time / SHOOT_EVERY);
  const k = (c.time - n * SHOOT_EVERY) / 1.4;
  if (k < 0 || k > 1) return null;
  const h = (Math.sin(n * 91.7) * 43758.5453) % 1;
  const r = Math.abs(h);
  return { az: (r * 360 + 40) % 360, alt: 30 + r * 35, k };
}

export const SKY: readonly SkyObject[] = [
  { id: 'moon', title: 'The Moon', kind: 'moon', az: 150, alt: 34, size: 3.2, minZoom: 1, sites: 'all',
    visible: (c) => dusk(c) && c.moonPhase > 0.03 && c.moonPhase < 0.97,
    text: (c) => `Tonight it’s a ${moonName(c.moonPhase)}. Craters like paw prints dot its face.` },
  { id: 'north-paw', title: 'The North Paw', kind: 'star', az: 0, alt: 58, size: 0.8, minZoom: 1, sites: 'all',
    visible: night, text: () => 'The one star that never moves. Sailors in Pawport steer by it.' },
  { id: 'mouse-dipper', title: 'The Mouse Dipper', kind: 'constellation', az: 28, alt: 46, size: 9, minZoom: 1, sites: 'all',
    stars: [[-8, 2], [-4, 4], [0, 3], [3, 0], [7, -1], [8, -5], [4, -6]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
    visible: night, text: () => 'Seven stars in the shape of a mouse with a long tail. Every kitten’s first constellation.' },
  { id: 'great-yarnball', title: 'The Great Yarnball', kind: 'constellation', az: 262, alt: 40, size: 8, minZoom: 1, sites: 'all',
    stars: [[0, 6], [5, 3], [5, -3], [0, -6], [-5, -3], [-5, 3], [9, -8]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [2, 6]],
    visible: night, text: () => 'A round ring of stars with one loose thread trailing away to the south-west.' },
  { id: 'lumi-stars', title: 'Lumi’s constellation', kind: 'constellation', az: 104, alt: 50, size: 7, minZoom: 1, sites: 'all',
    stars: [[-5, 2], [-2, 5], [2, 4], [4, 0], [7, -4]], lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
    visible: (c) => night(c) && (c.flags.has('constellation-lumi') || c.flags.has('lumi-home') || c.flags.has('our-constellation')),
    text: () => 'Five stars and a starry tail — Lumi is home, and from down here she seems to wave.' },
  { id: 'ember', title: 'Ember, the red wanderer', kind: 'planet', az: 72, alt: 24, size: 0.9, minZoom: 2, sites: 'all',
    visible: night, text: () => 'Not a star at all: a small rusty planet. At ×2 you can see it’s a disc, not a point.' },
  { id: 'whisker-comet', title: 'The Whisker Comet', kind: 'deep', az: 212, alt: 56, size: 1.2, minZoom: 3, sites: 'all',
    visible: night, text: () => 'A faint smudge with a long, thin tail — invisible to the naked eye. Only at ×3 or more.' },
  { id: 'catseye-nebula', title: 'The Cat’s Eye Nebula', kind: 'deep', az: 312, alt: 66, size: 1, minZoom: 4, sites: 'all',
    visible: night, text: () => 'At full magnification, a glowing green ring with a dark slit. It really does look like an eye.' },
  { id: 'shooting-star', title: 'A shooting star', kind: 'event', az: 0, alt: 0, size: 3, minZoom: 1, sites: 'all',
    visible: night, text: () => 'A streak of light — gone in a blink. Did you make a wish?' },
  { id: 'isles-glimmer', title: 'The Dreaming Isles', kind: 'landmark', az: 330, alt: 14, size: 3, minZoom: 2, sites: ['city', 'rooftops'],
    visible: (c) => night(c) && c.flags.has('region:isles'), text: () => 'Far above the sea, tiny islands glitter like a necklace of stars.' },
  { id: 'pawport-light', title: 'Pawport lighthouse', kind: 'landmark', az: 205, alt: 2.5, size: 2, minZoom: 2, sites: ['city', 'town'],
    visible: () => true,
    text: (c) => (c.flags.has('lighthouse-lit') ? 'Across the bay the great lens turns — its beam sweeps the water every few seconds.' : 'A dark lighthouse on the far shore. Somebody should light it again…') },
  { id: 'clock-tower', title: 'The Old Town clock', kind: 'landmark', az: 120, alt: 5, size: 2.5, minZoom: 2, sites: ['rooftops'],
    visible: () => true,
    text: (c) => (c.flags.has('clock-fixed') ? 'The clock face reads the real time again. Somebody fixed it!' : 'Zoomed in, the hands are frozen at eleven. Why?') },
  { id: 'ferris-wheel', title: 'The boardwalk Ferris wheel', kind: 'landmark', az: 250, alt: 4, size: 3, minZoom: 1, sites: ['rooftops'],
    visible: () => true, text: () => 'Little lit cabins turn slowly above the boardwalk.' },
  { id: 'city-skyline', title: 'Whiskerwick skyline', kind: 'landmark', az: 40, alt: 3, size: 4, minZoom: 1, sites: ['town'],
    visible: () => true, text: () => 'Far beyond the hills: towers, a clock and a Ferris wheel. The big city is a train ride away.' },
];

export const SKY_IDS = SKY.map((o) => o.id);
export const skyObject = (id: string) => SKY.find((o) => o.id === id);
export const atSite = (c: SkyContext) => SKY.filter((o) => o.sites === 'all' || o.sites.includes(c.site));

// ---- aiming ------------------------------------------------------------------------------------
export interface ScopeView { az: number; alt: number; zoom: number }
export const ZOOM_MIN = 1, ZOOM_MAX = 4, ALT_MIN = 0, ALT_MAX = 80;
export const FOV_AT_1X = 60; // degrees across at ×1

export const wrapAz = (a: number) => ((a % 360) + 360) % 360;
/** Signed smallest difference a − b in degrees (−180…180]. */
export const dAz = (a: number, b: number) => { const d = wrapAz(a - b); return d > 180 ? d - 360 : d; };
export const fov = (zoom: number) => FOV_AT_1X / zoom;

export function aim(v: ScopeView, dAzDeg: number, dAltDeg: number): ScopeView {
  return { ...v, az: wrapAz(v.az + dAzDeg), alt: Math.max(ALT_MIN, Math.min(ALT_MAX, v.alt + dAltDeg)) };
}
export function zoomTo(v: ScopeView, z: number): ScopeView {
  return { ...v, zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 2) / 2)) };
}
/** Angular distance from the view centre (flat approximation, fine at these altitudes). */
export function offCentre(v: ScopeView, az: number, alt: number): number {
  return Math.hypot(dAz(az, v.az) * Math.cos((alt * Math.PI) / 180), alt - v.alt);
}
/** Reticle radius in degrees (14% of the field of view). */
export const reticle = (zoom: number) => fov(zoom) * 0.14;

/** Where an object actually is right now (the shooting star moves; others are fixed). */
export function objectPos(o: SkyObject, c: SkyContext): { az: number; alt: number } | null {
  if (o.id !== 'shooting-star') return { az: o.az, alt: o.alt };
  const s = shootingStar(c);
  return s ? { az: wrapAz(s.az + s.k * 14), alt: s.alt - s.k * 7 } : null;
}

/** Objects that can be discovered at this exact view (visible, magnified enough, inside the reticle). */
export function inSight(v: ScopeView, c: SkyContext): SkyObject[] {
  const out: SkyObject[] = [];
  for (const o of atSite(c)) {
    if (!o.visible(c) || v.zoom < o.minZoom) continue;
    const p = objectPos(o, c);
    if (!p) continue;
    // a shooting star only needs to cross the field of view; everything else must be in the reticle
    const lim = o.id === 'shooting-star' ? fov(v.zoom) / 2 : reticle(v.zoom) + o.size;
    if (offCentre(v, p.az, p.alt) <= lim) out.push(o);
  }
  return out;
}

/** Dwell tracker: an object must stay in sight for `ms` before it counts (no accidental flick discoveries). */
export function createDwell(ms = 600) {
  const since = new Map<string, number>();
  return (now: number, ids: readonly string[]): string[] => {
    for (const k of [...since.keys()]) if (!ids.includes(k)) since.delete(k);
    const done: string[] = [];
    for (const id of ids) {
      const t = since.get(id);
      if (t === undefined) since.set(id, now);
      else if (now - t >= (id === 'shooting-star' ? 250 : ms)) done.push(id);
    }
    return done;
  };
}

export const SITE_START: Record<ScopeSite, ScopeView> = {
  town: { az: 30, alt: 12, zoom: 1 },
  city: { az: 200, alt: 10, zoom: 1 },
  rooftops: { az: 120, alt: 12, zoom: 1 },
};
export const SITE_NAME: Record<ScopeSite, string> = { town: 'Paw Park telescope', city: 'Boardwalk telescope', rooftops: 'Rooftop telescope' };
/** Journal id of a sky discovery. */
export const skyJournalId = (id: string) => `sky-${id}`;
