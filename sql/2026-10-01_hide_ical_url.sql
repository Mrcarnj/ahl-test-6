-- Phase 2 of 2026-10-01_enable_rls.sql: stop officials reading each other's
-- personal iCal feed URL through the roster table.
--
-- Run ONLY once officials are on a native build that reads its own feed via
-- public.get_my_ical_url() and never selects roster.ical_url / select('*').
-- Older builds will fail to load the roster after this.
begin;
revoke select on public.roster from authenticated;
grant select (
  id, email, firstname, lastname, lastfirstfullname, photo, phonenumber,
  "isAdmin", changedpassword, auth_id, "ahlAdmin", accepted_tos,
  tos_accepted_at, alt_name, ical_entered, firstlast, updated_at
) on public.roster to authenticated;
commit;
-- Undo: grant select on public.roster to authenticated;
