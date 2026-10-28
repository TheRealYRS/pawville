/**
 * Wire format + client-side handling for town presence. Everything received from the network is
 * untrusted: validated, clamped and sanitised before it reaches the renderer.
 * Client-side validation is NOT a security boundary; it only protects rendering.
 */
import type { Accessory } from '../../game/types';
import { ALL_COATS, EXTRAS, type CoatId, type ExtraId } from '../appearance.ts';
import { emoteDef, resolveEmote } from '../couple/emotes.ts';
import type { CatPose } from '../render/catSprites.ts';
import { clamp, distance, type Vec2 } from '../world/geometry.ts';
import { REGION_IDS, type RegionId } from '../adventure/state.ts';
import type { Facing } from '../world/movement.ts';
import { claimSig, sanitizeClaim, type SeatClaim } from './occupancy.ts';

export const PRESENCE_TOPIC = 'pawville:plaza';
export const MOVE_EVENT = 'move';
/**
 * v3 (Milestone 4): adds the named characters (puchu, chutki, mini, magic) as appearance ids,
 * `emoteAge` + `emoteSeq` (so every client plays the same emote from the same start and a
 * reconnect never replays an old one), `run`, and new emote ids. v2 payloads are still accepted
 * (missing fields get safe defaults); payloads from a NEWER major version are rejected rather than
 * misread. Old v2 clients receiving v3 data fall back to their default coat for unknown ids.
 */
/**
 * v4 (Milestone 6): adds `region` (which place the cat is in — town, harbor, forest, cave,
 * highlands, isles) and Racon + the signature emotes. v2/v3 payloads are still accepted and mean
 * "in the town". Clients render only cats in their own region.
 */
/**
 * Additive field (no version bump, so older clients keep working — they build a fresh object and ignore it): `claim`, the seat a
 * cat holds (bench / ride seat). See net/occupancy.ts.
 */
export const PROTOCOL_VERSION = 4;
export const MIN_PROTOCOL_VERSION = 2;

export const ALLOWED_ACCESSORIES: readonly Accessory[] = ['none', 'crown', 'bow', 'wizard', 'bell'];
const FACINGS: readonly Facing[] = ['down', 'up', 'left', 'right'];
const POSES: readonly CatPose[] = ['stand', 'sit', 'loaf'];
export const EMOTE_IDS = [
  'wave', 'heart', 'dance', 'celebrate', 'sleepy', 'sorry', 'grumble', 'high-five', 'paw-bump', 'nose-boop', 'hug',
  // Milestone 4
  'purr', 'surprised', 'bounce', 'sit-together', 'mini-starpaw-serenade',
  // Milestone 6 signature emotes
  'magic-long-stretch', 'chutki-belly-nap', 'puchu-loud-purr', 'tangerine-curious-tilt', 'midnight-pounce', 'racon-fence-dance',
] as const;
export type EmoteId = (typeof EMOTE_IDS)[number];
const NAME_MAX = 16;

export interface PlayerSnapshot {
  v: number;
  id: string;
  name: string;
  cat: 'T' | 'M';
  coat: CoatId;
  accessory: Accessory;
  extra: ExtraId;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  pose: CatPose;
  lift: number;
  emote: EmoteId | null;
  /** v3: how long the current emote has been playing on the sender (ms). */
  emoteAge: number;
  /** v3: increases every time the sender starts a new emote (detects restarts of the same emote). */
  emoteSeq: number;
  /** v3: running (faster animation). */
  run: boolean;
  /** Pair this cat belongs to (public pair id only — never membership proof). */
  pair: string | null;
  /** v4: the region this cat is in (always set by sanitizeSnapshot; optional for older callers). */
  region?: RegionId;
  /** The seat this cat holds, if any (additive; null/absent = standing). */
  claim?: SeatClaim | null;
}

export interface WorldSize {
  w: number;
  h: number;
}

