-- Rollback for sql/2026-10-05_clips_edit.sql.

begin;

drop policy if exists "Uploader or admin edits clips" on public.clips;
revoke update (title, notes, tags) on public.clips from authenticated;

commit;
