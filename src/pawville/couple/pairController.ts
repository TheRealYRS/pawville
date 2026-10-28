/**
 * Couple connection controller (Milestone 5 — multiplayer repair).
 *
 * The app-wide singleton in pairHub.ts is a thin wrapper around ONE instance of this class. All
 * dependencies (pair RPCs, transport factory, storage, clock, timers) are injected, so two real
 * controllers can be wired to an in-memory backend and tested end-to-end (tests/pawvilleMultiplayer).
 *
 * Canonical state (never independent booleans):
 *   backend        is a server configured?                       (BackendStatus)
 *   pair           confirmed membership from pv_my_pair          (PairInfo | null)
 *   invite         latest invitation of my pair + its status     (pv_my_pair_invite)
 *   transport      the private pair channel's connection state   (TransportStatus)
 *   partner        presence of the OTHER role in that channel, with a grace period
 *   session        the shared-activity state machine             (activitySession.ts)
 * The UI derives every label from these (see coupleView.ts).
 *
 * Root causes fixed here (see PAWVILLE_MULTIPLAYER_REPAIR.md):
 *   1. The inviter never opened the pair channel while the invite was pending and nothing ever
 *      re-read pv_my_pair afterwards, so after the partner accepted the inviter stayed on
 *      "Invite pending" / "partner away" until a full reload. Now the channel is opened for
 *      pending pairs too (the inviter is already a member), and the server state is reconciled
 *      when the partner appears, when the channel (re)connects, on focus/online, and on a
 *      bounded schedule while an invite is pending.
 *   2. Every `adopt` closed and re-opened the channel even when nothing changed, racing the
 *      Realtime topic de-duplication (net/channelRegistry.ts). Same pair → keep the channel.
 *   3. One missed presence sync flipped partnerOnline=false and cancelled pending activities.
 *      Partner-away now needs PARTNER_GRACE_MS of continuous absence.
 *   4. Double-clicking Accept surfaced "already paired" although the first click had worked.
 *      Accept/create are single-flight and a refused accept is checked against the server.
 */
import { idleSession, isActive, reduce, syncMsg, toMsg, type Event, type Session } from './activitySession.ts';
import { otherRole, randomInviteCode, type PairInfo, type Role } from './pairModel.ts';
import type { PairMessage, PairTransport, TransportStatus } from './transport.ts';

export type BackendStatus = 'not-configured' | 'client-missing' | 'ready';
export type InviteStatus = 'open' | 'accepted' | 'declined' | 'cancelled' | 'expired';

export interface InviteView {
  code: string;
  expiresAt: string | null;
  demo: boolean;
  /** Authoritative status when the server could tell us; 'open' right after creation. */
  status: InviteStatus;
}

export type PartnerPresence = 'none' | 'online' | 'away' | 'offline';

export interface PairState {
  loading: boolean;
  backend: BackendStatus;
  pair: PairInfo | null;
  invite: InviteView | null;
  transport: TransportStatus | 'none';
  /** Debounced: true while the partner is present, or absent for less than PARTNER_GRACE_MS. */
  partnerOnline: boolean;
  partner: PartnerPresence;
  session: Session;
  error: string | null;
  /** True while a server reconciliation is in flight. */
  syncing: boolean;
}

export interface PairServiceLike {
  fetchMyPair(): Promise<PairInfo | null>;
  fetchMyInvite(): Promise<{ code: string; status: InviteStatus; expiresAt: string; mine: boolean } | null | undefined>;
  createInvite(role: Role, name: string): Promise<{ code: string; pairId: string; myRole: Role; expiresAt: string }>;
  acceptInvite(code: string, name: string): Promise<PairInfo>;
  declineInvite(code: string): Promise<void>;
  cancelInvites(): Promise<void>;
  leavePair(): Promise<void>;
}

export interface StoreLike<T> {
  load(): T;
  save(v: T): unknown;
  reset(): void;
}

export interface ControllerDeps {
  backend: () => BackendStatus;
  svc: PairServiceLike;
  /** Opens the pair transport (Supabase private channel, or the BroadcastChannel demo). */
  makeTransport: (p: PairInfo) => PairTransport;
  pairCache: StoreLike<PairInfo | null>;
  demoPair: StoreLike<PairInfo | null>;
  /** Shared (per-browser) store for demo invite codes → creator role. */
  demoRoles: { get(code: string): Role | null; set(code: string, role: Role): void };
  now: () => number;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (h: unknown) => void;
  errorCode: (e: unknown) => string;
}

