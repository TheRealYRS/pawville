-- =============================================================================
-- Paw vs Paw — core schema, security policies and authoritative game RPCs
-- =============================================================================
-- Design:
--   * Every browser gets a Supabase *anonymous* auth session (role = authenticated).
--   * Clients can only READ rows of rooms they are a member of (RLS).
--   * Clients can NEVER write tables directly. All state changes go through
--     SECURITY DEFINER functions below, which lock the room row (FOR UPDATE),
--     validate the caller's seat and the move, and bump a version number.
--   * Seats ('T' = Tangerine, 'M' = Midnight) are bound to auth.uid(), so knowing a
--     room id does not let anyone impersonate a player or overwrite the board.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.rooms (
  id                     text primary key check (id ~ '^[A-Za-z0-9_-]{16,32}$'),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  expires_at             timestamptz not null default now() + interval '2 hours',
  status                 text not null default 'waiting'
                           check (status in ('waiting', 'playing', 'finished', 'closed')),
  board                  text not null default '.........' check (board ~ '^[.TM]{9}$'),
  turn                   text not null default 'T' check (turn in ('T', 'M')),
  starting_seat          text not null default 'T' check (starting_seat in ('T', 'M')),
  winner                 text check (winner in ('T', 'M', 'D')),
  winning_line           smallint[],
  history                smallint[] not null default '{}',
  move_count             smallint not null default 0 check (move_count between 0 and 9),
  last_move_cell         smallint check (last_move_cell between 0 and 8),
  last_move_seat         text check (last_move_seat in ('T', 'M')),
  round                  integer not null default 1 check (round >= 1),
  score_t                integer not null default 0 check (score_t >= 0),
  score_m                integer not null default 0 check (score_m >= 0),
  draws                  integer not null default 0 check (draws >= 0),
  games_played           integer not null default 0 check (games_played >= 0),
  rematch_t              integer,           -- round number Tangerine voted a rematch for
  rematch_m              integer,           -- round number Midnight voted a rematch for
  rematch_declined_by    text check (rematch_declined_by in ('T', 'M')),
  rematch_declined_round integer,
  players_version        integer not null default 1,
  version                bigint  not null default 1,
  constraint history_matches_count check (coalesce(array_length(history, 1), 0) = move_count)
);

create index if not exists rooms_expires_at_idx on public.rooms (expires_at);

create table if not exists public.room_players (
  room_id    text not null references public.rooms (id) on delete cascade,
  seat       text not null check (seat in ('T', 'M')),
  user_id    uuid not null,
  nickname   text not null check (char_length(nickname) between 1 and 16),
  accessory  text not null default 'none'
               check (accessory in ('none', 'crown', 'bow', 'wizard', 'bell')),
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  primary key (room_id, seat),
  unique (room_id, user_id)
);

create index if not exists room_players_user_idx on public.room_players (user_id, joined_at desc);

-- Append-only move log. The unique constraints are a second, database-level guarantee
-- that a square can only be claimed once per round and move numbers never collide.
create table if not exists public.moves (
  room_id    text not null references public.rooms (id) on delete cascade,
  round      integer not null,
  move_no    smallint not null check (move_no between 1 and 9),
  cell       smallint not null check (cell between 0 and 8),
  seat       text not null check (seat in ('T', 'M')),
  created_at timestamptz not null default now(),
  primary key (room_id, round, move_no),
  unique (room_id, round, cell)
);

create table if not exists public.reactions (
  id         bigint generated always as identity primary key,
  room_id    text not null references public.rooms (id) on delete cascade,
  seat       text not null check (seat in ('T', 'M')),
  kind       text not null check (kind in ('mischief', 'love', 'laugh', 'shock', 'wave', 'sad')),
  created_at timestamptz not null default now()
);

