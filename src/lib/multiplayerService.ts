import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ReactionKind, Seat } from '../game/types';
import type { RoomRow } from './roomService';
import { getSupabase } from './supabaseClient';

export type LinkStatus = 'connecting' | 'live' | 'reconnecting';

export interface ReactionEvent {
  id: number;
  seat: Seat;
  kind: ReactionKind;
  createdAt: string;
}

export interface RoomSubscriptionHandlers {
  onRoomRow(row: RoomRow): void;
  onReaction(event: ReactionEvent): void;
  onStatus(status: LinkStatus): void;
  /** Called every time the data channel (re)subscribes: refetch to fill any gap. */
  onResync(): void;
  /** Seats currently present, or null when presence is unavailable. */
  onPresence(seats: Set<Seat> | null): void;
}

/**
 * Two channels per room:
 *  1. `room-db:<id>:<nonce>` — postgres_changes for rooms + reactions. Delivery is filtered
 *     by RLS on the server, so only members receive anything.
 *  2. `pvp:<id>` — a PRIVATE channel used only for presence (who is online).
 *     Authorised by policies on realtime.messages. If it fails, the game still works.
 */
export function subscribeToRoom(roomId: string, mySeat: Seat, handlers: RoomSubscriptionHandlers): () => void {
  const supabase = getSupabase();
  let disposed = false;

  const db: RealtimeChannel = supabase
    .channel(`room-db:${roomId}:${Math.random().toString(36).slice(2, 10)}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      (payload) => { if (!disposed) handlers.onRoomRow(payload.new as RoomRow); },
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'reactions', filter: `room_id=eq.${roomId}` },
      (payload) => {
        if (disposed) return;
        const r = payload.new as { id: number; seat: Seat; kind: ReactionKind; created_at: string };
        handlers.onReaction({ id: r.id, seat: r.seat, kind: r.kind, createdAt: r.created_at });
      },
    )
    .subscribe((status) => {
      if (disposed) return;
      if (status === 'SUBSCRIBED') {
        handlers.onStatus('live');
        handlers.onResync();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        handlers.onStatus('reconnecting'); // supabase-js retries with backoff automatically
      }
    });

  // Presence is optional: if the private channel can't be set up, the game still works.
  let presence: RealtimeChannel | null = null;
  try {
    const ch = supabase.channel(`pvp:${roomId}`, { config: { private: true, presence: { key: mySeat } } });
    presence = ch;
    ch
      .on('presence', { event: 'sync' }, () => {
        if (disposed) return;
        const state = ch.presenceState();
        handlers.onPresence(new Set(Object.keys(state).filter((k): k is Seat => k === 'T' || k === 'M')));
      })
      .subscribe((status) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          void ch.track({ seat: mySeat, at: Date.now() }).catch(() => handlers.onPresence(null));
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          handlers.onPresence(null);
        }
      });
  } catch {
    handlers.onPresence(null);
  }

  // Browser-level signals: resync immediately when the network or tab comes back.
  const onOnline = () => handlers.onResync();
  const onOffline = () => handlers.onStatus('reconnecting');
  const onVisible = () => { if (document.visibilityState === 'visible') handlers.onResync(); };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    disposed = true;
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    document.removeEventListener('visibilitychange', onVisible);
    void supabase.removeChannel(db);
    if (presence) {
      void presence.untrack().catch(() => undefined);
      void supabase.removeChannel(presence);
    }
  };
}
