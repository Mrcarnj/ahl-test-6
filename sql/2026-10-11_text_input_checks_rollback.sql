-- Rollback for sql/2026-10-11_text_input_checks.sql.

begin;

alter table public.clips
  drop constraint if exists clips_title_plain,
  drop constraint if exists clips_notes_plain,
  drop constraint if exists clips_tags_plain;

alter table public.roster
  drop constraint if exists roster_ical_url_horizon;

commit;
