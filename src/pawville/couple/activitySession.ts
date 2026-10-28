/**
 * Shared-activity coordinator (pure). One state machine for every two-player activity:
 * swing, seesaw, picnic, stargazing, fishing, shared emotes, paw-holding, PawType duels and
 * Cat Boxing matches.
 *
 *   idle ──invite──▶ inviting ──partner accepts──▶ lobby ──both ready──▶ starting ──startAt──▶ running ──▶ ended
 *        ◀─────────── cancelled (decline / cancel / partner gone past the grace period) ◀────┘
 *
 * Rules enforced here (tested):
 *   - only the host may start, and only when BOTH players are ready AND the partner is present;
 *   - a session starts once: a second start for the same session id is ignored;
 *   - messages for another session id, or that don't fit the current phase, are ignored —
 *     so a client can't "accept" on someone else's behalf or resurrect an old session;
 *   - if the partner disconnects, the session waits `graceMs` for them to come back, then
 *     cancels cleanly — nobody is left on an endless loading screen.
 *
 * Milestone 5 (multiplayer repair):
 *   - Every message used to be fire-and-forget. If one `act:accept` broadcast was lost (network
 *     blip, channel re-join), the host stayed on "Asked …" forever while the guest sat in the
 *     lobby. Both sides now send an `act:sync` snapshot (every ~2 s while a session is active and
 *     immediately when the partner (re)appears); `reconcile` applies only LEGAL forward
 *     transitions for the SAME session id, so lost/duplicated/out-of-order messages converge.
 *   - A short presence blip used to cancel a pending invitation immediately. Invitations now get
 *     the same grace period as running activities.
 *   - Finished session ids are remembered (`closed`), so a stale invite or sync can never
 *     resurrect an old session.
 */
import type { Role } from './pairModel.ts';

export type ActivityKind = 'swing' | 'seesaw' | 'stargaze' | 'picnic' | 'fishing' | 'bench' | 'emote' | 'pawhold' | 'pawtype' | 'boxing' | 'photo' | 'bumper';
export const ACTIVITY_KINDS: readonly ActivityKind[] = ['swing', 'seesaw', 'stargaze', 'picnic', 'fishing', 'bench', 'emote', 'pawhold', 'pawtype', 'boxing', 'photo', 'bumper'];

export type Phase = 'idle' | 'inviting' | 'invited' | 'lobby' | 'starting' | 'running' | 'ended' | 'cancelled';

export interface Session {
  sid: string;
  kind: ActivityKind | null;
  host: Role | null;
  phase: Phase;
  ready: Record<Role, boolean>;
  startAt: number | null;
  params: Record<string, unknown>;
  partnerPresent: boolean;
  awaySince: number | null;
  reason: string | null;
  round: number;
  /** Session ids that have finished here (most recent last, bounded) — never resurrected. */
  closed?: string[];
}

export const GRACE_MS = 15_000;
export const COUNTDOWN_MS = 3_000;

export function idleSession(partnerPresent = false): Session {
  return { sid: '', kind: null, host: null, phase: 'idle', ready: { T: false, M: false }, startAt: null, params: {}, partnerPresent, awaySince: null, reason: null, round: 0 };
}

export type Msg =
  | { t: 'act:invite'; sid: string; kind: ActivityKind; params: Record<string, unknown> }
  | { t: 'act:accept'; sid: string }
  | { t: 'act:decline'; sid: string }
  | { t: 'act:ready'; sid: string; ready: boolean }
  | { t: 'act:start'; sid: string; startAt: number; round: number }
  | { t: 'act:cancel'; sid: string; reason: string }
  | { t: 'act:end'; sid: string; reason: string }
  | { t: 'act:rematch'; sid: string; round: number }
  | { t: 'act:sync'; sid: string; kind: ActivityKind; host: Role; phase: Phase; ready: Record<Role, boolean>; startAt: number | null; round: number; params: Record<string, unknown> };

export type Event =
  | { type: 'invite'; sid: string; kind: ActivityKind; params?: Record<string, unknown> }
  | { type: 'accept' }
  | { type: 'decline' }
  | { type: 'ready'; ready: boolean }
  | { type: 'start'; now: number }
  | { type: 'cancel'; reason?: string }
  | { type: 'end'; reason?: string }
  | { type: 'rematch' }
  | { type: 'reset' }
  | { type: 'tick'; now: number }
  | { type: 'partner'; present: boolean; now: number }
  | { type: 'remote'; msg: Msg; now: number };

