-- Clips: let admins upload to any game, not just games they're crew on.
--
-- ahlAdmins see every game in the app (the admin view) and upload clips the
-- same way officials do. sql/2026-10-04_clips.sql only let a game's crew
-- insert — the row and the files — so an admin's upload was refused.
--
-- "Admin" is private.is_admin() (isAdmin or ahlAdmin), the same rule that
-- already lets admins read, edit and delete every clip. Everything else in the
-- insert check is unchanged: the uploader is still the session user (set by
-- the trigger), and files must still sit under the clip's own game folder.
--
-- Rollback: sql/2026-10-05_admin_clip_upload_rollback.sql

begin;

drop policy if exists "Crew upload clips" on public.clips;
create policy "Crew and admins upload clips" on public.clips
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and ( (select private.is_admin()) or private.on_game_crew(schedule_id) )
    -- Paths must sit under the clip's own game folder.
    and private.clip_path_schedule_id(video_path) = schedule_id
    and (thumbnail_path is null or private.clip_path_schedule_id(thumbnail_path) = schedule_id)
  );

drop policy if exists "Crew upload clip files" on storage.objects;
create policy "Crew and admins upload clip files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'clips'
    and private.clip_path_schedule_id(name) is not null
    and (
      (select private.is_admin())
      or private.on_game_crew(private.clip_path_schedule_id(name))
    )
  );

commit;
