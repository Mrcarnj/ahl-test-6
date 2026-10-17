#!/usr/bin/env python3
"""
Seed the season's games into `schedule` from the HockeyTech schedule feed.

Inserts only: a game already in `schedule` (same gameid + season) is left
exactly as it is, so crews the iCal sync has filled are never touched. New rows
have no officials; each official's iCal sync fills them in as games are
assigned (and sends "New Game Added" to whoever was put on the game).

The script prints SQL; run it against the linked project with the Supabase CLI:

    python3 seed_schedule.py --check > /tmp/seed_check.sql   # dry run: counts only
    supabase db query --linked -f /tmp/seed_check.sql
    python3 seed_schedule.py > /tmp/seed.sql
    supabase db query --linked -f /tmp/seed.sql

Run it once per season, after updating SEASON_ID / SEASON_LABEL.
"""

import json
import sys
import urllib.request

SEASON_ID = 94
SEASON_LABEL = "2026-27"  # schedule.season, as seasonLabelForGameDate() writes it

API_URL = (
    "https://lscluster.hockeytech.com/feed/index.php?feed=modulekit&view=schedule"
    f"&season_id={SEASON_ID}&key=ccb91f29d6744675&client_code=ahl&fmt=json&lang_code=en"
)

# HockeyTech city -> teams.city
CITY_ALIASES = {
    "Wilkes-Barre/Scranton": "Wilkes-Barre",
}

# teams.timezone -> the fixed offset the iCal sync stamps on gametime
# (getTimezoneOffset in src/lib/icalHockeySync.js). It ignores daylight saving,
# and gametime is compared as a string, so a different offset here would read
# as a time change -- and a push -- on the first iCal sync of every game.
OFFSETS_SQL = """case h.timezone
      when 'PST' then '-08:00' when 'PDT' then '-08:00'
      when 'EST' then '-04:00' when 'EDT' then '-04:00'
      when 'CST' then '-06:00' when 'CDT' then '-06:00'
      when 'MST' then '-07:00' when 'MDT' then '-07:00'
    end"""


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def fetch_games() -> list:
    with urllib.request.urlopen(API_URL) as response:
        data = json.load(response)
    return data["SiteKit"]["Schedule"]


def to_values(games: list) -> list:
    rows = []
    for g in games:
        if g.get("date_tbd") != "0" or g.get("time_tbd") != "0":
            print(f"-- skipped game {g.get('game_number')}: date/time TBD", file=sys.stderr)
            continue
        # GameDateISO8601 is the home arena's wall clock, e.g. 2026-10-03T15:00:00-07:00
        date, clock = g["GameDateISO8601"][:10], g["GameDateISO8601"][11:19]
        away = CITY_ALIASES.get(g["visiting_team_city"], g["visiting_team_city"])
        home = CITY_ALIASES.get(g["home_team_city"], g["home_team_city"])
        rows.append(f"({sql_text(g['game_number'])}, {sql_text(away)}, {sql_text(home)}, "
                    f"{sql_text(date)}::date, {sql_text(clock)})")
    return rows


def build_sql(rows: list, check: bool) -> str:
    feed = f"""with feed (gameid, awayteam, hometeam, gamedate, clock) as (
  values
  {(","+chr(10)+"  ").join(rows)}
),
seed as (
  select f.gameid, '{SEASON_LABEL}' as season, f.awayteam, f.hometeam, f.gamedate,
    (f.clock || {OFFSETS_SQL})::timetz as gametime,
    'Regular' as gamecode
  from feed f
  left join teams h on h.city = f.hometeam
)"""
    if check:
        return feed + f"""
select
  count(*) as feed_games,
  count(*) filter (where s.gametime is null) as unknown_home_team_or_timezone,
  count(*) filter (where not exists (select 1 from teams t where t.city = s.awayteam)) as unknown_away_team,
  count(*) filter (where e.gameid is not null) as already_in_schedule,
  count(*) filter (where e.gameid is null) as would_insert,
  -- games the iCal sync already wrote that the seed would have written
  -- differently (it leaves them alone; this checks the time format matches)
  count(*) filter (where e.gameid is not null and (e.awayteam, e.hometeam, e.gamedate, e.gametime)
    is distinct from (s.awayteam, s.hometeam, s.gamedate, s.gametime)) as differs_from_ical
from seed s
left join schedule e on e.gameid = s.gameid and e.season = s.season;
"""
    return feed + """
insert into schedule (gameid, season, awayteam, hometeam, gamedate, gametime, gamecode)
select gameid, season, awayteam, hometeam, gamedate, gametime, gamecode from seed
on conflict (gameid, season) do nothing;
"""


def main():
    check = "--check" in sys.argv[1:]
    games = fetch_games()
    rows = to_values(games)
    print(f"-- {len(games)} games in the feed for season {SEASON_ID}", file=sys.stderr)
    print(build_sql(rows, check))


if __name__ == "__main__":
    main()
