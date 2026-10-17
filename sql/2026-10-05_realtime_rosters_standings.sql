-- Live updates for player stats/rosters (`teamRosters`) and standings (`teams`).
--
-- The nightly HockeyTech sync is run by whichever official opens the app first
-- after 5 AM ET; everyone else's open app should pick the new numbers up
-- without restarting. ScheduleProvider subscribes to both tables and reloads
-- once a burst of changes settles (the sync touches every row, so a client
-- sees ~1,600 events and reloads once).
--
-- Realtime applies the tables' existing "Officials read" RLS policy per
-- subscriber, so nothing new is exposed.
--
-- Rollback:
--   alter publication supabase_realtime drop table public."teamRosters", public.teams;

alter publication supabase_realtime add table public."teamRosters", public.teams;
