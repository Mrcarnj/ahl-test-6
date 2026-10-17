-- Clips: officials upload game video, tag it, and share it with that game's
-- crew.
--
-- Access model (follows sql/2026-10-01_enable_rls.sql):
--   * view    -> the game's crew (referee1/2, linesperson1/2, matched on
--                roster.lastfirstfullname) and admins (isAdmin / ahlAdmin).
--                Crew membership is read live from `schedule`, so a crew
--                change moves access with it.
--   * upload  -> crew only, as themselves. uploaded_by / uploader_name are
--                set server-side and can't be spoofed.
--   * delete  -> the uploader, or an admin.
--   * update  -> nobody (no edit flow yet).
--
-- Storage: private bucket `clips`, objects at `{schedule_id}/{clip_id}.{ext}`
-- (video) and `{schedule_id}/{clip_id}.jpg` (thumbnail). The first path
-- segment is what the storage policies check, so the same crew rule guards
-- both the rows and the files.
--
-- Rollback: sql/2026-10-04_clips_rollback.sql

begin;

-- ---------------------------------------------------------------- helpers --
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.roster r
    where r.auth_id = (select auth.uid())
      and (coalesce(r."isAdmin", false) or coalesce(r."ahlAdmin", false))
  );
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create or replace function private.on_game_crew(p_schedule_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.schedule s
    join public.roster r on r.auth_id = (select auth.uid())
    where s.id = p_schedule_id
      and r.lastfirstfullname in (s.referee1, s.referee2, s.linesperson1, s.linesperson2)
  );
$$;
revoke all on function private.on_game_crew(bigint) from public;
grant execute on function private.on_game_crew(bigint) to authenticated;

-- Storage object names arrive as text; anything that isn't a numeric
-- `{schedule_id}/...` path is simply refused rather than failing a cast.
create or replace function private.clip_path_schedule_id(p_name text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9]{1,18}$'
      then split_part(p_name, '/', 1)::bigint
  end;
$$;
revoke all on function private.clip_path_schedule_id(text) from public;
grant execute on function private.clip_path_schedule_id(text) to authenticated;

-- ------------------------------------------------------------------ table --
-- schedule's primary key is `uuid`. `id` is an identity column the app uses
-- everywhere and the iCal sync updates rows in place (nothing deletes them),
-- so it's stable and already distinct — but it wasn't declared unique, which
-- a foreign key needs.
alter table public.schedule add constraint schedule_id_key unique (id);

create table public.clips (
  id               uuid primary key default gen_random_uuid(),
  schedule_id      bigint not null references public.schedule(id),
  uploaded_by      uuid not null default auth.uid() references auth.users(id),
  uploader_name    text not null default '',
  title            text not null check (char_length(title) between 1 and 120),
  notes            text check (notes is null or char_length(notes) <= 1000),
  tags             text[] not null default '{}' check (cardinality(tags) <= 20),
  video_path       text not null,
  thumbnail_path   text,
  duration_seconds numeric,
  size_bytes       bigint,
  created_at       timestamptz not null default now()
);

create index clips_schedule_created_idx on public.clips (schedule_id, created_at desc);
create index clips_uploaded_by_idx on public.clips (uploaded_by);
create index clips_tags_idx on public.clips using gin (tags);

-- Who uploaded is taken from the session, never from the client.
create or replace function private.clips_set_uploader()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.uploaded_by := (select auth.uid());
  new.uploader_name := coalesce(
    (select r.lastfirstfullname from public.roster r where r.auth_id = new.uploaded_by),
    ''
  );
  new.created_at := now();
  return new;
end;
$$;
revoke all on function private.clips_set_uploader() from public;

create trigger clips_set_uploader
  before insert on public.clips
  for each row execute function private.clips_set_uploader();

-- ----------------------------------------------------------------- access --
-- Supabase's default privileges grant anon/authenticated everything on a new
-- table; start from nothing, as the rest of the schema does.
revoke all on public.clips from anon, authenticated;
grant select, insert, delete on public.clips to authenticated;

alter table public.clips enable row level security;

create policy "Crew and admins read clips" on public.clips
  for select to authenticated
  using ( (select private.is_admin()) or private.on_game_crew(schedule_id) );

create policy "Crew upload clips" on public.clips
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and private.on_game_crew(schedule_id)
    -- Paths must sit under the clip's own game folder.
    and private.clip_path_schedule_id(video_path) = schedule_id
    and (thumbnail_path is null or private.clip_path_schedule_id(thumbnail_path) = schedule_id)
  );

create policy "Uploader or admin deletes clips" on public.clips
  for delete to authenticated
  using ( uploaded_by = (select auth.uid()) or (select private.is_admin()) );

-- Crew members get new clips live (Realtime applies the select policy above
-- per subscriber, so nobody hears about a game they can't see).
alter publication supabase_realtime add table public.clips;

-- ---------------------------------------------------------------- storage --
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clips', 'clips', false,
  524288000, -- 500 MB
  array['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm', 'image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Crew and admins read clip files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'clips'
    and (
      (select private.is_admin())
      or private.on_game_crew(private.clip_path_schedule_id(name))
    )
  );

create policy "Crew upload clip files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'clips'
    and private.on_game_crew(private.clip_path_schedule_id(name))
  );

create policy "Uploader or admin deletes clip files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'clips'
    and (owner_id = (select auth.uid())::text or (select private.is_admin()))
  );

commit;