export function cleanName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const v = raw.replace(/[^\p{L}\p{N} _.!?'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return v.length > 0 ? v : fallback;
}

export function sanitizeSnapshot(raw: unknown, world: WorldSize): PlayerSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{6,40}$/.test(r.id)) return null;
  if (typeof r.x !== 'number' || typeof r.y !== 'number' || !Number.isFinite(r.x) || !Number.isFinite(r.y)) return null;
  // Explicit version handling: v2 and v3 are understood; an unknown NEWER version is not guessed at.
  const v = typeof r.v === 'number' && Number.isFinite(r.v) ? Math.floor(r.v) : MIN_PROTOCOL_VERSION;
  if (v > PROTOCOL_VERSION || v < MIN_PROTOCOL_VERSION) return null;
  const cat = r.cat === 'M' ? 'M' : 'T';
  const coat: CoatId = ALL_COATS.includes(r.coat as CoatId) ? (r.coat as CoatId) : cat === 'M' ? 'midnight' : 'tangerine';
  let emote: EmoteId | null = EMOTE_IDS.includes(r.emote as EmoteId) ? (r.emote as EmoteId) : null;
  // Exclusive emotes are checked against the canonical appearance id, never the nickname.
  if (emote) emote = resolveEmote(emote, coat);
  const def = emote ? emoteDef(emote) : undefined;
  const emoteAge = v >= 3 && typeof r.emoteAge === 'number' && Number.isFinite(r.emoteAge) ? clamp(Math.round(r.emoteAge), 0, 60_000) : 0;
  if (def && v >= 3 && emoteAge >= def.ms) emote = null; // already finished on the sender — never replay
  return {
    v: PROTOCOL_VERSION,
    id: r.id,
    name: cleanName(r.name, cat === 'M' ? 'Midnight' : 'Tangerine'),
    cat,
    coat,
    accessory: ALLOWED_ACCESSORIES.includes(r.accessory as Accessory) ? (r.accessory as Accessory) : 'none',
    extra: EXTRAS.includes(r.extra as ExtraId) ? (r.extra as ExtraId) : 'none',
    x: clamp(r.x, 0, world.w),
    y: clamp(r.y, 0, world.h),
    facing: FACINGS.includes(r.facing as Facing) ? (r.facing as Facing) : 'down',
    moving: r.moving === true,
    pose: POSES.includes(r.pose as CatPose) ? (r.pose as CatPose) : 'stand',
    // up to 40: the Cloud Swing lifts its riders 31 px (+ the hop arc). A clamp of 16 sank remote riders into their chairs.
    lift: typeof r.lift === 'number' && Number.isFinite(r.lift) ? clamp(r.lift, 0, 40) : 0,
    emote,
    emoteAge: emote ? emoteAge : 0,
    emoteSeq: typeof r.emoteSeq === 'number' && Number.isFinite(r.emoteSeq) ? clamp(Math.floor(r.emoteSeq), 0, 2 ** 31) : 0,
    run: r.run === true,
    pair: typeof r.pair === 'string' && /^[A-Za-z0-9-]{8,40}$/.test(r.pair) ? r.pair : null,
    region: v >= 4 && REGION_IDS.includes(r.region as RegionId) ? (r.region as RegionId) : 'town',
    claim: sanitizeClaim(r.claim),
  };
}

export function compactSnapshot(s: PlayerSnapshot): PlayerSnapshot {
  return { ...s, x: Math.round(s.x), y: Math.round(s.y), lift: Math.round(s.lift) };
}

