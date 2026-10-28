#!/usr/bin/env node
/**
 * Paw vs Paw — live backend smoke test.
 *
 * Runs against YOUR real Supabase project using only the public publishable/anon key.
 * Creates three independent anonymous sessions (Player A, Player B, Intruder C) and verifies:
 *   room creation, joining, seat assignment, RLS isolation, direct-write denial, turn validation,
 *   concurrent same-square claims, realtime delivery, win detection, post-game moves, rematch voting,
 *   stale rematch votes, score tracking, reaction rate limiting, leaving.
 *
 * Usage:  npm run smoke   (reads VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY
 *                          from the environment or .env.local)
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).');
  process.exit(1);
}

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function player(label) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session) {
    throw new Error(`${label}: anonymous sign-in failed (${error?.message}). Enable Anonymous Sign-ins in Supabase → Authentication.`);
  }
  await client.realtime.setAuth(data.session.access_token);
  return client;
}

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args);
  return { data, error: error?.message ?? null };
}

const errIs = (r, code) => typeof r.error === 'string' && r.error.includes(code);

console.log(`\nPaw vs Paw smoke test → ${url}\n`);

const A = await player('A');
const B = await player('B');
const C = await player('C');
console.log('Sessions: 3 anonymous users signed in.');

// 1. Create
const created = await rpc(A, 'create_room', { p_nickname: 'Smoke A', p_accessory: 'crown' });
check('A creates a room as Tangerine', !created.error && created.data?.seat === 'T', created.error ?? '');
const roomId = created.data?.room?.id;
check('Room id is long and unguessable', typeof roomId === 'string' && roomId.length >= 16, roomId);
if (!roomId) process.exit(1);

// 2. Isolation before joining
const peek = await C.from('rooms').select('*').eq('id', roomId);
check('Non-member cannot read the room (RLS)', !peek.error && Array.isArray(peek.data) && peek.data.length === 0, JSON.stringify(peek.error ?? peek.data));
const earlyMove = await rpc(A, 'make_move', { p_room_id: roomId, p_cell: 0 });
check('No moves before an opponent joins', errIs(earlyMove, 'waiting_for_opponent'), earlyMove.error ?? 'accepted');

// 3. Join / rejoin / full / missing
const joined = await rpc(B, 'join_room', { p_room_id: roomId, p_nickname: 'Smoke B', p_accessory: 'wizard' });
check('B joins as Midnight', joined.data?.outcome === 'joined' && joined.data?.seat === 'M', JSON.stringify(joined));
const rejoin = await rpc(B, 'join_room', { p_room_id: roomId, p_nickname: 'Smoke B', p_accessory: 'wizard' });
check('B re-joining (refresh) keeps the same seat', rejoin.data?.outcome === 'rejoined' && rejoin.data?.seat === 'M', JSON.stringify(rejoin.data));
const full = await rpc(C, 'join_room', { p_room_id: roomId, p_nickname: 'Intruder', p_accessory: 'none' });
check('Third visitor gets "full"', full.data?.outcome === 'full', JSON.stringify(full.data));
const missing = await rpc(C, 'join_room', { p_room_id: 'nope_nope_nope_nope_00', p_nickname: 'x', p_accessory: 'none' });
check('Unknown room returns not_found', missing.data?.outcome === 'not_found', JSON.stringify(missing.data));

const realtimeEvents = [];
const channel = B.channel(`smoke:${roomId}`)
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (p) => realtimeEvents.push(p.new));
const subscribed = await new Promise((resolve) => {
  const t = setTimeout(() => resolve(false), 10000);
  channel.subscribe((status) => { if (status === 'SUBSCRIBED') { clearTimeout(t); resolve(true); } });
});
check('B subscribes to realtime room updates', subscribed);

// 4. Intruder attacks
const intruderMove = await rpc(C, 'make_move', { p_room_id: roomId, p_cell: 0 });
check('Intruder cannot move', errIs(intruderMove, 'not_a_player'), intruderMove.error ?? 'accepted!');
const directUpdate = await A.from('rooms').update({ board: 'TTT......', winner: 'T' }).eq('id', roomId).select();
check('Players cannot write the rooms table directly', !!directUpdate.error || (directUpdate.data ?? []).length === 0, JSON.stringify(directUpdate.data));
const directInsert = await C.from('room_players').insert({ room_id: roomId, seat: 'M', user_id: '00000000-0000-0000-0000-000000000000', nickname: 'hax' });
check('Nobody can insert themselves into a seat directly', !!directInsert.error);

// 5. Turn validation + concurrency
const outOfTurn = await rpc(B, 'make_move', { p_room_id: roomId, p_cell: 0 });
check('Out-of-turn move is rejected', errIs(outOfTurn, 'not_your_turn'), outOfTurn.error ?? 'accepted!');
const [r1, r2] = await Promise.all([
  rpc(A, 'make_move', { p_room_id: roomId, p_cell: 4 }),
  rpc(A, 'make_move', { p_room_id: roomId, p_cell: 4 }),
]);
check('Two simultaneous claims of one square: exactly one succeeds', [r1, r2].filter((r) => !r.error).length === 1, `${r1.error} / ${r2.error}`);
const taken = await rpc(B, 'make_move', { p_room_id: roomId, p_cell: 4 });
check('Occupied square is rejected', errIs(taken, 'cell_taken'), taken.error ?? 'accepted!');
const badCell = await rpc(B, 'make_move', { p_room_id: roomId, p_cell: 9 });
check('Out-of-range square is rejected', errIs(badCell, 'invalid_cell'), badCell.error ?? 'accepted!');

await new Promise((r) => setTimeout(r, 2500));
check('Realtime delivered A\'s move to B', realtimeEvents.some((row) => row.board?.[4] === 'T'), `${realtimeEvents.length} events`);

// 6. Play to a win: T 4, M 0, T 2, M 1, T 6  (T wins on 2-4-6)
for (const [client, cell] of [[B, 0], [A, 2], [B, 1]]) await rpc(client, 'make_move', { p_room_id: roomId, p_cell: cell });
const win = await rpc(A, 'make_move', { p_room_id: roomId, p_cell: 6 });
check('Winning move detected', win.data?.winner === 'T' && win.data?.status === 'finished', JSON.stringify(win.data?.winning_line));
check('Score incremented exactly once', win.data?.score_t === 1 && win.data?.games_played === 1);
const afterEnd = await rpc(B, 'make_move', { p_room_id: roomId, p_cell: 8 });
check('Move after game end is rejected', errIs(afterEnd, 'game_over'), afterEnd.error ?? 'accepted!');

// 7. Rematch
const stale = await rpc(A, 'request_rematch', { p_room_id: roomId, p_round: 0 });
check('Stale rematch vote is rejected', errIs(stale, 'stale_rematch'), stale.error ?? 'accepted!');
const voteA = await rpc(A, 'request_rematch', { p_room_id: roomId, p_round: 1 });
check('One vote does not reset the board', voteA.data?.status === 'finished' && voteA.data?.rematch_t === 1);
const declineB = await rpc(B, 'decline_rematch', { p_room_id: roomId, p_round: 1 });
check('Decline is recorded without resetting', declineB.data?.rematch_declined_by === 'M' && declineB.data?.status === 'finished');
const voteB = await rpc(B, 'request_rematch', { p_room_id: roomId, p_round: 1 });
check('Both votes start round 2', voteB.data?.round === 2 && voteB.data?.status === 'playing' && voteB.data?.board === '.........');
check('Starting cat alternates (Midnight starts round 2)', voteB.data?.turn === 'M');
check('Score survives the rematch', voteB.data?.score_t === 1);

// 8. Reactions
const react1 = await rpc(A, 'send_reaction', { p_room_id: roomId, p_kind: 'love' });
const react2 = await rpc(A, 'send_reaction', { p_room_id: roomId, p_kind: 'love' });
check('Reaction accepted', !react1.error, react1.error ?? '');
check('Reaction spam is rate limited', errIs(react2, 'slow_down'), react2.error ?? 'accepted!');
const badReact = await rpc(A, 'send_reaction', { p_room_id: roomId, p_kind: '<script>' });
check('Unknown reaction rejected', errIs(badReact, 'invalid_reaction'));

// 9. Leave
const left = await rpc(B, 'leave_room', { p_room_id: roomId });
check('B can leave', !left.error, left.error ?? '');
const seen = await A.from('room_players').select('seat, nickname, left_at').eq('room_id', roomId);
check('A sees that Midnight left', (seen.data ?? []).some((p) => p.seat === 'M' && p.left_at), JSON.stringify(seen.data));
const leakCheck = await A.from('room_players').select('user_id').eq('room_id', roomId);
check('Opponent user ids are not readable', !!leakCheck.error);

await B.removeChannel(channel);
console.log(`\n${passed} passed, ${failed} failed.\n`);
process.exit(failed ? 1 : 0);
