-- Rollback for sql/2026-10-12_email_has_account.sql. The forgot-password
-- screen treats a failed check as "unknown" and still sends the code.

begin;
drop function if exists public.email_has_account(text);
commit;
