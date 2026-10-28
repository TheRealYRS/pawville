import { useCallback, useEffect, useRef, useState } from 'react';
import { validateMove } from '../game/matchEngine';
import type { Accessory, ReactionKind, Seat } from '../game/types';
import { subscribeToRoom, type LinkStatus } from '../lib/multiplayerService';
import { loadPreferences, savePreferences } from '../lib/preferences';
import {
  ServerError, declineRematch, fetchPlayers, fetchRoom, joinRoom, leaveRoom, makeMove, mapRoomRow,
  requestRematch, sendReaction, setAppearance, type OnlineRoom, type PlayerInfo, type ServerErrorCode,
} from '../lib/roomService';
import { ensureSession } from '../lib/sessionService';
import { isSupabaseConfigured } from '../lib/supabaseClient';

export type RoomErrorReason = 'not_found' | 'expired' | 'full' | 'backend' | 'anonymous_disabled' | 'not_configured';

export type RoomPhase =
  | { kind: 'connecting' }
  | { kind: 'error'; reason: RoomErrorReason }
  | { kind: 'ready' };

export interface FloatingReaction {
  key: string;
  seat: Seat;
  kind: ReactionKind;
}

export interface MoveFeedback {
  ok: boolean;
  error?: string;
}

const REACTION_COOLDOWN_MS = 1300;
const FLOAT_MS = 1800;