export const PARTNER_GRACE_MS = 6_000;
export const SYNC_EVERY_MS = 2_000;
/** Reconcile schedule while our invite is pending: fast at first, then slower, never unbounded. */
export function reconcileDelay(pendingForMs: number): number {
  if (pendingForMs < 2 * 60_000) return 4_000;
  if (pendingForMs < 15 * 60_000) return 15_000;
  return 60_000;
}

export class PairController {
  state: PairState;
  private readonly d: ControllerDeps;
  private listeners = new Set<() => void>();
  private msgListeners = new Set<(m: PairMessage) => void>();
  private transport: PairTransport | null = null;
  private transportKey = '';
  private unsubs: (() => void)[] = [];
  private ticker: unknown = null;
  private started = false;
  private rawPartner = false;
  private partnerAbsentSince: number | null = null;
  private lastSync = 0;
  private pendingSince: number | null = null;
  private nextReconcile = 0;
  private reconciling: Promise<void> | null = null;
  private accepting: Promise<boolean> | null = null;
  private creating: Promise<void> | null = null;

  constructor(deps: ControllerDeps) {
    this.d = deps;
    this.state = {
      loading: true, backend: 'not-configured', pair: null, invite: null, transport: 'none', partnerOnline: false, partner: 'none',
      session: idleSession(false), error: null, syncing: false,
    };
  }

  // ------------------------------------------------------------------ store plumbing
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
  onMessage(cb: (m: PairMessage) => void): () => void {
    this.msgListeners.add(cb);
    return () => void this.msgListeners.delete(cb);
  }
  private set(patch: Partial<PairState>) {
    this.state = { ...this.state, ...patch };
    for (const l of [...this.listeners]) l();
  }
  myRole(): Role {
    return this.state.pair?.myRole ?? 'T';
  }

  // ------------------------------------------------------------------ transport lifecycle
  private closeTransport() {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    const t = this.transport;
    this.transport = null;
    this.transportKey = '';
    if (t) void t.close();
    this.rawPartner = false;
    this.partnerAbsentSince = null;
    this.set({ transport: 'none', partnerOnline: false, partner: this.state.pair ? 'offline' : 'none', session: { ...idleSession(false), closed: this.state.session.closed } });
  }

  private openTransport(p: PairInfo) {
    const key = `${p.source}|${p.pairId}|${p.myRole}`;
    if (this.transport && this.transportKey === key) return; // same pair: keep the live channel
    this.closeTransport();
    const t = this.d.makeTransport(p);
    this.transport = t;
    this.transportKey = key;
    this.unsubs.push(t.onStatus((s) => {
      this.set({ transport: s, error: s === 'conflict' ? 'role_conflict' : this.state.error === 'role_conflict' ? null : this.state.error });
      if (s === 'online') this.requestReconcile(); // (re)connected: re-read the authoritative state
    }));
    this.unsubs.push(t.onPartner((online) => this.partnerSignal(online)));
    this.unsubs.push(t.onMessage((m) => {
      if (m.t.startsWith('act:')) {
        const msg = toMsg(m);
        if (msg) this.dispatch({ type: 'remote', msg, now: this.d.now() });
      }
      for (const l of [...this.msgListeners]) l(m);
    }));
    this.set({ transport: 'connecting', partner: 'offline' });
    this.ensureTicker();
  }

  private partnerSignal(online: boolean) {
    const now = this.d.now();
    this.rawPartner = online;
    if (online) {
      this.partnerAbsentSince = null;
      const was = this.state.partner;
      this.set({ partnerOnline: true, partner: 'online' });
      this.dispatch({ type: 'partner', present: true, now });
      // Partner (re)appeared: send our activity snapshot right away, and if we still think the
      // invite is pending, the server certainly knows better.
      this.lastSync = 0;
      if (was !== 'online' || !this.state.pair?.partnerJoined) this.requestReconcile();
      this.tick();
    } else if (this.state.partner === 'online') {
      this.partnerAbsentSince = now;
      this.set({ partner: 'away' }); // still partnerOnline=true during the grace period
    }
  }

  private ensureTicker() {
    if (this.ticker) return;
    this.ticker = this.d.setInterval(() => this.tick(), 250);
  }

