-- =============================================================================
-- Pawville — couple pairs, invitations, mailbox, and private pair channels
-- =============================================================================
-- Builds on the Paw vs Paw schema (same anonymous auth). Requires migrations
-- 20261023000001 and 20261023000002 to be applied first.
--
-- Model
--   pawville_pairs          one row per couple; two seats: tangerine_uid / midnight_uid
--   pawville_pair_invites   short codes that let a second user claim the open seat
--   pawville_mail           notes/gifts between the two members of a pair
-- Authority
--   Clients get SELECT only through RLS (members of the pair). Every write goes through a
--   SECURITY DEFINER function that checks auth.uid(). Nobody can join a pair they weren't
--   invited to, take an occupied seat, or read another couple's mail.
-- Realtime
--   Private channel 'pv-pair:<pair_id>' — only the two members may join, read or send
--   (broadcast + presence). Used for shared activities and partner presence.
-- =============================================================================

create table if not exists public.pawville_pairs (
  id uuid primary key default gen_random_uuid(),
  tangerine_uid uuid references auth.users(id) on delete set null,
  midnight_uid uuid references auth.users(id) on delete set null,
  tangerine_name text not null default '' check (char_length(tangerine_name) <= 16),
  midnight_name text not null default '' check (char_length(midnight_name) <= 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- A user can be in at most one pair (per seat column; the RPCs also enforce "one pair total").
create unique index if not exists pawville_pairs_t_uid on public.pawville_pairs (tangerine_uid) where tangerine_uid is not null;
create unique index if not exists pawville_pairs_m_uid on public.pawville_pairs (midnight_uid) where midnight_uid is not null;

create table if not exists public.pawville_pair_invites (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  pair_id uuid not null references public.pawville_pairs(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours',
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'cancelled'))
);
create index if not exists pawville_pair_invites_pair on public.pawville_pair_invites (pair_id);

create table if not exists public.pawville_mail (
  id bigserial primary key,
  pair_id uuid not null references public.pawville_pairs(id) on delete cascade,
  from_uid uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('note', 'gift')),
  body text not null default '' check (char_length(body) <= 280),
  gift text check (gift is null or gift ~ '^[a-z0-9-]{1,32}$'),
  created_at timestamptz not null default now(),
  opened_at timestamptz
);
create index if not exists pawville_mail_pair on public.pawville_mail (pair_id, created_at desc);

alter table public.pawville_pairs enable row level security;
alter table public.pawville_pair_invites enable row level security;
alter table public.pawville_mail enable row level security;
revoke all on public.pawville_pairs, public.pawville_pair_invites, public.pawville_mail from anon, authenticated;
grant select on public.pawville_pairs, public.pawville_mail to authenticated;

create or replace function public.pv_is_pair_member(p_pair uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pawville_pairs
    where id = p_pair and auth.uid() is not null and (tangerine_uid = auth.uid() or midnight_uid = auth.uid())
  );
$$;

drop policy if exists "pair members read pair" on public.pawville_pairs;
create policy "pair members read pair" on public.pawville_pairs for select to authenticated
  using (tangerine_uid = auth.uid() or midnight_uid = auth.uid());

drop policy if exists "pair members read mail" on public.pawville_mail;
create policy "pair members read mail" on public.pawville_mail for select to authenticated
  using (public.pv_is_pair_member(pair_id));

create or replace function public.pv_clean_name(p text)
returns text language sql immutable as $$
  select left(btrim(regexp_replace(coalesce(p, ''), '[^[:alnum:] _.!?''-]', '', 'g')), 16);
$$;

