-- Clips: every official can watch every clip, not just their own crews'.
--
-- sql/2026-10-04_clips.sql let only a game's crew (and admins) read its clips
-- and their files. The iPad home screen's Clips feed shows the whole league's
-- clips, newest first, so reading is widened to anyone with a roster row
-- (private.is_official(), which admins also pass).
--
-- Unchanged: uploading is still crew/admins only, and editing and deleting
-- still the uploader or an admin. Realtime applies this select policy per
-- subscriber, so every official now receives every clip insert; the app still
-- only pops a "New Clip" alert for clips on games the official worked
-- (ClipsProvider.isCrewClipFromOthers).
--
-- Applied 2026-10-10, ahead of the iPad build. Builds before it work under
-- this policy (alerts stay crew-only), but their Clips tab lists every clip in
-- the league and their "Crew" filter (there: "not mine") shows every other
-- official's clips. The new build's "Crew" is clips on games the official
-- worked.
--
-- Rollback: sql/2026-10-10_clips_read_all_officials_rollback.sql

begin;

drop policy if exists "Crew and admins read clips" on public.clips;
create policy "Officials read clips" on public.clips
  for select to authenticated
  using ( (select private.is_official()) );

drop policy if exists "Crew and admins read clip files" on storage.objects;
create policy "Officials read clip files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'clips'
    and (select private.is_official())
  );

commit;