export interface Result {
  s: Session;
  out: Msg[];
}

const same = (s: Session): Result => ({ s, out: [] });
const other = (r: Role): Role => (r === 'T' ? 'M' : 'T');

const CLOSED_MAX = 12;
function closeSid(s: Session, sid: string): string[] {
  const list = (s.closed ?? []).filter((x) => x !== sid);
  if (sid) list.push(sid);
  return list.slice(-CLOSED_MAX);
}
/** Marks a terminal phase and remembers the session id as closed. */
function terminal(s: Session, phase: 'cancelled' | 'ended', reason: string): Session {
  return { ...s, phase, reason, closed: closeSid(s, s.sid) };
}
const isClosed = (s: Session, sid: string) => (s.closed ?? []).includes(sid);

/** The snapshot a client broadcasts so its partner can reconcile (null when idle). */
export function syncMsg(s: Session): Msg | null {
  if (!s.sid || !s.kind || !s.host || s.phase === 'idle') return null;
  return { t: 'act:sync', sid: s.sid, kind: s.kind, host: s.host, phase: s.phase, ready: { ...s.ready }, startAt: s.startAt, round: s.round, params: s.params };
}

export function isActive(s: Session): boolean {
  return s.phase === 'inviting' || s.phase === 'invited' || s.phase === 'lobby' || s.phase === 'starting' || s.phase === 'running';
}

export function canStart(s: Session, me: Role): boolean {
  return s.phase === 'lobby' && s.host === me && s.ready.T && s.ready.M && s.partnerPresent;
}

export function reduce(s: Session, e: Event, me: Role): Result {
  const them = other(me);
  switch (e.type) {
    case 'invite': {
      if (isActive(s)) return same(s);
      if (!s.partnerPresent) return same({ ...s, reason: 'partner-offline' });
      const n: Session = { ...idleSession(true), sid: e.sid, kind: e.kind, host: me, phase: 'inviting', params: e.params ?? {}, closed: s.closed };
      return { s: n, out: [{ t: 'act:invite', sid: e.sid, kind: e.kind, params: n.params }] };
    }
    case 'accept':
      if (s.phase !== 'invited') return same(s);
      return { s: { ...s, phase: 'lobby' }, out: [{ t: 'act:accept', sid: s.sid }] };
    case 'decline':
      if (s.phase !== 'invited') return same(s);
      return { s: terminal(s, 'cancelled', 'declined-by-me'), out: [{ t: 'act:decline', sid: s.sid }] };
    case 'ready': {
      if (s.phase !== 'lobby') return same(s);
      return { s: { ...s, ready: { ...s.ready, [me]: e.ready } }, out: [{ t: 'act:ready', sid: s.sid, ready: e.ready }] };
    }
    case 'start': {
      if (!canStart(s, me)) return same(s);
      const startAt = e.now + COUNTDOWN_MS;
      return { s: { ...s, phase: 'starting', startAt }, out: [{ t: 'act:start', sid: s.sid, startAt, round: s.round }] };
    }
    case 'cancel':
      if (!isActive(s)) return same(s);
      return { s: terminal(s, 'cancelled', e.reason ?? 'cancelled-by-me'), out: [{ t: 'act:cancel', sid: s.sid, reason: e.reason ?? 'cancelled' }] };
    case 'end':
      if (s.phase !== 'running' && s.phase !== 'starting') return same(s);
      return { s: { ...s, phase: 'ended', reason: e.reason ?? 'complete' }, out: [{ t: 'act:end', sid: s.sid, reason: e.reason ?? 'complete' }] };
    case 'rematch': {
      if (s.phase !== 'ended' || !s.partnerPresent) return same(s);
      const n: Session = { ...s, phase: 'lobby', ready: { T: false, M: false }, startAt: null, reason: null, round: s.round + 1 };
      return { s: n, out: [{ t: 'act:rematch', sid: s.sid, round: n.round }] };
    }
    case 'reset':
      return same({ ...idleSession(s.partnerPresent), closed: closeSid(s, s.sid) });
    case 'tick': {
      if (s.phase === 'starting' && s.startAt !== null && e.now >= s.startAt) return same({ ...s, phase: 'running' });
      if (s.awaySince !== null && isActive(s) && e.now - s.awaySince >= GRACE_MS) {
        return same(terminal(s, 'cancelled', 'partner-left'));
      }
      return same(s);
    }
    case 'partner': {
      if (e.present) return same({ ...s, partnerPresent: true, awaySince: null });
      // A presence blip must not erase a valid invitation: everything waits GRACE_MS (see tick).
      return same({ ...s, partnerPresent: false, awaySince: s.awaySince ?? e.now });
    }
    case 'remote':
      return reduceRemote(s, e.msg, me, them, e.now);
  }
}