/** Broadcast at most every `minIntervalMs`, only on change, plus a slow heartbeat. */
export function createSendGate(minIntervalMs = 100, heartbeatMs = 4000) {
  let lastAt = -Infinity;
  let last: PlayerSnapshot | null = null;
  return (now: number, s: PlayerSnapshot): boolean => {
    if (now - lastAt < minIntervalMs) return false;
    const changed =
      !last || Math.abs(last.x - s.x) >= 1 || Math.abs(last.y - s.y) >= 1 || last.facing !== s.facing || last.moving !== s.moving ||
      last.coat !== s.coat || last.accessory !== s.accessory || last.extra !== s.extra || last.name !== s.name ||
      last.pose !== s.pose || Math.abs(last.lift - s.lift) >= 1 || last.emote !== s.emote || last.emoteSeq !== s.emoteSeq || last.run !== s.run || last.region !== s.region || claimSig(last.claim) !== claimSig(s.claim);
    if (!changed && now - lastAt < heartbeatMs) return false;
    lastAt = now;
    last = s;
    return true;
  };
}

/**
 * Milestone 8.1: Presence call budget. Supabase Realtime allows each client only 5 Presence calls (track/untrack)
 * per 30 s; exceeding it closes the channel (ClientPresenceRateLimitReached) and the game showed "Reconnecting".
 * The old gate allowed a track() every 1.5 s whenever the cat stopped. This budget allows at most `max` calls in
 * any rolling window and coalesces: a denied update is remembered and goes out as soon as budget frees up,
 * so the latest resting state is always delivered eventually. Positions themselves travel by Broadcast.
 */
export function createTrackBudget(max = 4, windowMs = 30_000, minIntervalMs = 3_000) {
  const sent: number[] = [];
  let pending = false;
  let lastKey = '';
  const keyOf = (s: PlayerSnapshot) => `${s.x}|${s.y}|${s.facing}|${s.pose}|${s.lift}|${s.coat}|${s.accessory}|${s.extra}|${s.name}|${s.region}|${s.pair}|${claimSig(s.claim)}`;
  const free = (now: number) => { while (sent.length && now - sent[0] >= windowMs) sent.shift(); return sent.length < max && (!sent.length || now - sent[sent.length - 1] >= minIntervalMs); };
  return {
    /** Should this resting snapshot be tracked now? (call every frame; cheap) */
    want(now: number, s: PlayerSnapshot): boolean {
      const k = keyOf(s);
      if (k !== lastKey) pending = true;
      if (!pending || !free(now)) return false;
      pending = false; lastKey = k; sent.push(now);
      return true;
    },
    /** A forced call (re-announce after re-subscribe) still counts against the budget. */
    force(now: number, s: PlayerSnapshot): void { free(now); sent.push(now); lastKey = keyOf(s); pending = false; },
    used(now: number): number { free(now); return sent.length; },
  };
}

export interface RemoteCat {
  id: string;
  name: string;
  cat: 'T' | 'M';
  coat: CoatId;
  accessory: Accessory;
  extra: ExtraId;
  pos: Vec2;
  target: Vec2;
  facing: Facing;
  moving: boolean;
  pose: CatPose;
  lift: number;
  emote: EmoteId | null;
  /** Local clock time the current emote started (derived from emoteAge on receipt). */
  emoteStart: number;
  emoteSeq: number;
  run: boolean;
  pair: string | null;
  /** v4: region (missing = town). */
  region?: RegionId;
  /** The seat this cat holds (bench / ride seat), as last reported. */
  claim?: SeatClaim | null;
  /** The player's real id. (The pair partner is stored under the key 'partner', so `id` alone can't identify them.) */
  uid?: string;
  lastUpdate: number;
  /** Last time we accepted a NEW emote start from this cat (receive-side spam guard). */
  lastEmoteAccept: number;
}

/** A remote cat may start a new emote at most this often (ms); faster restarts are ignored. */
export const REMOTE_EMOTE_MIN_GAP = 400;

