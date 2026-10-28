-- Pawville Milestone 5 — multiplayer repair (forward-only, non-destructive).
--
-- Adds an authoritative way for the INVITER to learn what happened to their invitation, so a
-- lost Realtime event, a refresh or being offline at the moment of acceptance can never leave
-- them stuck on "Invite pending". No table, column or row is dropped or rewritten.
--
-- Apply after 20261024000001_pawville_pairs.sql (SQL Editor → paste → Run). Safe to re-run.

create or replace function public.pv_my_pair_invite()
returns table (code text, status text, expires_at timestamptz, mine boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.code,
         case when i.status = 'open' and i.expires_at < now() then 'expired' else i.status end,
         i.expires_at,
         i.created_by = auth.uid(),
         i.created_at
  from public.pawville_pair_invites i
  where auth.uid() is not null and public.pv_is_pair_member(i.pair_id)
  order by i.created_at desc
  limit 1;
$$;

revoke all on function public.pv_my_pair_invite() from public, anon;
grant execute on function public.pv_my_pair_invite() to authenticated;

-- Declining your OWN invitation is a cancel, not a decline; reject it so the inviter's status
-- stays truthful. Expired invitations can't be declined (they are already closed).
create or replace function public.pv_decline_pair_invite(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  update public.pawville_pair_invites
     set status = 'declined'
   where code = upper(btrim(p_code))
     and status = 'open'
     and expires_at >= now()
     and created_by <> auth.uid();
end;
$$;
revoke all on function public.pv_decline_pair_invite(text) from public, anon;
grant execute on function public.pv_decline_pair_invite(text) to authenticated;