  /** Drives grace periods, activity countdowns, sync snapshots and bounded reconciliation. */
  tick() {
    const now = this.d.now();
    if (this.partnerAbsentSince !== null && !this.rawPartner && now - this.partnerAbsentSince >= PARTNER_GRACE_MS) {
      this.partnerAbsentSince = null;
      this.set({ partnerOnline: false, partner: 'offline' });
      this.dispatch({ type: 'partner', present: false, now: now - PARTNER_GRACE_MS });
    }
    if (this.state.session.phase !== 'idle') this.dispatch({ type: 'tick', now });
    if (this.transport && this.rawPartner && isActive(this.state.session) && now - this.lastSync >= SYNC_EVERY_MS) {
      const m = syncMsg(this.state.session);
      if (m) this.transport.send(m);
      this.lastSync = now;
    }
    const p = this.state.pair;
    if (p?.source === 'backend' && !p.partnerJoined) {
      this.pendingSince ??= now;
      if (now >= this.nextReconcile) this.requestReconcile();
    } else {
      this.pendingSince = null;
    }
  }

  dispatch(e: Event): void {
    const r = reduce(this.state.session, e, this.myRole());
    if (r.s !== this.state.session) this.set({ session: r.s });
    for (const m of r.out) this.transport?.send(m);
    if (r.out.length) this.lastSync = this.d.now(); // a real message just went out
  }

  /** Raw pair messages (town positions, emotes, game moves). */
  send(msg: { t: string; [k: string]: unknown }): boolean {
    if (!this.transport || !this.state.partnerOnline) return false;
    this.transport.send(msg);
    return true;
  }

  // ------------------------------------------------------------------ authoritative state
  private adopt(p: PairInfo | null) {
    const prev = this.state.pair;
    const same = !!p && !!prev && p.pairId === prev.pairId && p.source === prev.source && p.myRole === prev.myRole;
    this.set({ pair: p });
    if (p?.source === 'backend') this.d.pairCache.save(p);
    if (!p) {
      this.closeTransport();
      this.set({ partner: 'none' });
      return;
    }
    if (!same || !this.transport) this.openTransport(p);
    if (p.partnerJoined && this.state.invite && !this.state.invite.demo && this.state.invite.status === 'open') {
      this.set({ invite: { ...this.state.invite, status: 'accepted' } });
    }
  }

