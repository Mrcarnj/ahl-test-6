-- Rollback for sql/2026-10-04_clips.sql.
--
-- Storage objects can't be deleted with SQL (Supabase blocks direct deletes on
-- storage.objects). Empty the `clips` bucket from the dashboard or the Storage
-- API first, then run this.

begin;

drop policy if exists "Crew and admins read clip files" on storage.objects;
drop policy if exists "Crew upload clip files" on storage.objects;
drop policy if exists "Uploader or admin deletes clip files" on storage.objects;
delete from storage.buckets where id = 'clips';

alter publication supabase_realtime drop table public.clips;
drop table if exists public.clips;
alter table public.schedule drop constraint if exists schedule_id_key;

drop function if exists private.clips_set_uploader();
drop function if exists private.clip_path_schedule_id(text);
drop function if exists private.on_game_crew(bigint);
drop function if exists private.is_admin();

commit;