function reduceRemote(s: Session, m: Msg, me: Role, them: Role, now: number): Result {
  if (m.t === 'act:sync') return same(reconcile(s, m, me, them, now));
  if (m.t === 'act:invite') {
    if (isClosed(s, m.sid) || m.sid === s.sid) return same(s); // stale or duplicate invite
    if (isActive(s)) {
      // Both invited at the same time: the Tangerine role wins the tie, the other side yields.
      if (s.phase === 'inviting' && me === 'M') {
        return same({ ...idleSession(true), sid: m.sid, kind: m.kind, host: them, phase: 'invited', params: m.params, closed: closeSid(s, s.sid) });
      }
      return same(s);
    }
    if (!ACTIVITY_KINDS.includes(m.kind)) return same(s);
    return same({ ...idleSession(true), sid: m.sid, kind: m.kind, host: them, phase: 'invited', params: m.params ?? {}, closed: s.closed });
  }
  if (m.sid !== s.sid || !s.sid) return same(s); // not our session
  switch (m.t) {
    case 'act:accept':
      return s.phase === 'inviting' && s.host === me ? same({ ...s, phase: 'lobby' }) : same(s);
    case 'act:decline':
      return s.phase === 'inviting' ? same(terminal(s, 'cancelled', 'declined')) : same(s);
    case 'act:ready':
      return s.phase === 'lobby' ? same({ ...s, ready: { ...s.ready, [them]: !!m.ready } }) : same(s);
    case 'act:start': {
      // Only the host's start counts, only once, and only from the lobby.
      if (s.host !== them || s.phase !== 'lobby' || m.round !== s.round) return same(s);
      if (typeof m.startAt !== 'number' || m.startAt < now - 10_000 || m.startAt > now + 30_000) return same(s);
      return same({ ...s, phase: 'starting', startAt: m.startAt });
    }
    case 'act:cancel':
      return isActive(s) ? same(terminal(s, 'cancelled', 'cancelled-by-partner')) : same(s);
    case 'act:end':
      return s.phase === 'running' || s.phase === 'starting' ? same({ ...s, phase: 'ended', reason: m.reason || 'complete' }) : same(s);
    case 'act:rematch':
      return s.phase === 'ended' && m.round === s.round + 1
        ? same({ ...s, phase: 'lobby', ready: { T: false, M: false }, startAt: null, reason: null, round: m.round })
        : same(s);
  }
  return same(s);
}

/**
 * Converge with the partner's snapshot of the SAME session. Only legal forward transitions are
 * applied, so duplicates and out-of-order snapshots are harmless:
 *   - host 'inviting' + guest says lobby/starting/running     → lobby (the lost "accept")
 *   - guest idle/cancelled + host still 'inviting' a NEW sid  → invited (the lost invite)
 *   - partner says cancelled                                  → cancelled
 *   - lobby: partner's own ready flag is taken from them
 *   - guest lobby + host says starting/running (same round)   → starting at the host's time
 */
