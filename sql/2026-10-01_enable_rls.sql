-- Turn on Row Level Security everywhere and lock the Data API down to what
-- the app actually does. Before this, RLS was disabled on every table, so the
-- public anon key (shipped in every bundle) could read and write everything.
--
-- Access model:
--   * anon (not signed in)       -> nothing.
--   * authenticated, not on the roster -> nothing (sign-ups are disabled, but
--     this keeps a stray auth user from seeing data if one is ever created).
--   * official (row in roster)   -> read everything the app shows, and write
--     what the client-side syncs write (schedule, teams, stats, playoffs).
--     Nothing is ever deleted by the app, so there are no DELETE grants
--     except an official's own push tokens.
--   * roster: an official may update only their own row, and only the
--     onboarding columns -- never isAdmin / ahlAdmin / name / email.
--   * roster.ical_url is a personal feed link. An official reads their own via
--     public.get_my_ical_url(); phase 2 (2026-10-01_hide_ical_url.sql) then
--     removes the column from the table's readable columns.
--
-- Rollback: sql/2026-10-01_enable_rls_rollback.sql

begin;

-- ---------------------------------------------------------------- helpers --
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Security definer so roster's own policies can call it without recursing
-- into roster's RLS. Lives in `private`, which the Data API does not expose.
create or replace function private.is_official()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.roster r where r.auth_id = (select auth.uid())
  );
$$;
revoke all on function private.is_official() from public;
grant execute on function private.is_official() to authenticated;

create or replace function public.get_my_ical_url()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.ical_url from public.roster r where r.auth_id = (select auth.uid());
$$;
revoke all on function public.get_my_ical_url() from public, anon;
grant execute on function public.get_my_ical_url() to authenticated;

-- Unused by the app, and turned any email into an auth user id for anyone.
revoke all on function public.get_auth_id_by_email(text) from public, anon, authenticated;

-- The view ran with its owner's rights, which would bypass the RLS below.
alter view public.current_season_games set (security_invoker = true);

-- ----------------------------------------------------------- table grants --
-- Start from nothing, then grant exactly what the app uses.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.current_season_games to authenticated;

-- Phase 1 keeps every roster column readable (incl. ical_url) because the
-- installed native builds select('*') on roster and have no OTA updates.
-- Once officials are on a build that reads its feed via get_my_ical_url(),
-- run sql/2026-10-01_hide_ical_url.sql (phase 2).
grant select on public.roster to authenticated;
grant update (
  ical_url, ical_entered, changedpassword, accepted_tos, tos_accepted_at
) on public.roster to authenticated;

grant select, insert, update on
  public.schedule,
  public."teamRosters",
  public."playoffStats",
  public.hockeytech_team_map,
  public.playoff_series,
  public.playoff_games
to authenticated;

-- Standings sync only updates existing team rows.
grant select, update on public.teams to authenticated;

grant select, insert, update, delete on public.user_push_tokens to authenticated;

-- ---------------------------------------------------------------- policies --
alter table public.roster              enable row level security;
alter table public.schedule            enable row level security;
alter table public.teams               enable row level security;
alter table public."teamRosters"       enable row level security;
alter table public."playoffStats"      enable row level security;
alter table public.hockeytech_team_map enable row level security;
alter table public.playoff_series      enable row level security;
alter table public.playoff_games       enable row level security;
alter table public.user_push_tokens    enable row level security;

-- Old policies were written for the `public` role (including anon).
drop policy if exists "Enable read access for all users" on public.roster;
drop policy if exists "Enable update for users based on email" on public.roster;
drop policy if exists "Enable read access for all users" on public.schedule;
drop policy if exists "Enable read access for all users" on public.teams;
drop policy if exists "Users can delete their own push tokens" on public.user_push_tokens;
drop policy if exists "Users can insert their own push tokens" on public.user_push_tokens;
drop policy if exists "Users can read their own push tokens" on public.user_push_tokens;
drop policy if exists "Users can update their own push tokens" on public.user_push_tokens;

-- roster
create policy "Officials read the roster" on public.roster
  for select to authenticated
  using ( (select private.is_official()) );
create policy "Officials update their own row" on public.roster
  for update to authenticated
  using ( auth_id = (select auth.uid()) )
  with check ( auth_id = (select auth.uid()) );

-- Shared league data written by the client-side syncs.
do $$
declare t text;
begin
  foreach t in array array[
    'schedule', 'teamRosters', 'playoffStats',
    'hockeytech_team_map', 'playoff_series', 'playoff_games'
  ] loop
    execute format(
      'create policy "Officials read" on public.%I for select to authenticated using ((select private.is_official()))', t);
    execute format(
      'create policy "Officials insert" on public.%I for insert to authenticated with check ((select private.is_official()))', t);
    execute format(
      'create policy "Officials update" on public.%I for update to authenticated using ((select private.is_official())) with check ((select private.is_official()))', t);
  end loop;
end $$;

create policy "Officials read" on public.teams
  for select to authenticated using ( (select private.is_official()) );
create policy "Officials update" on public.teams
  for update to authenticated
  using ( (select private.is_official()) )
  with check ( (select private.is_official()) );

-- Push tokens: a device notifies the rest of a game's crew directly, so
-- officials can read each other's tokens, but only manage their own.
create policy "Officials read push tokens" on public.user_push_tokens
  for select to authenticated using ( (select private.is_official()) );
create policy "Users insert own push tokens" on public.user_push_tokens
  for insert to authenticated with check ( auth_id = (select auth.uid()) );
create policy "Users update own push tokens" on public.user_push_tokens
  for update to authenticated
  using ( auth_id = (select auth.uid()) )
  with check ( auth_id = (select auth.uid()) );
create policy "Users delete own push tokens" on public.user_push_tokens
  for delete to authenticated using ( auth_id = (select auth.uid()) );

-- ----------------------------------------------------------------- storage --
-- Anyone (including anon) could upload into `logos`. Buckets stay public for
-- reading by URL; uploads now need the service role (dashboard / scripts).
drop policy if exists "Enable uploads for all users 1peuqw_1" on storage.objects;

commit;

-- Advisor follow-up (applied separately, same day): pin search_path.
alter function public.update_updated_at_column() set search_path = '';
alter function public.get_auth_id_by_email(text) set search_path = '';
