-- Server-side rules for text typed into the app, matching src/lib/textInput.ts.
--
-- The client cleans these fields before saving, but anyone with an official's
-- session can call the API directly, so the DB enforces them too:
--
--   * clips.title: one line, no control characters.
--   * clips.notes: line breaks and tabs allowed, no other control characters.
--   * clips.tags: no control characters, each tag 1-60 characters.
--   * roster.ical_url: only a HorizonWebRef feed (the app syncs whatever this
--     points at into `schedule`, so a feed from anywhere else could plant
--     games). The Cloudflare proxy already refuses any other host.
--
-- NOT VALID: enforced for every insert and update from now on, without failing
-- on an existing row. To check the old rows too, run the VALIDATE lines at the
-- bottom; a failure names the constraint, and the row can be fixed first.
--
-- Rollback: sql/2026-10-11_text_input_checks_rollback.sql

begin;

alter table public.clips
  add constraint clips_title_plain check (title !~ '[[:cntrl:]]') not valid,
  add constraint clips_notes_plain check (notes is null or notes !~ '[\x01-\x08\x0B-\x1F\x7F]') not valid,
  -- Joined on newlines (which the first test rules out inside a tag), an
  -- empty tag shows up as two newlines in a row and a long one as 61
  -- non-newline characters. CHECK can't use a subquery, hence the regex.
  add constraint clips_tags_plain check (
    array_to_string(tags, '') !~ '[[:cntrl:]]'
    and (cardinality(tags) = 0
         or (E'\n' || array_to_string(tags, E'\n') || E'\n') !~ '\n\n|[^\n]{61}')
  ) not valid;

alter table public.roster
  add constraint roster_ical_url_horizon check (
    ical_url is null
    or ical_url = ''
    or (ical_url like 'https://www.horizonwebref.com/syncICS%' and ical_url !~ '\s' and char_length(ical_url) <= 2048)
  ) not valid;

commit;

-- alter table public.clips validate constraint clips_title_plain;
-- alter table public.clips validate constraint clips_notes_plain;
-- alter table public.clips validate constraint clips_tags_plain;
-- alter table public.roster validate constraint roster_ical_url_horizon;
