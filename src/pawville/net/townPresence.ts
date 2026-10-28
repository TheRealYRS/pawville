/**
 * Real-time town presence over a Supabase Realtime channel (presence = who is in town,
 * broadcast `move` ≈ 10/s while walking). Positions are cosmetic, so a public channel is
 * appropriate; nothing private or authoritative travels here. The transport is injected so the
 * wiring can be unit tested without a server.
 */
import { acquireChannel, type RealtimeClientLike } from './channelRegistry.ts';
import {
  MOVE_EVENT, PRESENCE_TOPIC, applySnapshot, compactSnapshot, createSendGate, createTrackBudget, pruneStale, sanitizeSnapshot, snapshotsFromPresence,
  type PlayerSnapshot, type RemoteCat, type WorldSize,
} from './presenceProtocol.ts';

export type PresenceStatus = 'disabled' | 'connecting' | 'online' | 'reconnecting' | 'error';

export interface ChannelLike {
  on(type: string, filter: { event: string }, callback: (payload: unknown) => void): ChannelLike;
  subscribe(callback?: (status: string, err?: Error) => void): ChannelLike;
  track(payload: Record<string, unknown>): Promise<unknown>;
  send(message: { type: 'broadcast'; event: string; payload: unknown }): Promise<unknown>;
  presenceState(): Record<string, unknown>;
  unsubscribe(): Promise<unknown>;
}

export type ChannelFactory = (topic: string, presenceKey: string) => Promise<ChannelLike>;

export interface TownPresenceOptions {
  self: PlayerSnapshot;
  world: WorldSize;
  factory: ChannelFactory;
  onStatus?: (status: PresenceStatus, detail?: string) => void;
  onRosterChange?: (ids: string[]) => void;
  now?: () => number;
}

export interface TownPresence {
  readonly remotes: Map<string, RemoteCat>;
  update(self: PlayerSnapshot): void;
  stop(): Promise<void>;
}

export function startTownPresence(opts: TownPresenceOptions): TownPresence {
  const now = opts.now ?? (() => performance.now());
  const remotes = new Map<string, RemoteCat>();
  const gate = createSendGate(100, 4000);
  const trackGate = createTrackBudget(4, 30_000, 3_000); // 8.1: stay under Supabase's 5 presence calls / 30 s
  let channel: ChannelLike | null = null;
  let subscribed = false;
  let stopped = false;
  let latest = compactSnapshot(opts.self);
  let lastPrune = 0;

  const status = (s: PresenceStatus, detail?: string) => opts.onStatus?.(s, detail);
  const roster = () => {
    const ids = [...remotes.keys()].sort();
    const key = ids.join(',');
    if (key === rosterKey) return; // only notify on real changes
    rosterKey = key;
    opts.onRosterChange?.(ids);
  };

  /** Ids the presence snapshot currently lists (authoritative "who is here"). */
  const present = new Set<string>();
  let rosterKey = '';

  const syncFromPresence = () => {
    if (!channel) return;
    const snaps = snapshotsFromPresence(channel.presenceState(), latest.id, opts.world);
    present.clear();
    for (const s of snaps) present.add(s.id);
    const t = now();
    for (const s of snaps) {
      const r = remotes.get(s.id);
      // New cats come from presence; known cats keep their live position (broadcasts are newer
      // than presence metadata) but refresh their liveness so they are never pruned while present.
      if (!r) applySnapshot(remotes, s, t);
      else r.lastUpdate = Math.max(r.lastUpdate, t);
    }
    for (const id of [...remotes.keys()]) if (!present.has(id)) remotes.delete(id);
    roster();
  };

  status('connecting');
  void (async () => {
    try {
      const ch = await opts.factory(PRESENCE_TOPIC, latest.id);
      if (stopped) {
        void ch.unsubscribe();
        return;
      }
      channel = ch;
      ch.on('presence', { event: 'sync' }, syncFromPresence)
        .on('broadcast', { event: MOVE_EVENT }, (message) => {
          const payload = (message as { payload?: unknown } | null)?.payload;
          const s = sanitizeSnapshot(payload, opts.world);
          if (!s || s.id === latest.id) return; // our own echo never becomes a remote cat
          applySnapshot(remotes, s, now());
          roster();
        })
        .subscribe((state, err) => {
          if (stopped) return;
          if (state === 'SUBSCRIBED') {
            // First subscribe AND every automatic re-join after a network blip: re-announce
            // ourselves; the following presence sync reconciles who is here.
            subscribed = true;
            status('online');
            trackGate.force(now(), latest);
            void ch.track({ ...latest }).catch(() => undefined);
          } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
            // Keep the last known cats while supabase-js re-joins; presence sync will correct them.
            subscribed = false;
            status('reconnecting', err?.message);
          }
        });
    } catch (e) {
      status('error', e instanceof Error ? e.message : String(e));
    }
  })();

  return {
    remotes,
    update(self) {
      latest = compactSnapshot(self);
      const t = now();
      if (t - lastPrune > 2000) {
        lastPrune = t;
        // Only prune cats that presence no longer lists (e.g. broadcast-only ghosts). A cat whose
        // tab is hidden sends no movement but is still present — it must not vanish.
        for (const id of pruneStale(new Map([...remotes].filter(([k]) => !present.has(k))), t)) remotes.delete(id);
        roster();
      }
      if (!channel || !subscribed) return;
      if (gate(t, latest)) void channel.send({ type: 'broadcast', event: MOVE_EVENT, payload: latest }).catch(() => undefined);
      if (!latest.moving && trackGate.want(t, latest)) void channel.track({ ...latest }).catch(() => undefined);
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      subscribed = false;
      remotes.clear();
      present.clear();
      const ch = channel;
      channel = null;
      if (ch) await ch.unsubscribe().catch(() => undefined);
    },
  };
}

