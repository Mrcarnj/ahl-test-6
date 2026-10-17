-- Rollback for sql/2026-10-05_admin_clip_upload.sql: back to crew-only uploads.

begin;

drop policy if exists "Crew and admins upload clips" on public.clips;
create policy "Crew upload clips" on public.clips
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and private.on_game_crew(schedule_id)
    -- Paths must sit under the clip's own game folder.
    and private.clip_path_schedule_id(video_path) = schedule_id
    and (thumbnail_path is null or private.clip_path_schedule_id(thumbnail_path) = schedule_id)
  );

drop policy if exists "Crew and admins upload clip files" on storage.objects;
create policy "Crew upload clip files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'clips'
    and private.on_game_crew(private.clip_path_schedule_id(name))
  );

commit;
