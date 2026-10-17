-- Clips: let the uploader, or an admin, edit a clip's title, notes and tags.
--
-- Follows sql/2026-10-04_clips.sql, which granted no UPDATE at all. The grant
-- is column-level, so an edit can never move a clip to another game, repoint
-- its files or change who uploaded it — only these three fields. The table's
-- existing checks (title length, notes length, at most 20 tags) still apply.
--
-- "Admin" is private.is_admin() (isAdmin or ahlAdmin), the same rule delete uses.
--
-- Rollback: sql/2026-10-05_clips_edit_rollback.sql

begin;

grant update (title, notes, tags) on public.clips to authenticated;

create policy "Uploader or admin edits clips" on public.clips
  for update to authenticated
  using ( uploaded_by = (select auth.uid()) or (select private.is_admin()) )
  with check ( uploaded_by = (select auth.uid()) or (select private.is_admin()) );

commit;
