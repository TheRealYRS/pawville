/**
 * Pair transport: how the two members of a couple talk in real time.
 *
 *   SupabasePairTransport  private Realtime channel 'pv-pair:<pair id>' on the EXISTING client.
 *                          Only the two members can join (RLS policy in the pairs migration).
 *   DemoPairTransport      BroadcastChannel between tabs of ONE browser. Development/demo only —
 *                          the UI labels it "local two-tab demo", never "online".
 *
 * Messages are untrusted on receipt: unknown types or malformed payloads are dropped.
 * Neither transport is a trusted authority for competitive results (see README).
 */
import { acquireChannel, type Lease, type RealtimeClientLike } from '../net/channelRegistry.ts';
import { otherRole, type Role } from './pairModel.ts';

export interface PairMessage {
  t: string;
  from: Role;
  at: number;
  [key: string]: unknown;
}

/** 'conflict' = the other end speaks with OUR role (two tabs/devices claiming the same seat). */
export type TransportStatus = 'connecting' | 'online' | 'error' | 'closed' | 'conflict';

export interface PairTransport {
  readonly kind: 'supabase' | 'demo';
  send(msg: Omit<PairMessage, 'from' | 'at'>): void;
  onMessage(cb: (msg: PairMessage) => void): () => void;
  onStatus(cb: (s: TransportStatus) => void): () => void;
  onPartner(cb: (online: boolean) => void): () => void;
  partnerOnline(): boolean;
  close(): Promise<void>;
}

const MSG_TYPE = /^[a-z][a-z0-9:_-]{1,40}$/;
const MAX_MSG_CHARS = 8000;

export function parseMessage(raw: unknown, expectFrom: Role): PairMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.t !== 'string' || !MSG_TYPE.test(m.t)) return null;
  if (m.from !== expectFrom) return null; // a member can only speak as themselves
  if (typeof m.at !== 'number' || !Number.isFinite(m.at)) return null;
  try {
    if (JSON.stringify(m).length > MAX_MSG_CHARS) return null;
  } catch {
    return null;
  }
  return m as PairMessage;
}

class Emitter<T> {
  private subs = new Set<(v: T) => void>();
  on(cb: (v: T) => void) {
    this.subs.add(cb);
    return () => void this.subs.delete(cb);
  }
  emit(v: T) {
    for (const s of [...this.subs]) s(v);
  }
}

abstract class BaseTransport implements PairTransport {
  abstract readonly kind: 'supabase' | 'demo';
  protected msgs = new Emitter<PairMessage>();
  protected statusE = new Emitter<TransportStatus>();
  protected partnerE = new Emitter<boolean>();
  protected online = false;
  protected readonly me: Role;
  constructor(me: Role) {
    this.me = me;
  }
  abstract send(msg: Omit<PairMessage, 'from' | 'at'>): void;
  abstract close(): Promise<void>;
  onMessage(cb: (m: PairMessage) => void) { return this.msgs.on(cb); }
  onStatus(cb: (s: TransportStatus) => void) { return this.statusE.on(cb); }
  onPartner(cb: (o: boolean) => void) { return this.partnerE.on(cb); }
  partnerOnline() { return this.online; }
  protected setPartner(on: boolean) {
    if (on !== this.online) {
      this.online = on;
      this.partnerE.emit(on);
    }
  }
  protected receive(raw: unknown) {
    const m = parseMessage(raw, otherRole(this.me));
    if (m) this.msgs.emit(m);
  }
  protected envelope(msg: Omit<PairMessage, 'from' | 'at'>): PairMessage {
    return { ...msg, from: this.me, at: Date.now() } as PairMessage;
  }
}

/** Minimal BroadcastChannel surface (injectable for tests). */
export interface BroadcastLike {
  postMessage(data: unknown): void;
  addEventListener(type: 'message', cb: (e: { data: unknown }) => void): void;
  removeEventListener(type: 'message', cb: (e: { data: unknown }) => void): void;
  close(): void;
}

export class DemoPairTransport extends BaseTransport {
  readonly kind = 'demo' as const;
  private bc: BroadcastLike;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastSeen = 0;
  private handler = (e: { data: unknown }) => {
    const d = e.data as { kind?: string; from?: Role; msg?: unknown } | null;
    if (d && d.from === this.me && d.kind === 'hello') {
      // Another tab joined this demo couple with OUR role: report it instead of silently
      // dropping every message (the old "Demo: partner away" forever).
      this.statusE.emit('conflict');
      return;
    }
    if (!d || d.from !== otherRole(this.me)) return;
    if (d.kind === 'hello') {
      this.lastSeen = this.clock();
      const wasOnline = this.online;
      this.setPartner(true);
      if (!wasOnline) this.bc.postMessage({ kind: 'hello', from: this.me }); // handshake back
    } else if (d.kind === 'bye') {
      this.setPartner(false);
    } else if (d.kind === 'msg') {
      this.lastSeen = this.clock();
      this.setPartner(true);
      this.receive(d.msg);
    }
  };
  private clock: () => number;

