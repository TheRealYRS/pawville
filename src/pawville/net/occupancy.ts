/**
 * Who is sitting / riding where — the ONE rule for exclusive seats (benches, window seats, every funfair ride seat).
 *
 * ROOT CAUSES this module fixes (found in the audit, reproduced in two real browser tabs):
 *   - A bench seat was chosen by your cat ROLE (Tangerine = left, Midnight = right), not by who was already sitting. Two cats
 *     of the same role (every un-paired player defaults to Tangerine) both took the left seat and sat on top of each other.
 *   - Ride seats were only known for your PAIRED PARTNER (a private "fair" message). Any other player in the park was
 *     invisible to the seat picker, so two players could claim the same gondola.
 *
 * HOW: every player publishes the seat they hold as an optional `claim` inside the snapshot they already send (town
 * presence for everybody, the pair channel for your partner) — no new channel, no new message type, no protocol version
 * bump (older clients simply ignore the extra field). Everybody derives the SAME occupancy table from the snapshots they
 * receive. A seat held by someone who disconnects frees itself, because a remote that leaves presence leaves the table.
 *
 * Conflicts (two players claim the same seat before either has heard of the other) resolve identically on every client with
 * no server: the EARLIER claim wins; an exact tie goes to the lexicographically smaller player id. It is a total order, so
 * exactly one of the two yields — and the loser is offered another free seat before anything else.
 *
 * Pure and unit tested (tests/pawvilleSeatClaims.test.ts).
 */
export type ClaimKind = 'ride' | 'seat';
export type ClaimPhase = 'queued' | 'riding' | 'leaving' | 'seated';

export interface SeatClaim {
  kind: ClaimKind;
  /** Stable id of the thing being sat on: a ride id ('ferris'), or `<region>:<spot id>` for a bench or table. */
  id: string;
  /** Which seat of it (0-based). */
  seat: number;
  phase: ClaimPhase;
  /** When the claim was made (shared UTC ms) — decides conflicts. */
  at: number;
}

const ID_RE = /^[A-Za-z0-9:_.-]{1,60}$/;
const PHASES: readonly ClaimPhase[] = ['queued', 'riding', 'leaving', 'seated'];

/** Everything received from the network is untrusted. */
export function sanitizeClaim(raw: unknown): SeatClaim | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'ride' && r.kind !== 'seat') return null;
  if (typeof r.id !== 'string' || !ID_RE.test(r.id)) return null;
  if (typeof r.seat !== 'number' || !Number.isInteger(r.seat) || r.seat < 0 || r.seat > 15) return null;
  if (!PHASES.includes(r.phase as ClaimPhase)) return null;
  if (typeof r.at !== 'number' || !Number.isFinite(r.at) || r.at < 0) return null;
  return { kind: r.kind, id: r.id, seat: r.seat, phase: r.phase as ClaimPhase, at: Math.floor(r.at) };
}

export const seatKey = (c: Pick<SeatClaim, 'kind' | 'id' | 'seat'>): string => `${c.kind}:${c.id}:${c.seat}`;
/** Change detection for the send gate (a change of seat, phase or claim time must be broadcast). */
export const claimSig = (c: SeatClaim | null | undefined): string => (c ? `${c.kind}:${c.id}:${c.seat}:${c.phase}:${c.at}` : '');

/** Does claimant `a` outrank claimant `b` for the same seat? A total order: earlier claim, then smaller id. */
export function outranks(a: { uid: string; at: number }, b: { uid: string; at: number }): boolean {
  if (a.at !== b.at) return a.at < b.at;
  return a.uid < b.uid;
}

export interface Holder { uid: string; claim: SeatClaim }
export interface Occupant { id: string; uid?: string; claim?: SeatClaim | null; region?: string }

/**
 * The seats held by OTHER players, keyed by seatKey. `region` is the place we are in: a player in another place holds
 * nothing here. If several others claim the same seat (a conflict in flight) the one who outranks the rest holds it.
 * The same player listed twice (a partner is both a pair link and a plaza cat) counts once.
 */
export function occupancy(others: Iterable<Occupant>, region: string): Map<string, Holder> {
  const out = new Map<string, Holder>();
  for (const o of others) {
    const c = o.claim;
    if (!c || (o.region ?? 'town') !== region) continue;
    const uid = o.uid ?? o.id;
    const k = seatKey(c);
    const cur = out.get(k);
    if (!cur || (cur.uid !== uid && outranks({ uid, at: c.at }, { uid: cur.uid, at: cur.claim.at }))) out.set(k, { uid, claim: c });
  }
  return out;
}

/** The seat numbers of `kind`/`id` that other players hold. */
export function seatsTaken(occ: ReadonlyMap<string, Holder>, kind: ClaimKind, id: string): Set<number> {
  const out = new Set<number>();
  for (const h of occ.values()) if (h.claim.kind === kind && h.claim.id === id) out.add(h.claim.seat);
  return out;
}

/** The free seat to take: `prefer` if it is free (a couple keeps its familiar sides), otherwise the first free one; null = full. */
export function pickFreeSeat(count: number, taken: ReadonlySet<number>, prefer = 0): number | null {
  if (prefer >= 0 && prefer < count && !taken.has(prefer)) return prefer;
  for (let i = 0; i < count; i++) if (!taken.has(i)) return i;
  return null;
}

/** True when someone else holds MY seat and outranks my claim: I must give it up. */
export function lostSeat(me: { uid: string; claim: SeatClaim }, occ: ReadonlyMap<string, Holder>): boolean {
  const h = occ.get(seatKey(me.claim));
  return !!h && h.uid !== me.uid && outranks({ uid: h.uid, at: h.claim.at }, { uid: me.uid, at: me.claim.at });
}
