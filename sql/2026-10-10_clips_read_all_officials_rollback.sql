-- Rollback of sql/2026-10-10_clips_read_all_officials.sql: back to a game's
-- crew and admins reading its clips, as in sql/2026-10-04_clips.sql.

begin;

drop policy if exists "Officials read clips" on public.clips;
create policy "Crew and admins read clips" on public.clips
  for select to authenticated
  using ( (select private.is_admin()) or private.on_game_crew(schedule_id) );

drop policy if exists "Officials read clip files" on storage.objects;
create policy "Crew and admins read clip files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'clips'
    and (
      (select private.is_admin())
      or private.on_game_crew(private.clip_path_schedule_id(name))
    )
  );

commit;