export function useOnlineRoom(roomId: string, onError: (code: string) => void) {
  const [phase, setPhase] = useState<RoomPhase>({ kind: 'connecting' });
  const [room, setRoom] = useState<OnlineRoom | null>(null);
  const [players, setPlayers] = useState<Partial<Record<Seat, PlayerInfo>>>({});
  const [mySeat, setMySeat] = useState<Seat | null>(null);
  const [link, setLink] = useState<LinkStatus>('connecting');
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [presence, setPresence] = useState<Set<Seat> | null>(null);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [pendingCell, setPendingCell] = useState<number | null>(null);
  const [busy, setBusy] = useState<null | 'rematch' | 'decline' | 'leave' | 'appearance'>(null);
  const [attempt, setAttempt] = useState(0);

  const roomRef = useRef<OnlineRoom | null>(null);
  const mySeatRef = useRef<Seat | null>(null);
  const linkRef = useRef<LinkStatus>('connecting');
  const everLiveRef = useRef(false);
  const lastReactionRef = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const refreshPlayers = useCallback(async () => {
    try {
      const list = await fetchPlayers(roomId);
      const map: Partial<Record<Seat, PlayerInfo>> = {};
      list.forEach((p) => { map[p.seat] = p; });
      setPlayers(map);
    } catch {
      /* transient; next resync will fix it */
    }
  }, [roomId]);

  /** Single entry point for authoritative state. Older or duplicate versions are ignored. */
  const applyRoom = useCallback((next: OnlineRoom) => {
    const cur = roomRef.current;
    if (cur && next.match.version <= cur.match.version) return;
    roomRef.current = next;
    setRoom(next);
    if (!cur || next.playersVersion !== cur.playersVersion) void refreshPlayers();
  }, [refreshPlayers]);

  const updateLink = useCallback((s: LinkStatus) => {
    const prev = linkRef.current;
    linkRef.current = s;
    setLink(s);
    if (s === 'live' && prev === 'reconnecting' && everLiveRef.current) setRestoredAt(Date.now());
    if (s === 'live') everLiveRef.current = true;
  }, []);

  const resync = useCallback(async () => {
    try {
      const r = await fetchRoom(roomId);
      if (!r) {
        setPhase({ kind: 'error', reason: 'expired' });
        return;
      }
      applyRoom(r);
      await refreshPlayers();
      if (!navigator.onLine) updateLink('reconnecting');
    } catch {
      updateLink('reconnecting');
    }
  }, [roomId, applyRoom, refreshPlayers, updateLink]);

  const addReaction = useCallback((seat: Seat, kind: ReactionKind, key: string) => {
    setReactions((list) => (list.some((r) => r.key === key) ? list : [...list.slice(-5), { key, seat, kind }]));
    window.setTimeout(() => setReactions((list) => list.filter((r) => r.key !== key)), FLOAT_MS);
  }, []);

  // Join (or re-join) + subscribe.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    roomRef.current = null;
    everLiveRef.current = false;
    setRoom(null);
    setPlayers({});
    setMySeat(null);
    setPhase({ kind: 'connecting' });

    (async () => {
      if (!isSupabaseConfigured) {
        setPhase({ kind: 'error', reason: 'not_configured' });
        return;
      }
      try {
        await ensureSession();
      } catch (e) {
        if (!cancelled) {
          setPhase({ kind: 'error', reason: e instanceof Error && e.message === 'anonymous_disabled' ? 'anonymous_disabled' : 'backend' });
        }
        return;
      }

      const prefs = loadPreferences();
      let res;
      try {
        res = await joinRoom(roomId, prefs.nickname, prefs.accessory);
      } catch {
        if (!cancelled) setPhase({ kind: 'error', reason: 'backend' });
        return;
      }
      if (cancelled) return;

      if (!('seat' in res)) {
        if (res.outcome !== 'full' && prefs.lastRoomId === roomId) savePreferences({ lastRoomId: null });
        setPhase({ kind: 'error', reason: res.outcome });
        return;
      }
      const seat = res.seat;

      savePreferences({ lastRoomId: roomId });
      mySeatRef.current = seat;
      setMySeat(seat);
      applyRoom(res.room);
      await refreshPlayers();
      if (cancelled) return;
      setPhase({ kind: 'ready' });

      unsubscribe = subscribeToRoom(roomId, seat, {
        onRoomRow: (row) => {
          try { applyRoom(mapRoomRow(row)); } catch { void resync(); }
        },
        onReaction: (ev) => {
          if (ev.seat === mySeatRef.current) return; // already shown locally
          addReaction(ev.seat, ev.kind, `srv-${ev.id}`);
        },
        onStatus: updateLink,
        onResync: () => { void resync(); },
        onPresence: setPresence,
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [roomId, attempt, applyRoom, refreshPlayers, resync, updateLink, addReaction]);

  const fail = useCallback((e: unknown) => {
    const code: ServerErrorCode = e instanceof ServerError ? e.code : 'unknown';
    if (code === 'room_expired' || code === 'room_not_found') setPhase({ kind: 'error', reason: 'expired' });
    if (code === 'network') updateLink('reconnecting');
    onErrorRef.current(code);
    void resync();
    return code;
  }, [resync, updateLink]);

  const move = useCallback(async (cell: number): Promise<MoveFeedback> => {
    const r = roomRef.current;
    const seat = mySeatRef.current;
    if (!r || !seat) return { ok: false, error: 'unknown' };
    const localError = validateMove(r.match, seat, cell);
    if (localError) return { ok: false, error: localError }; // quick feedback; the server re-validates anyway
    setPendingCell(cell);
    try {
      applyRoom(await makeMove(roomId, cell));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: fail(e) };
    } finally {
      setPendingCell(null);
    }
  }, [roomId, applyRoom, fail]);

  const rematch = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    setBusy('rematch');
    try { applyRoom(await requestRematch(roomId, r.match.round)); }
    catch (e) { fail(e); }
    finally { setBusy(null); }
  }, [roomId, applyRoom, fail]);

  const decline = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    setBusy('decline');
    try { applyRoom(await declineRematch(roomId, r.match.round)); }
    catch (e) { fail(e); }
    finally { setBusy(null); }
  }, [roomId, applyRoom, fail]);

  const leave = useCallback(async () => {
    setBusy('leave');
    savePreferences({ lastRoomId: null });
    try { await leaveRoom(roomId); } catch { /* leaving locally anyway */ }
    setBusy(null);
  }, [roomId]);

  const react = useCallback(async (kind: ReactionKind) => {
    const seat = mySeatRef.current;
    if (!seat) return;
    const now = Date.now();
    if (now - lastReactionRef.current < REACTION_COOLDOWN_MS) {
      onErrorRef.current('slow_down');
      return;
    }
    lastReactionRef.current = now;
    addReaction(seat, kind, `local-${now}`);
    try { await sendReaction(roomId, kind); }
    catch (e) { onErrorRef.current(e instanceof ServerError ? e.code : 'unknown'); }
  }, [roomId, addReaction]);

  const changeAccessory = useCallback(async (accessory: Accessory) => {
    savePreferences({ accessory });
    setBusy('appearance');
    try { applyRoom(await setAppearance(roomId, accessory)); await refreshPlayers(); }
    catch (e) { fail(e); }
    finally { setBusy(null); }
  }, [roomId, applyRoom, refreshPlayers, fail]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    phase, room, players, mySeat, link, restoredAt, presence, reactions, pendingCell, busy,
    move, rematch, decline, leave, react, changeAccessory, retry,
  };
}
