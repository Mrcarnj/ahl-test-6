-- Emergency rollback for 2026-10-01_enable_rls.sql: restores the previous
-- (wide-open) behaviour. Only use if the app is broken and a fix cannot ship.
begin;
do $$
declare t text;
begin
  foreach t in array array['roster','schedule','teams','teamRosters','playoffStats',
    'hockeytech_team_map','playoff_series','playoff_games','user_push_tokens'] loop
    execute format('alter table public.%I disable row level security', t);
  end loop;
end $$;
grant all on all tables in schema public to anon, authenticated;
alter view public.current_season_games set (security_invoker = false);
grant execute on function public.get_auth_id_by_email(text) to anon, authenticated;
commit;
