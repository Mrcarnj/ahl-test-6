create table public.roster (
  id bigint generated always as identity not null,
  email text not null,
  firstname text not null,
  lastname text not null,
  lastfirstfullname text not null,
  photo text null,
  phonenumber text null,
  "isAdmin" boolean null default false,
  changedpassword boolean null default false,
  auth_id uuid not null,
  "ahlAdmin" boolean null default false,
  accepted_tos boolean null default false,
  tos_accepted_at timestamp with time zone null,
  alt_name text null,
  ical_entered boolean not null default false,
  ical_url text null,
  firstlast text null,
  updated_at timestamp with time zone null default now(),
  constraint roster_pkey primary key (auth_id),
  constraint roster_lastfirstfullname_key unique (lastfirstfullname),
  constraint roster_email_fkey foreign KEY (email) references auth.users (email)
) TABLESPACE pg_default;

create index IF not exists idx_roster_id on public.roster using btree (id) TABLESPACE pg_default;

create index IF not exists idx_roster_lastfirstfullname on public.roster using btree (lastfirstfullname) TABLESPACE pg_default;

create trigger update_roster_updated_at BEFORE
update on roster for EACH row
execute FUNCTION update_updated_at_column ();

create table public.schedule (
  id bigint generated always as identity not null,
  awayteam text not null,
  gamedate date not null,
  gameid text not null,
  gametime time with time zone not null,
  hometeam text not null,
  linesperson1 text null,
  linesperson2 text null,
  referee1 text null,
  referee2 text null,
  gamecode text null,
  season text null,
  uuid uuid not null default gen_random_uuid (),
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint schedule_pkey primary key (uuid),
  constraint schedule_gameid_season_unique unique (gameid, season),
  constraint schedule_linesperson1_fkey foreign KEY (linesperson1) references roster (lastfirstfullname),
  constraint schedule_linesperson2_fkey foreign KEY (linesperson2) references roster (lastfirstfullname),
  constraint schedule_referee1_fkey foreign KEY (referee1) references roster (lastfirstfullname),
  constraint schedule_awayteam_fkey foreign KEY (awayteam) references teams (city),
  constraint schedule_referee2_fkey foreign KEY (referee2) references roster (lastfirstfullname),
  constraint schedule_hometeam_fkey foreign KEY (hometeam) references teams (city)
) TABLESPACE pg_default;

create index IF not exists idx_schedule_season on public.schedule using btree (season) TABLESPACE pg_default;

create index IF not exists idx_schedule_gamedate on public.schedule using btree (gamedate) TABLESPACE pg_default;

create index IF not exists idx_schedule_gamecode on public.schedule using btree (gamecode) TABLESPACE pg_default;

create index IF not exists idx_schedule_uuid on public.schedule using btree (uuid) TABLESPACE pg_default;

create index IF not exists idx_schedule_gameid_season on public.schedule using btree (gameid, season) TABLESPACE pg_default;

create trigger update_schedule_updated_at BEFORE
update on schedule for EACH row
execute FUNCTION update_updated_at_column ();

create table public.teams (
  id bigint generated always as identity not null,
  city text not null,
  abbreviation text not null,
  headcoachname text not null,
  headcoachpic text null,
  assistantcoach1 text null,
  assistantcoach2 text null,
  arenaname text not null,
  timezone text not null,
  arenaaddress text not null,
  eqname text null,
  eqphone text null,
  logo text null,
  parking_latitude double precision null,
  parking_longitude double precision null,
  parking_instructions text null,
  locker_room_instructions text null,
  constraint teams_pkey primary key (id),
  constraint teams_abbreviation_key unique (abbreviation),
  constraint teams_city_key unique (city)
) TABLESPACE pg_default;