create index if not exists reactions_room_seat_idx on public.reactions (room_id, seat, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_room_member(p_room_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_players
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

-- Returns the outcome of a board: winner 'T' | 'M' | 'D' (draw) | null (in progress)
create or replace function public.pvp_outcome(p_board text, out o_winner text, out o_line smallint[])
language plpgsql
immutable
set search_path = public
as $$
declare
  lines int[] := array[0,1,2, 3,4,5, 6,7,8, 0,3,6, 1,4,7, 2,5,8, 0,4,8, 2,4,6];
  i int;
  a text;
begin
  o_winner := null;
  o_line := null;
  for i in 0..7 loop
    a := substr(p_board, lines[i * 3 + 1] + 1, 1);
    if a <> '.'
       and a = substr(p_board, lines[i * 3 + 2] + 1, 1)
       and a = substr(p_board, lines[i * 3 + 3] + 1, 1) then
      o_winner := a;
      o_line := array[lines[i * 3 + 1], lines[i * 3 + 2], lines[i * 3 + 3]]::smallint[];
      return;
    end if;
  end loop;
  if position('.' in p_board) = 0 then
    o_winner := 'D';
  end if;
end;
$$;

create or replace function public.pvp_clean_nickname(p_nickname text, p_default text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text;
begin
  v := regexp_replace(coalesce(p_nickname, ''), '[^[:alnum:] _.!?''-]', '', 'g');
  v := btrim(regexp_replace(v, '\s+', ' ', 'g'));
  v := left(v, 16);
  if char_length(v) = 0 then
    return p_default;
  end if;
  return v;
end;
$$;

create or replace function public.pvp_clean_accessory(p_accessory text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_accessory in ('none', 'crown', 'bow', 'wizard', 'bell') then p_accessory else 'none' end;
$$;

create or replace function public.pvp_require_uid()
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'not_authenticated';
  end if;
  return v;
end;
$$;

-- Removes long-abandoned rooms. Called opportunistically from create_room and
-- optionally from pg_cron (see bottom of file).
create or replace function public.cleanup_expired_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with doomed as (
    select id from public.rooms
    where expires_at < now() - interval '1 hour'
    limit 200
  )
  delete from public.rooms r using doomed d where r.id = d.id;
  get diagnostics n = row_count;

  delete from public.reactions where created_at < now() - interval '30 minutes';
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: create_room
-- ---------------------------------------------------------------------------
create or replace function public.create_room(p_nickname text default null, p_accessory text default 'none')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := public.pvp_require_uid();
  v_id   text;
  v_room public.rooms%rowtype;
  v_recent integer;
begin
  -- Anti-spam: at most 8 rooms per anonymous session per 10 minutes.
  select count(*) into v_recent
  from public.room_players
  where user_id = v_uid and seat = 'T' and joined_at > now() - interval '10 minutes';
  if v_recent >= 8 then
    raise exception 'rate_limited';
  end if;

  perform public.cleanup_expired_rooms();

  -- 128-bit random id, base64url encoded (22 chars). Retry on the (astronomically
  -- unlikely) collision.
  loop
    v_id := translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_');
    insert into public.rooms (id) values (v_id)
    on conflict (id) do nothing
    returning * into v_room;
    exit when found;
  end loop;

  insert into public.room_players (room_id, seat, user_id, nickname, accessory)
  values (v_id, 'T', v_uid,
          public.pvp_clean_nickname(p_nickname, 'Tangerine'),
          public.pvp_clean_accessory(p_accessory));

  return jsonb_build_object('outcome', 'created', 'seat', 'T', 'room', to_jsonb(v_room));
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: join_room  (also used to RE-join after refresh / new tab)
-- ---------------------------------------------------------------------------
create or replace function public.join_room(p_room_id text, p_nickname text default null, p_accessory text default 'none')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := public.pvp_require_uid();
  v_room public.rooms%rowtype;
  v_seat text;
begin
  if p_room_id is null or p_room_id !~ '^[A-Za-z0-9_-]{16,32}$' then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select seat into v_seat from public.room_players where room_id = p_room_id and user_id = v_uid;

  if v_room.expires_at < now() or v_room.status = 'closed' then
    return jsonb_build_object('outcome', 'expired', 'seat', v_seat);
  end if;

  if v_seat is not null then
    -- Returning player (refresh, reconnect, second tab, or came back after leaving).
    update public.room_players set left_at = null
    where room_id = p_room_id and seat = v_seat and left_at is not null;
    if found then
      update public.rooms
      set players_version = players_version + 1, version = version + 1, updated_at = now()
      where id = p_room_id
      returning * into v_room;
    end if;
    return jsonb_build_object('outcome', 'rejoined', 'seat', v_seat, 'room', to_jsonb(v_room));
  end if;

  if exists (select 1 from public.room_players where room_id = p_room_id and seat = 'M') then
    return jsonb_build_object('outcome', 'full');
  end if;

  insert into public.room_players (room_id, seat, user_id, nickname, accessory)
  values (p_room_id, 'M', v_uid,
          public.pvp_clean_nickname(p_nickname, 'Midnight'),
          public.pvp_clean_accessory(p_accessory));

  update public.rooms
  set status = case when status = 'waiting' then 'playing' else status end,
      turn = case when status = 'waiting' then starting_seat else turn end,
      players_version = players_version + 1,
      version = version + 1,
      updated_at = now(),
      expires_at = greatest(expires_at, now() + interval '2 hours')
  where id = p_room_id
  returning * into v_room;

  return jsonb_build_object('outcome', 'joined', 'seat', 'M', 'room', to_jsonb(v_room));
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: make_move  — the authoritative, concurrency-safe move
-- ---------------------------------------------------------------------------
create or replace function public.make_move(p_room_id text, p_cell integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public.pvp_require_uid();
  v_room  public.rooms%rowtype;
  v_seat  text;
  v_board text;
  v_out   record;
begin
  if p_cell is null or p_cell < 0 or p_cell > 8 then
    raise exception 'invalid_cell';
  end if;

  -- Row lock: concurrent calls for this room queue here. After the first commits,
  -- the second re-reads the updated row and fails the turn / empty-cell checks.
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;

  select seat into v_seat from public.room_players where room_id = p_room_id and user_id = v_uid;
  if v_seat is null then
    raise exception 'not_a_player';
  end if;
  if v_room.expires_at < now() or v_room.status = 'closed' then
    raise exception 'room_expired';
  end if;
  if v_room.status = 'waiting' then
    raise exception 'waiting_for_opponent';
  end if;
  if v_room.status <> 'playing' then
    raise exception 'game_over';
  end if;
  if v_room.turn <> v_seat then
    raise exception 'not_your_turn';
  end if;
  if substr(v_room.board, p_cell + 1, 1) <> '.' then
    raise exception 'cell_taken';
  end if;

  v_board := overlay(v_room.board placing v_seat from p_cell + 1 for 1);
  select * into v_out from public.pvp_outcome(v_board);

  insert into public.moves (room_id, round, move_no, cell, seat)
  values (p_room_id, v_room.round, v_room.move_count + 1, p_cell, v_seat);

  update public.rooms
  set board          = v_board,
      history        = history || p_cell::smallint,
      move_count     = move_count + 1,
      last_move_cell = p_cell,
      last_move_seat = v_seat,
      turn           = case when v_out.o_winner is null
                            then (case when v_seat = 'T' then 'M' else 'T' end)
                            else turn end,
      status         = case when v_out.o_winner is null then 'playing' else 'finished' end,
      winner         = v_out.o_winner,
      winning_line   = v_out.o_line,
      score_t        = score_t + (coalesce(v_out.o_winner, '') = 'T')::int,
      score_m        = score_m + (coalesce(v_out.o_winner, '') = 'M')::int,
      draws          = draws   + (coalesce(v_out.o_winner, '') = 'D')::int,
      games_played   = games_played + (v_out.o_winner is not null)::int,
      version        = version + 1,
      updated_at     = now(),
      expires_at     = greatest(expires_at, now() + interval '2 hours')
  where id = p_room_id
  returning * into v_room;

  return to_jsonb(v_room);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: request_rematch — both seats must vote for the *current* round
-- ---------------------------------------------------------------------------
create or replace function public.request_rematch(p_room_id text, p_round integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := public.pvp_require_uid();
  v_room public.rooms%rowtype;
  v_seat text;
  v_t integer;
  v_m integer;
  v_next text;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  select seat into v_seat from public.room_players where room_id = p_room_id and user_id = v_uid;
  if v_seat is null then
    raise exception 'not_a_player';
  end if;
  if v_room.expires_at < now() or v_room.status = 'closed' then
    raise exception 'room_expired';
  end if;
  -- Stale votes (old round, or game not finished) are rejected outright.
  if v_room.status <> 'finished' or p_round is distinct from v_room.round then
    raise exception 'stale_rematch';
  end if;
  if exists (select 1 from public.room_players
             where room_id = p_room_id and seat <> v_seat and left_at is not null) then
    raise exception 'opponent_left';
  end if;

  v_t := case when v_seat = 'T' then v_room.round else v_room.rematch_t end;
  v_m := case when v_seat = 'M' then v_room.round else v_room.rematch_m end;

  if v_t = v_room.round and v_m = v_room.round then
    v_next := case when v_room.starting_seat = 'T' then 'M' else 'T' end;  -- alternate who starts
    update public.rooms
    set round = round + 1,
        board = '.........',
        history = '{}',
        move_count = 0,
        last_move_cell = null,
        last_move_seat = null,
        winner = null,
        winning_line = null,
        starting_seat = v_next,
        turn = v_next,
        status = 'playing',
        rematch_t = null,
        rematch_m = null,
        rematch_declined_by = null,
        rematch_declined_round = null,
        version = version + 1,
        updated_at = now(),
        expires_at = greatest(expires_at, now() + interval '2 hours')
    where id = p_room_id
    returning * into v_room;
  else
    update public.rooms
    set rematch_t = v_t,
        rematch_m = v_m,
        -- Changing your mind clears your own earlier decline.
        rematch_declined_by = case when rematch_declined_by = v_seat then null else rematch_declined_by end,
        rematch_declined_round = case when rematch_declined_by = v_seat then null else rematch_declined_round end,
        version = version + 1,
        updated_at = now()
    where id = p_room_id
    returning * into v_room;
  end if;

  return to_jsonb(v_room);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: decline_rematch
-- ---------------------------------------------------------------------------
create or replace function public.decline_rematch(p_room_id text, p_round integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := public.pvp_require_uid();
  v_room public.rooms%rowtype;
  v_seat text;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  select seat into v_seat from public.room_players where room_id = p_room_id and user_id = v_uid;
  if v_seat is null then
    raise exception 'not_a_player';
  end if;
  if v_room.status <> 'finished' or p_round is distinct from v_room.round then
    raise exception 'stale_rematch';
  end if;

  update public.rooms
  set rematch_declined_by = v_seat,
      rematch_declined_round = round,
      rematch_t = case when v_seat = 'T' then null else rematch_t end,
      rematch_m = case when v_seat = 'M' then null else rematch_m end,
      version = version + 1,
      updated_at = now()
  where id = p_room_id
  returning * into v_room;

  return to_jsonb(v_room);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: leave_room — marks the seat as left; never resets the opponent's board
-- ---------------------------------------------------------------------------
create or replace function public.leave_room(p_room_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := public.pvp_require_uid();
  v_room public.rooms%rowtype;
  v_seat text;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  select seat into v_seat from public.room_players where room_id = p_room_id and user_id = v_uid;
  if v_seat is null then
    raise exception 'not_a_player';
  end if;

  update public.room_players set left_at = now() where room_id = p_room_id and seat = v_seat;

  update public.rooms
  set rematch_t = case when v_seat = 'T' then null else rematch_t end,
      rematch_m = case when v_seat = 'M' then null else rematch_m end,
      -- A host abandoning an empty waiting room closes it.
      status = case when status = 'waiting' then 'closed' else status end,
      players_version = players_version + 1,
      version = version + 1,
      updated_at = now()
  where id = p_room_id
  returning * into v_room;

  return jsonb_build_object('outcome', 'left', 'room', to_jsonb(v_room));
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: set_appearance — cosmetic only, never affects rules
-- ---------------------------------------------------------------------------
create or replace function public.set_appearance(p_room_id text, p_accessory text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := public.pvp_require_uid();
  v_room public.rooms%rowtype;
begin
  update public.room_players
  set accessory = public.pvp_clean_accessory(p_accessory)
  where room_id = p_room_id and user_id = v_uid;
  if not found then
    raise exception 'not_a_player';
  end if;

  update public.rooms
  set players_version = players_version + 1, version = version + 1, updated_at = now()
  where id = p_room_id
  returning * into v_room;

  return to_jsonb(v_room);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: send_reaction — whitelisted, rate limited
-- ---------------------------------------------------------------------------
create or replace function public.send_reaction(p_room_id text, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := public.pvp_require_uid();
  v_seat text;
begin
  if p_kind is null or p_kind not in ('mischief', 'love', 'laugh', 'shock', 'wave', 'sad') then
    raise exception 'invalid_reaction';
  end if;
  select seat into v_seat from public.room_players
  where room_id = p_room_id and user_id = v_uid and left_at is null;
  if v_seat is null then
    raise exception 'not_a_player';
  end if;
  if exists (select 1 from public.reactions
             where room_id = p_room_id and seat = v_seat
               and created_at > now() - interval '1200 milliseconds') then
    raise exception 'slow_down';
  end if;
  if (select count(*) from public.reactions
      where room_id = p_room_id and seat = v_seat
        and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'slow_down';
  end if;

  insert into public.reactions (room_id, seat, kind) values (p_room_id, v_seat, p_kind);
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security: read-only for room members, no direct writes for anyone
-- ---------------------------------------------------------------------------
alter table public.rooms        enable row level security;
alter table public.room_players enable row level security;
alter table public.moves        enable row level security;
alter table public.reactions    enable row level security;

drop policy if exists rooms_member_read on public.rooms;
create policy rooms_member_read on public.rooms
  for select to authenticated using (public.is_room_member(id));

drop policy if exists room_players_member_read on public.room_players;
create policy room_players_member_read on public.room_players
  for select to authenticated using (public.is_room_member(room_id));

drop policy if exists moves_member_read on public.moves;
create policy moves_member_read on public.moves
  for select to authenticated using (public.is_room_member(room_id));

drop policy if exists reactions_member_read on public.reactions;
create policy reactions_member_read on public.reactions
  for select to authenticated using (public.is_room_member(room_id));

-- Defense in depth: strip table privileges so even a bad policy cannot allow writes.
revoke all on public.rooms, public.room_players, public.moves, public.reactions from anon, public;
revoke insert, update, delete, truncate, references, trigger
  on public.rooms, public.room_players, public.moves, public.reactions from authenticated;
grant select on public.rooms, public.moves, public.reactions to authenticated;
-- Opponents may see nicknames/accessories but never each other's user ids.
revoke select on public.room_players from authenticated;
grant select (room_id, seat, nickname, accessory, joined_at, left_at) on public.room_players to authenticated;

-- Function privileges: only signed-in (incl. anonymous) sessions may call RPCs.
revoke all on function public.create_room(text, text)          from public, anon;
revoke all on function public.join_room(text, text, text)      from public, anon;
revoke all on function public.make_move(text, integer)         from public, anon;
revoke all on function public.request_rematch(text, integer)   from public, anon;
revoke all on function public.decline_rematch(text, integer)   from public, anon;
revoke all on function public.leave_room(text)                 from public, anon;
revoke all on function public.set_appearance(text, text)       from public, anon;
revoke all on function public.send_reaction(text, text)        from public, anon;
revoke all on function public.is_room_member(text)             from public, anon;
revoke all on function public.cleanup_expired_rooms()          from public, anon, authenticated;
revoke all on function public.pvp_outcome(text)                from public, anon, authenticated;
revoke all on function public.pvp_clean_nickname(text, text)   from public, anon, authenticated;
revoke all on function public.pvp_clean_accessory(text)        from public, anon, authenticated;
revoke all on function public.pvp_require_uid()                from public, anon, authenticated;

grant execute on function public.create_room(text, text)        to authenticated;
grant execute on function public.join_room(text, text, text)    to authenticated;
grant execute on function public.make_move(text, integer)       to authenticated;
grant execute on function public.request_rematch(text, integer) to authenticated;
grant execute on function public.decline_rematch(text, integer) to authenticated;
grant execute on function public.leave_room(text)               to authenticated;
grant execute on function public.set_appearance(text, text)     to authenticated;
grant execute on function public.send_reaction(text, text)      to authenticated;
grant execute on function public.is_room_member(text)           to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: broadcast row changes (RLS is enforced per subscriber)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms') then
      alter publication supabase_realtime add table public.rooms;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reactions') then
      alter publication supabase_realtime add table public.reactions;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Optional: scheduled cleanup if pg_cron is enabled (Database → Extensions)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('paw-vs-paw-cleanup', '*/30 * * * *', 'select public.cleanup_expired_rooms()');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end;
$$;