/** Wraps a supabase-js RealtimeChannel so `unsubscribe` also removes it from its client. */
export function wrapChannel(client: { removeChannel(c: unknown): Promise<unknown> }, channel: unknown): ChannelLike {
  const raw = channel as ChannelLike;
  const wrapped: ChannelLike = {
    on: (type, filter, cb) => { raw.on(type, filter, cb); return wrapped; },
    subscribe: (cb) => { raw.subscribe(cb); return wrapped; },
    track: (payload) => raw.track(payload),
    send: (message) => raw.send(message),
    presenceState: () => raw.presenceState(),
    unsubscribe: () => client.removeChannel(channel),
  };
  return wrapped;
}

/**
 * Preferred transport: the EXISTING Paw vs Paw client (see backend.ts).
 * Fallback (documented): if that client can't be resolved, a session-less client with
 * persistSession=false is used for this PUBLIC, cosmetic channel only. It never signs in, so it
 * cannot interfere with the Paw vs Paw session or token refresh.
 */
export function presenceChannelFactory(url: string, publicKey: string, existing: RealtimeClientLike | null): ChannelFactory {
  return async (topic, presenceKey) => {
    const config = { config: { presence: { key: presenceKey }, broadcast: { self: false, ack: false } } };
    if (existing) return leasedChannel(await acquireChannel(existing, topic, config));
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(url, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'pawville-plaza' },
      realtime: { params: { eventsPerSecond: 20 } },
    });
    return leasedChannel(await acquireChannel(client as unknown as RealtimeClientLike, topic, config));
  };
}

/** A ChannelLike whose `unsubscribe` releases exactly the leased channel (never a newer owner's). */
export function leasedChannel(lease: { channel: unknown; release(): Promise<void> }): ChannelLike {
  const raw = lease.channel as ChannelLike;
  const wrapped: ChannelLike = {
    on: (type, filter, cb) => { raw.on(type, filter, cb); return wrapped; },
    subscribe: (cb) => { raw.subscribe(cb); return wrapped; },
    track: (payload) => raw.track(payload),
    send: (message) => raw.send(message),
    presenceState: () => raw.presenceState(),
    unsubscribe: () => lease.release(),
  };
  return wrapped;
}
