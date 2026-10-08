-- Cache for the `flight-search` Edge Function (supabase/functions/flight-search).
--
-- Every live search spends fare-API quota, so the function stores each
-- normalized response here keyed by its request and reuses it for a few hours.
-- One row is also one billed search, which makes this the usage log:
--   select date_trunc('month', created_at), count(*) from flight_search_cache group by 1;
--
-- Only the function touches it, with the service role (which bypasses RLS).
-- Clients get nothing: RLS on, no policies, and Supabase's default grants on a
-- new public table revoked.
--
-- Rollback: sql/2026-10-07_flight_search_cache_rollback.sql

create table public.flight_search_cache (
  key        text primary key,
  response   jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.flight_search_cache enable row level security;
revoke all on table public.flight_search_cache from anon, authenticated;
