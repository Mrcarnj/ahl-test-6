-- Forgot password: tell the sign-in screen whether an email has an account,
-- so an official who types the wrong address is told to use their
-- HorizonWebRef email instead of waiting for a code that never comes.
--
-- Callable signed out (anon), because that is when it's needed. It returns
-- only true/false -- no ids -- but it does let anyone check whether an email
-- belongs to an official. That was accepted on purpose for this app (a closed
-- list of officials, accounts created by an admin). Supabase Auth's own email
-- rate limits still cap how many reset codes can be sent.
--
-- Rollback: sql/2026-10-12_email_has_account_rollback.sql

begin;

create or replace function public.email_has_account(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where lower(u.email) = lower(trim(p_email))
  );
$$;
revoke all on function public.email_has_account(text) from public;
grant execute on function public.email_has_account(text) to anon, authenticated;

commit;
