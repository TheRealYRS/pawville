-- =============================================================================
-- Paw vs Paw — Realtime Authorization for the private presence channel
-- =============================================================================
-- The client tracks "who is online" on a PRIVATE Realtime channel named
-- 'pvp:<room_id>'. These policies make sure only members of that room can
-- join the channel, read presence, or publish their own presence.
-- Game state itself never travels over this channel; it is read from the
-- RLS-protected tables via postgres_changes.
-- =============================================================================

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages not found; skipping presence policies (presence will show as unknown).';
    return;
  end if;

  execute 'drop policy if exists "pvp members read presence" on realtime.messages';
  execute 'drop policy if exists "pvp members track presence" on realtime.messages';

  execute $p$
    create policy "pvp members read presence" on realtime.messages
      for select to authenticated
      using (
        realtime.messages.extension in ('presence')
        and realtime.topic() like 'pvp:%'
        and public.is_room_member(substr(realtime.topic(), 5))
      )
  $p$;

  execute $p$
    create policy "pvp members track presence" on realtime.messages
      for insert to authenticated
      with check (
        realtime.messages.extension in ('presence')
        and realtime.topic() like 'pvp:%'
        and public.is_room_member(substr(realtime.topic(), 5))
      )
  $p$;
end;
$$;