function reconcile(s: Session, m: Extract<Msg, { t: 'act:sync' }>, me: Role, them: Role, now: number): Session {
  if (isClosed(s, m.sid)) return s;
  if (m.sid !== s.sid) {
    // A session we don't know: only an invitation from the partner can be adopted, and only if
    // we're not busy with something else.
    if (m.phase === 'inviting' && m.host === them && !isActive(s) && ACTIVITY_KINDS.includes(m.kind)) {
      return { ...idleSession(true), sid: m.sid, kind: m.kind, host: them, phase: 'invited', params: m.params ?? {}, closed: closeSid(s, s.sid) };
    }
    return s;
  }
  if (m.host !== s.host) return s; // a different view of who hosts: ignore
  if (m.phase === 'cancelled') return isActive(s) ? terminal(s, 'cancelled', 'cancelled-by-partner') : s;
  let n = s;
  if (s.phase === 'inviting' && s.host === me && (m.phase === 'lobby' || m.phase === 'starting' || m.phase === 'running')) {
    n = { ...n, phase: 'lobby' };
  }
  if (n.phase === 'lobby' && m.round === n.round && (m.phase === 'lobby' || m.phase === 'starting' || m.phase === 'running')) {
    n = { ...n, ready: { ...n.ready, [them]: !!m.ready?.[them] } };
  }
  if (n.phase === 'lobby' && n.host === them && m.round === n.round && (m.phase === 'starting' || m.phase === 'running')
    && typeof m.startAt === 'number' && m.startAt > now - 60_000 && m.startAt < now + 30_000) {
    n = { ...n, phase: 'starting', startAt: m.startAt };
  }
  if (n.phase === 'ended' && m.phase === 'lobby' && m.round === n.round + 1) {
    n = { ...n, phase: 'lobby', ready: { T: false, M: false }, startAt: null, reason: null, round: m.round };
  }
  return n;
}

const PHASES: readonly Phase[] = ['idle', 'inviting', 'invited', 'lobby', 'starting', 'running', 'ended', 'cancelled'];

/** Validates a raw transport message into a coordinator Msg (or null). */
export function toMsg(raw: Record<string, unknown>): Msg | null {
  const sid = typeof raw.sid === 'string' && /^[A-Za-z0-9-]{4,40}$/.test(raw.sid) ? raw.sid : null;
  if (!sid) return null;
  switch (raw.t) {
    case 'act:invite':
      return ACTIVITY_KINDS.includes(raw.kind as ActivityKind)
        ? { t: 'act:invite', sid, kind: raw.kind as ActivityKind, params: raw.params && typeof raw.params === 'object' ? (raw.params as Record<string, unknown>) : {} }
        : null;
    case 'act:accept': return { t: 'act:accept', sid };
    case 'act:decline': return { t: 'act:decline', sid };
    case 'act:ready': return { t: 'act:ready', sid, ready: raw.ready === true };
    case 'act:start': return typeof raw.startAt === 'number' && typeof raw.round === 'number' ? { t: 'act:start', sid, startAt: raw.startAt, round: raw.round } : null;
    case 'act:cancel': return { t: 'act:cancel', sid, reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 40) : 'cancelled' };
    case 'act:end': return { t: 'act:end', sid, reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 40) : 'complete' };
    case 'act:rematch': return typeof raw.round === 'number' ? { t: 'act:rematch', sid, round: raw.round } : null;
    case 'act:sync': {
      const host = raw.host === 'T' || raw.host === 'M' ? raw.host : null;
      const phase = PHASES.includes(raw.phase as Phase) ? (raw.phase as Phase) : null;
      const kind = ACTIVITY_KINDS.includes(raw.kind as ActivityKind) ? (raw.kind as ActivityKind) : null;
      const r = raw.ready as Record<string, unknown> | undefined;
      if (!host || !phase || !kind || typeof raw.round !== 'number' || !Number.isFinite(raw.round)) return null;
      return {
        t: 'act:sync', sid, kind, host, phase, round: Math.floor(raw.round),
        ready: { T: r?.T === true, M: r?.M === true },
        startAt: typeof raw.startAt === 'number' && Number.isFinite(raw.startAt) ? raw.startAt : null,
        params: raw.params && typeof raw.params === 'object' ? (raw.params as Record<string, unknown>) : {},
      };
    }
    default: return null;
  }
}

export function newSid(rand: () => number = Math.random): string {
  return `s${Date.now().toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`;
}

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  swing: 'swing together', seesaw: 'ride the seesaw', stargaze: 'watch the stars', picnic: 'have a picnic', fishing: 'fish together',
  bench: 'sit together', emote: 'share a moment', pawhold: 'hold paws', pawtype: 'race in PawType', boxing: 'box a friendly match', photo: 'take a photo', bumper: 'drive bumper cars',
};