  constructor(me: Role, code: string, make: (name: string) => BroadcastLike, clock: () => number = Date.now) {
    super(me);
    this.clock = clock;
    this.bc = make(`pawville-demo-pair:${code}`);
    this.bc.addEventListener('message', this.handler);
    const hello = () => {
      this.bc.postMessage({ kind: 'hello', from: this.me });
      if (this.online && this.clock() - this.lastSeen > 6000) this.setPartner(false);
    };
    hello();
    this.heartbeat = setInterval(hello, 2000);
    (this.heartbeat as { unref?: () => void }).unref?.();
    queueMicrotask(() => this.statusE.emit('online'));
  }

  send(msg: Omit<PairMessage, 'from' | 'at'>) {
    this.bc.postMessage({ kind: 'msg', from: this.me, msg: this.envelope(msg) });
  }

  async close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    try {
      this.bc.postMessage({ kind: 'bye', from: this.me });
    } catch {
      /* already closed */
    }
    this.bc.removeEventListener('message', this.handler);
    this.bc.close();
    this.statusE.emit('closed');
  }
}

interface RealtimeChannelLike {
  on(type: string, filter: { event: string }, cb: (payload: unknown) => void): RealtimeChannelLike;
  subscribe(cb?: (status: string) => void): RealtimeChannelLike;
  send(m: { type: 'broadcast'; event: string; payload: unknown }): Promise<unknown>;
  track(p: Record<string, unknown>): Promise<unknown>;
  presenceState(): Record<string, unknown>;
}

export class SupabasePairTransport extends BaseTransport {
  readonly kind = 'supabase' as const;
  private channel: RealtimeChannelLike | null = null;
  private lease: Lease | null = null;
  private closed = false;

  /** `getClient` should return the EXISTING app client after ensuring a session (net/backend.ts readyClient). */
  constructor(me: Role, pairId: string, getClient: () => Promise<RealtimeClientLike>) {
    super(me);
    this.statusE.emit('connecting');
    void this.connect(pairId, getClient);
  }

  private async connect(pairId: string, getClient: () => Promise<RealtimeClientLike>) {
    try {
      const client = await getClient();
      if (this.closed) return;
      // One owner per topic (see net/channelRegistry.ts): never reuse a channel that a previous
      // transport is still tearing down.
      const lease = await acquireChannel(client, `pv-pair:${pairId}`, { config: { private: true, presence: { key: this.me }, broadcast: { self: false } } });
      if (this.closed) {
        await lease.release();
        return;
      }
      const ch = lease.channel as RealtimeChannelLike;
      this.lease = lease;
      this.channel = ch;
      const syncPresence = () => {
        if (this.closed) return;
        const state = ch.presenceState();
        // The partner is identified by ROLE inside a private channel that only the two pair
        // members may join (RLS on realtime.messages) — not by order or by count.
        this.setPartner(Object.prototype.hasOwnProperty.call(state, otherRole(this.me)));
      };
      ch.on('presence', { event: 'sync' }, syncPresence)
        .on('broadcast', { event: 'pair' }, (p) => this.receive((p as { payload?: unknown })?.payload))
        .subscribe((status) => {
          if (this.closed) return;
          if (status === 'SUBSCRIBED') {
            // Also fires after every automatic re-join: re-announce ourselves.
            this.statusE.emit('online');
            void ch.track({ role: this.me, at: Date.now() }).catch(() => undefined);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            // Don't declare the partner gone here: the hub applies a grace period, and the next
            // presence sync after the re-join is authoritative.
            this.statusE.emit('error');
          }
        });
    } catch {
      this.statusE.emit('error');
    }
  }

  send(msg: Omit<PairMessage, 'from' | 'at'>) {
    void this.channel?.send({ type: 'broadcast', event: 'pair', payload: this.envelope(msg) }).catch(() => undefined);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.setPartner(false);
    const lease = this.lease;
    this.channel = null;
    this.lease = null;
    if (lease) await lease.release();
    this.statusE.emit('closed');
  }
}