/** Apply the emote part of a snapshot (shared by town presence and the pair connection). */
export function applyEmote(r: RemoteCat, s: Pick<PlayerSnapshot, 'emote' | 'emoteAge' | 'emoteSeq'>, now: number): void {
  if (!s.emote) {
    r.emote = null;
    return;
  }
  const isNew = s.emote !== r.emote || s.emoteSeq !== r.emoteSeq;
  if (!isNew) return;
  if (now - r.lastEmoteAccept < REMOTE_EMOTE_MIN_GAP) return; // spam guard: keep playing the current one
  r.emote = s.emote;
  r.emoteSeq = s.emoteSeq;
  r.emoteStart = now - s.emoteAge;
  r.lastEmoteAccept = now;
}

/** The emote a remote cat is playing right now (null once it has finished). */
export function remoteEmoteNow(r: Pick<RemoteCat, 'emote' | 'emoteStart'>, now: number): { id: EmoteId; t: number } | null {
  if (!r.emote) return null;
  const d = emoteDef(r.emote);
  const t = now - r.emoteStart;
  return d && t >= 0 && t < d.ms ? { id: r.emote, t } : null;
}

const SNAP_DISTANCE = 96;

export function applySnapshot(remotes: Map<string, RemoteCat>, s: PlayerSnapshot, now: number): void {
  const existing = remotes.get(s.id);
  if (!existing) {
    const r: RemoteCat = {
      id: s.id, name: s.name, cat: s.cat, coat: s.coat, accessory: s.accessory, extra: s.extra,
      pos: { x: s.x, y: s.y }, target: { x: s.x, y: s.y }, facing: s.facing, moving: s.moving, pose: s.pose, lift: s.lift,
      emote: null, emoteStart: 0, emoteSeq: -1, run: s.run, pair: s.pair, region: s.region, claim: s.claim ?? null, uid: s.id, lastUpdate: now, lastEmoteAccept: -Infinity,
    };
    applyEmote(r, s, now);
    remotes.set(s.id, r);
    return;
  }
  Object.assign(existing, {
    name: s.name, cat: s.cat, coat: s.coat, accessory: s.accessory, extra: s.extra, target: { x: s.x, y: s.y },
    facing: s.facing, moving: s.moving, pose: s.pose, lift: s.lift, run: s.run, pair: s.pair, claim: s.claim ?? null, lastUpdate: now,
  });
  if (existing.region !== s.region) {
    // changed place: jump, never glide across two unrelated maps
    existing.region = s.region;
    existing.pos = { ...existing.target };
  }
  applyEmote(existing, s, now);
  if (distance(existing.pos, existing.target) > SNAP_DISTANCE) existing.pos = { ...existing.target };
}

export function interpolateRemotes(remotes: Map<string, RemoteCat>, dtSeconds: number, now: number): void {
  const k = 1 - Math.exp(-Math.max(0, dtSeconds) * 12);
  for (const r of remotes.values()) {
    r.pos.x += (r.target.x - r.pos.x) * k;
    r.pos.y += (r.target.y - r.pos.y) * k;
    if (now - r.lastUpdate > 600 && distance(r.pos, r.target) < 0.5) r.moving = false;
  }
}

/** Remove cats we haven't heard from for a while (missed "leave" events). */
export function pruneStale(remotes: Map<string, RemoteCat>, now: number, maxSilenceMs = 20_000): string[] {
  const gone: string[] = [];
  for (const [id, r] of remotes) if (now - r.lastUpdate > maxSilenceMs) { remotes.delete(id); gone.push(id); }
  return gone;
}

export function snapshotsFromPresence(state: Record<string, unknown>, selfId: string, world: WorldSize): PlayerSnapshot[] {
  const out: PlayerSnapshot[] = [];
  for (const [key, metas] of Object.entries(state)) {
    if (key === selfId || !Array.isArray(metas) || metas.length === 0) continue;
    const s = sanitizeSnapshot(metas[metas.length - 1], world);
    // Presence metadata is a slow, possibly old snapshot: never start an emote from it (a
    // reconnecting client would otherwise replay stale emotes). Live emotes arrive via broadcasts.
    if (s && s.id === key) out.push({ ...s, emote: null, emoteAge: 0 });
  }
  return out;
}