  /** Re-reads pv_my_pair (+ invite status). Single-flight; failures keep the current truthful state. */
  requestReconcile(): Promise<void> {
    if (this.state.pair?.source === 'demo' || this.d.backend() !== 'ready') return Promise.resolve();
    if (this.reconciling) return this.reconciling;
    const now = this.d.now();
    this.nextReconcile = now + reconcileDelay(this.pendingSince === null ? 0 : now - this.pendingSince);
    this.set({ syncing: true });
    this.reconciling = (async () => {
      try {
        const p = await this.d.svc.fetchMyPair();
        if (!p) this.d.pairCache.reset();
        const changed = JSON.stringify(p) !== JSON.stringify(this.state.pair);
        if (changed) this.adopt(p);
        if (p && !p.partnerJoined) {
          const inv = await this.d.svc.fetchMyInvite();
          if (inv === undefined) {
            // Older backend without pv_my_pair_invite: keep what we know.
          } else if (inv && inv.mine) {
            this.set({ invite: { code: inv.code, expiresAt: inv.expiresAt, demo: false, status: inv.status } });
          } else if (inv === null) {
            this.set({ invite: null });
          }
        } else if (p?.partnerJoined && this.state.invite && !this.state.invite.demo) {
          this.set({ invite: { ...this.state.invite, status: 'accepted' } });
        }
      } catch (e) {
        if (this.state.loading) this.set({ error: this.d.errorCode(e) });
      } finally {
        this.reconciling = null;
        this.set({ syncing: false, loading: false });
      }
    })();
    return this.reconciling;
  }

  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const backend = this.d.backend();
    this.set({ backend });
    const demo = this.d.demoPair.load();
    if (demo) {
      this.set({ loading: false });
      this.adopt(demo);
      return;
    }
    if (backend !== 'ready') {
      this.set({ loading: false });
      return;
    }
    // Show the cached pointer immediately (no channel yet), then confirm with the server.
    const cached = this.d.pairCache.load();
    if (cached) this.set({ pair: cached });
    try {
      const p = await this.d.svc.fetchMyPair();
      if (!p) this.d.pairCache.reset();
      this.set({ pair: null }); // force a real adopt from the server answer
      this.adopt(p);
      this.set({ loading: false, error: null });
      if (p && !p.partnerJoined) await this.requestReconcile();
    } catch (e) {
      this.set({ loading: false, error: this.d.errorCode(e), pair: null });
    }
  }

  createInvite(role: Role, name: string): Promise<void> {
    if (this.creating) return this.creating; // double clicks create ONE invite
    this.set({ error: null });
    this.creating = (async () => {
      try {
        const inv = await this.d.svc.createInvite(role, name);
        // Show "pending" only after the server confirmed the invite exists.
        this.set({ invite: { code: inv.code, expiresAt: inv.expiresAt, demo: false, status: 'open' } });
        this.adopt({ pairId: inv.pairId, source: 'backend', myRole: inv.myRole, partnerName: '', partnerJoined: false });
        this.pendingSince = this.d.now();
        this.nextReconcile = this.d.now() + reconcileDelay(0);
      } catch (e) {
        this.set({ error: this.d.errorCode(e) });
      } finally {
        this.creating = null;
      }
    })();
    return this.creating;
  }

  acceptInvite(code: string, name: string): Promise<boolean> {
    if (this.accepting) return this.accepting; // single flight: one accept, one pair
    this.set({ error: null });
    this.accepting = (async () => {
      try {
        const p = await this.d.svc.acceptInvite(code, name);
        this.set({ invite: null });
        this.adopt(p);
        return true;
      } catch (e) {
        const code0 = this.d.errorCode(e);
        if (code0 === 'already_paired' || code0 === 'invite_closed') {
          // Maybe our own earlier click (or another tab) already accepted it: ask the server.
          try {
            const mine = await this.d.svc.fetchMyPair();
            if (mine?.partnerJoined) {
              this.set({ invite: null });
              this.adopt(mine);
              return true;
            }
          } catch {
            /* fall through to the original error */
          }
        }
        this.set({ error: code0 });
        return false;
      } finally {
        this.accepting = null;
      }
    })();
    return this.accepting;
  }

  async declineInvite(code: string): Promise<void> {
    try {
      await this.d.svc.declineInvite(code);
    } catch (e) {
      this.set({ error: this.d.errorCode(e) });
    }
  }

  async cancelInvite(): Promise<void> {
    try {
      await this.d.svc.cancelInvites();
      if (this.state.invite) this.set({ invite: { ...this.state.invite, status: 'cancelled' } });
    } catch (e) {
      this.set({ error: this.d.errorCode(e) });
    }
    await this.requestReconcile();
  }

  async leavePair(): Promise<void> {
    if (this.state.pair?.source === 'demo') {
      this.d.demoPair.reset();
      this.set({ invite: null });
      this.adopt(null);
      return;
    }
    try {
      await this.d.svc.leavePair();
      this.d.pairCache.reset();
      this.set({ invite: null });
      this.adopt(null);
    } catch (e) {
      this.set({ error: this.d.errorCode(e) });
    }
  }

  /** Local two-tab demo. The creator's role is recorded with the code so the joiner gets the OTHER one. */
  createDemoPair(role: Role, rand: () => number = Math.random): string {
    const code = randomInviteCode(rand);
    this.d.demoRoles.set(code, role);
    const p: PairInfo = { pairId: `demo:${code}`, source: 'demo', myRole: role, partnerName: '', partnerJoined: true };
    this.d.demoPair.save(p);
    this.set({ invite: { code, expiresAt: null, demo: true, status: 'open' } });
    this.adopt(p);
    return code;
  }

  joinDemoPair(code: string): boolean {
    const creator = this.d.demoRoles.get(code);
    if (!creator) {
      this.set({ error: 'demo_not_found' });
      return false;
    }
    const p: PairInfo = { pairId: `demo:${code}`, source: 'demo', myRole: otherRole(creator), partnerName: '', partnerJoined: true };
    this.d.demoPair.save(p);
    this.set({ invite: null, error: null });
    this.adopt(p);
    return true;
  }

  clearError() {
    this.set({ error: null });
  }

  /** Stops timers and the channel (tests, hot reload). */
  dispose() {
    if (this.ticker) this.d.clearInterval(this.ticker);
    this.ticker = null;
    this.closeTransport();
  }
}
