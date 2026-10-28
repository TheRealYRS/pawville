import { boardFromString } from '../game/gameRules';
import type { Accessory, MatchState, RoomStatus, Seat, WinLine, Winner } from '../game/types';
import { getSupabase } from './supabaseClient';

/** Shape of a public.rooms row as returned by RPCs (to_jsonb) and Realtime. */
export interface RoomRow {
  id: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  status: RoomStatus;
  board: string;
  turn: Seat;
  starting_seat: Seat;
  winner: Winner;
  winning_line: number[] | null;
  history: number[] | null;
  move_count: number;
  last_move_cell: number | null;
  last_move_seat: Seat | null;
  round: number;
  score_t: number;
  score_m: number;
  draws: number;
  games_played: number;
  rematch_t: number | null;
  rematch_m: number | null;
  rematch_declined_by: Seat | null;
  rematch_declined_round: number | null;
  players_version: number;
  version: number;
}

export interface OnlineRoom {
  id: string;
  match: MatchState;
  expiresAt: number;
  playersVersion: number;
}

export interface PlayerInfo {
  seat: Seat;
  nickname: string;
  accessory: Accessory;
  joinedAt: string;
  leftAt: string | null;
}

export type JoinOutcome =
  | { outcome: 'created' | 'joined' | 'rejoined'; seat: Seat; room: OnlineRoom }
  | { outcome: 'full' | 'not_found' | 'expired' };

export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{16,32}$/;

export function isValidRoomId(id: string): boolean {
  return ROOM_ID_PATTERN.test(id);
}

export function mapRoomRow(row: RoomRow): OnlineRoom {
  const line = row.winning_line;
  return {
    id: row.id,
    expiresAt: Date.parse(row.expires_at),
    playersVersion: Number(row.players_version),
    match: {
      board: boardFromString(row.board),
      turn: row.turn,
      startingSeat: row.starting_seat,
      status: row.status,
      winner: row.winner,
      winningLine: line && line.length === 3 ? ([line[0], line[1], line[2]] as WinLine) : null,
      round: row.round,
      history: row.history ?? [],
      lastMoveCell: row.last_move_cell,
      lastMoveSeat: row.last_move_seat,
      score: { T: row.score_t, M: row.score_m, draws: row.draws, games: row.games_played },
      rematch: {
        T: row.rematch_t,
        M: row.rematch_m,
        declinedBy: row.rematch_declined_by,
        declinedRound: row.rematch_declined_round,
      },
      version: Number(row.version),
    },
  };
}

/** Error codes raised by the SQL functions, plus transport failures. */
export type ServerErrorCode =
  | 'not_authenticated' | 'room_not_found' | 'not_a_player' | 'room_expired'
  | 'waiting_for_opponent' | 'game_over' | 'not_your_turn' | 'cell_taken' | 'invalid_cell'
  | 'stale_rematch' | 'opponent_left' | 'invalid_reaction' | 'slow_down' | 'rate_limited'
  | 'network' | 'unknown';

const KNOWN: ServerErrorCode[] = [
  'not_authenticated', 'room_not_found', 'not_a_player', 'room_expired', 'waiting_for_opponent',
  'game_over', 'not_your_turn', 'cell_taken', 'invalid_cell', 'stale_rematch', 'opponent_left',
  'invalid_reaction', 'slow_down', 'rate_limited',
];

export class ServerError extends Error {
  readonly code: ServerErrorCode;
  constructor(code: ServerErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

function toServerError(err: { message?: string } | null | undefined): ServerError {
  const msg = err?.message ?? '';
  const known = KNOWN.find((k) => msg.includes(k));
  if (known) return new ServerError(known, msg);
  if (/fetch|network|Failed to|timeout|ECONN|Load failed/i.test(msg)) return new ServerError('network', msg);
  return new ServerError('unknown', msg);
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let res;
  try {
    res = await getSupabase().rpc(fn, args);
  } catch (e) {
    throw new ServerError('network', e instanceof Error ? e.message : String(e));
  }
  if (res.error) throw toServerError(res.error);
  return res.data as T;
}

type RawJoin = { outcome: string; seat?: Seat; room?: RoomRow };

function mapJoin(raw: RawJoin): JoinOutcome {
  if ((raw.outcome === 'created' || raw.outcome === 'joined' || raw.outcome === 'rejoined') && raw.room && raw.seat) {
    return { outcome: raw.outcome, seat: raw.seat, room: mapRoomRow(raw.room) };
  }
  if (raw.outcome === 'full' || raw.outcome === 'expired') return { outcome: raw.outcome };
  return { outcome: 'not_found' };
}

export async function createRoom(nickname: string, accessory: Accessory): Promise<JoinOutcome> {
  return mapJoin(await rpc<RawJoin>('create_room', { p_nickname: nickname, p_accessory: accessory }));
}

export async function joinRoom(roomId: string, nickname: string, accessory: Accessory): Promise<JoinOutcome> {
  if (!isValidRoomId(roomId)) return { outcome: 'not_found' };
  return mapJoin(await rpc<RawJoin>('join_room', { p_room_id: roomId, p_nickname: nickname, p_accessory: accessory }));
}

export async function makeMove(roomId: string, cell: number): Promise<OnlineRoom> {
  return mapRoomRow(await rpc<RoomRow>('make_move', { p_room_id: roomId, p_cell: cell }));
}

export async function requestRematch(roomId: string, round: number): Promise<OnlineRoom> {
  return mapRoomRow(await rpc<RoomRow>('request_rematch', { p_room_id: roomId, p_round: round }));
}

export async function declineRematch(roomId: string, round: number): Promise<OnlineRoom> {
  return mapRoomRow(await rpc<RoomRow>('decline_rematch', { p_room_id: roomId, p_round: round }));
}

export async function leaveRoom(roomId: string): Promise<void> {
  await rpc<unknown>('leave_room', { p_room_id: roomId });
}

export async function setAppearance(roomId: string, accessory: Accessory): Promise<OnlineRoom> {
  return mapRoomRow(await rpc<RoomRow>('set_appearance', { p_room_id: roomId, p_accessory: accessory }));
}

export async function sendReaction(roomId: string, kind: string): Promise<void> {
  await rpc<unknown>('send_reaction', { p_room_id: roomId, p_kind: kind });
}

/** Reads go straight to the tables; RLS limits them to rooms the caller belongs to. */
export async function fetchRoom(roomId: string): Promise<OnlineRoom | null> {
  try {
    const { data, error } = await getSupabase().from('rooms').select('*').eq('id', roomId).maybeSingle();
    if (error) throw toServerError(error);
    return data ? mapRoomRow(data as unknown as RoomRow) : null;
  } catch (e) {
    if (e instanceof ServerError) throw e;
    throw new ServerError('network');
  }
}

export async function fetchPlayers(roomId: string): Promise<PlayerInfo[]> {
  try {
    const { data, error } = await getSupabase()
      .from('room_players')
      .select('seat, nickname, accessory, joined_at, left_at')
      .eq('room_id', roomId);
    if (error) throw toServerError(error);
    return (data ?? []).map((p) => ({
      seat: p.seat as Seat,
      nickname: String(p.nickname),
      accessory: p.accessory as Accessory,
      joinedAt: String(p.joined_at),
      leftAt: (p.left_at as string | null) ?? null,
    }));
  } catch (e) {
    if (e instanceof ServerError) throw e;
    throw new ServerError('network');
  }
}