-- Returns my pair (or nothing) without exposing either user id.
create or replace function public.pv_my_pair()
returns table (pair_id uuid, my_role text, partner_name text, partner_joined boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id,
         case when p.tangerine_uid = auth.uid() then 'T' else 'M' end,
         case when p.tangerine_uid = auth.uid() then p.midnight_name else p.tangerine_name end,
         case when p.tangerine_uid = auth.uid() then p.midnight_uid is not null else p.tangerine_uid is not null end,
         p.created_at
  from public.pawville_pairs p
  where auth.uid() is not null and (p.tangerine_uid = auth.uid() or p.midnight_uid = auth.uid())
  limit 1;
$$;

-- Creates (or reuses) my pair and an invite code for the empty seat.
-- p_role: which signature cat I want to be ('T' or 'M'); ignored if I'm already in a pair.
create or replace function public.pv_create_pair_invite(p_role text, p_name text)
returns table (code text, pair_id uuid, my_role text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pair public.pawville_pairs;
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_recent int;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select count(*) into v_recent from public.pawville_pair_invites where created_by = v_uid and created_at > now() - interval '10 minutes';
  if v_recent >= 6 then raise exception 'rate_limited'; end if;

  select * into v_pair from public.pawville_pairs where tangerine_uid = v_uid or midnight_uid = v_uid for update;
  if not found then
    if p_role = 'M' then
      insert into public.pawville_pairs (midnight_uid, midnight_name) values (v_uid, public.pv_clean_name(p_name)) returning * into v_pair;
    else
      insert into public.pawville_pairs (tangerine_uid, tangerine_name) values (v_uid, public.pv_clean_name(p_name)) returning * into v_pair;
    end if;
  elsif v_pair.tangerine_uid is not null and v_pair.midnight_uid is not null then
    raise exception 'pair_full';
  end if;

  -- One open invite per pair: cancel older ones (prevents duplicate pending invites).
  update public.pawville_pair_invites set status = 'cancelled' where pawville_pair_invites.pair_id = v_pair.id and status = 'open';
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into public.pawville_pair_invites (code, pair_id, created_by) values (v_code, v_pair.id, v_uid);
      exit;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
  return query select v_code, v_pair.id, case when v_pair.tangerine_uid = v_uid then 'T' else 'M' end,
    (select i.expires_at from public.pawville_pair_invites i where i.code = v_code);
end;
$$;

create or replace function public.pv_accept_pair_invite(p_code text, p_name text)
returns table (pair_id uuid, my_role text, partner_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.pawville_pair_invites;
  v_pair public.pawville_pairs;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into v_inv from public.pawville_pair_invites where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'invite_not_found'; end if;
  if v_inv.status <> 'open' then raise exception 'invite_closed'; end if;
  if v_inv.expires_at < now() then raise exception 'invite_expired'; end if;
  if v_inv.created_by = v_uid then raise exception 'own_invite'; end if;
  if exists (select 1 from public.pawville_pairs where tangerine_uid = v_uid or midnight_uid = v_uid) then
    raise exception 'already_paired';
  end if;
  select * into v_pair from public.pawville_pairs where id = v_inv.pair_id for update;
  if v_pair.tangerine_uid is null then
    update public.pawville_pairs set tangerine_uid = v_uid, tangerine_name = public.pv_clean_name(p_name), updated_at = now() where id = v_pair.id;
    update public.pawville_pair_invites set status = 'accepted' where code = v_inv.code;
    return query select v_pair.id, 'T'::text, v_pair.midnight_name;
  elsif v_pair.midnight_uid is null then
    update public.pawville_pairs set midnight_uid = v_uid, midnight_name = public.pv_clean_name(p_name), updated_at = now() where id = v_pair.id;
    update public.pawville_pair_invites set status = 'accepted' where code = v_inv.code;
    return query select v_pair.id, 'M'::text, v_pair.tangerine_name;
  else
    raise exception 'pair_full';
  end if;
end;
$$;

create or replace function public.pv_decline_pair_invite(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  update public.pawville_pair_invites set status = 'declined' where code = upper(btrim(p_code)) and status = 'open';
end;
$$;

create or replace function public.pv_cancel_pair_invites()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  update public.pawville_pair_invites i set status = 'cancelled'
  where i.status = 'open' and public.pv_is_pair_member(i.pair_id);
end;
$$;

-- Leaving frees my seat. The pair (and its shared mail) stays for the partner; if nobody is
-- left, it is deleted.
create or replace function public.pv_leave_pair()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  update public.pawville_pairs set tangerine_uid = null, tangerine_name = '', updated_at = now() where tangerine_uid = v_uid;
  update public.pawville_pairs set midnight_uid = null, midnight_name = '', updated_at = now() where midnight_uid = v_uid;
  delete from public.pawville_pairs where tangerine_uid is null and midnight_uid is null;
end;
$$;

create or replace function public.pv_send_mail(p_kind text, p_body text, p_gift text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pair uuid;
  v_id bigint;
  v_recent int;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select id into v_pair from public.pawville_pairs where (tangerine_uid = v_uid or midnight_uid = v_uid) and tangerine_uid is not null and midnight_uid is not null;
  if v_pair is null then raise exception 'not_paired'; end if;
  if p_kind not in ('note', 'gift') then raise exception 'bad_kind'; end if;
  select count(*) into v_recent from public.pawville_mail where from_uid = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 30 then raise exception 'rate_limited'; end if;
  insert into public.pawville_mail (pair_id, from_uid, kind, body, gift)
    values (v_pair, v_uid, p_kind, left(coalesce(p_body, ''), 280), nullif(p_gift, ''))
    returning id into v_id;
  return v_id;
end;
$$;

-- Mail as seen by me: no user ids, just "from me / from partner".
create or replace function public.pv_my_mail(p_limit int default 50)
returns table (id bigint, kind text, body text, gift text, from_me boolean, created_at timestamptz, opened_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.kind, m.body, m.gift, m.from_uid = auth.uid(), m.created_at, m.opened_at
  from public.pawville_mail m
  where public.pv_is_pair_member(m.pair_id)
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 200);
$$;

create or replace function public.pv_open_mail(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.pawville_mail set opened_at = coalesce(opened_at, now())
  where id = p_id and from_uid <> auth.uid() and public.pv_is_pair_member(pair_id);
end;
$$;

revoke all on function public.pv_my_pair(), public.pv_create_pair_invite(text, text), public.pv_accept_pair_invite(text, text),
  public.pv_decline_pair_invite(text), public.pv_cancel_pair_invites(), public.pv_leave_pair(), public.pv_send_mail(text, text, text),
  public.pv_my_mail(int), public.pv_open_mail(bigint), public.pv_is_pair_member(uuid) from public, anon;
grant execute on function public.pv_my_pair(), public.pv_create_pair_invite(text, text), public.pv_accept_pair_invite(text, text),
  public.pv_decline_pair_invite(text), public.pv_cancel_pair_invites(), public.pv_leave_pair(), public.pv_send_mail(text, text, text),
  public.pv_my_mail(int), public.pv_open_mail(bigint), public.pv_is_pair_member(uuid) to authenticated;

-- Private Realtime channel 'pv-pair:<pair uuid>' — members only (broadcast + presence).
do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages not found; skipping pair channel policies.';
    return;
  end if;
  execute 'drop policy if exists "pawville pair members read" on realtime.messages';
  execute 'drop policy if exists "pawville pair members write" on realtime.messages';
  execute $p$
    create policy "pawville pair members read" on realtime.messages
      for select to authenticated
      using (
        realtime.messages.extension in ('broadcast', 'presence')
        and realtime.topic() like 'pv-pair:%'
        and public.pv_is_pair_member(substr(realtime.topic(), 9)::uuid)
      )
  $p$;
  execute $p$
    create policy "pawville pair members write" on realtime.messages
      for insert to authenticated
      with check (
        realtime.messages.extension in ('broadcast', 'presence')
        and realtime.topic() like 'pv-pair:%'
        and public.pv_is_pair_member(substr(realtime.topic(), 9)::uuid)
      )
  $p$;
end;
$$;
