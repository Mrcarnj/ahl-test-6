# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

**AHL Officials** — a React Native/Expo app for AHL hockey officials. Each official authenticates, links their personal HorizonWebRef iCal feed, and the app syncs their game schedule, team rosters, standings, and playoff bracket from Supabase.

## Commands

```bash
# Start dev server (Expo Go or dev client)
npm start

# Native builds (requires dev client installed on device/sim)
expo run:ios
expo run:android

# Lint
npm run lint

# EAS builds (internal/production)
eas build --profile development
eas build --profile preview
eas build --profile production

# Cloudflare Worker (in cloudflare-worker/)
npm run dev    # local wrangler dev
npm run deploy # deploy to Cloudflare
```

TypeScript is checked by `expo lint` (eslint-config-expo). There is no separate test suite.

## Architecture

### Routing (`src/app/`)

File-based routing via expo-router. Route groups:

| Group | Purpose |
|---|---|
| `(auth)/` | Login screen — unauthenticated only |
| `(loginflow)/` | One-time onboarding: password change, TOS, iCal setup |
| `(protected)/(tabs)/` | Main app tabs: home, calendar, roster, playoffs, profile |
| `(protected)/game/[id]` | Game detail (team rosters, arena, coaches) |
| `(protected)/arena/[teamId]` | Arena map/info |
| `(protected)/official/[rosterId]` | Official profile |
| `(admin)/` | Admin-only screen |

`src/app/_layout.tsx` uses `Stack.Protected` guards: unauthenticated → `(auth)`, authenticated → `(loginflow)` + `(protected)`.

### Provider chain (`src/providers/`)

Providers wrap the entire app in this order (outermost first):

```
AuthProvider
  └── RosterProvider
        └── ScheduleProvider
              └── NotificationProvider
```

- **AuthProvider** — Supabase session, persists to AsyncStorage, emits `APP_REFRESH_EVENT` on startup and foreground-return (debounced: 5 min gap, 10 min min-background).
- **RosterProvider** — fetches the current official's row from `roster` table + all officials; 5-min AsyncStorage cache keyed by `rosterCache_<userId>`.
- **ScheduleProvider** — the central data hub. Listens for `APP_REFRESH_EVENT` and orchestrates the full sync pipeline (see below). Exposes `allGames`, `myGames`, `teamRosters` (playoffs), `teamRostersRegularSeason`, `playoffBracket`, sync status flags.
- **NotificationProvider** — registers push token, manages permissions.

### Data sync pipeline

On each startup/foreground event, **ScheduleProvider** runs:
1. **iCal sync** (`icalHockeySync.js`) — fetches the official's HorizonWebRef iCal URL, parses games, upserts to `schedule` table.
2. **Schedule fetch** — reads `schedule` + joined `teams` from Supabase filtered to this official.
3. **Background syncs** (gated to once per 24 h via AsyncStorage timestamps):
   - `syncPlayerStats` — HockeyTech API → `playoffStats` table (season 92).
   - `syncPlayerRoster` — HockeyTech team rosters → `playoffStats` table.
   - `syncTeamStandings` — HockeyTech standings → `teams` table (season 90 for regular season).
   - `syncPlayoffBracketToDb` — HockeyTech bracket API → `playoff_bracket` table (refreshed hourly).

A **Supabase Realtime** subscription on `schedule` also triggers instant UI updates + push notifications when a game changes.

A **Cloudflare Worker** (`cloudflare-worker/`) runs the player scraper + numbers scraper on a cron schedule to keep Supabase fresh server-side.

### Key season IDs / tables

| Data | Table | Season ID |
|---|---|---|
| Regular season standings | `teams` columns | 90 |
| Regular season player stats | `teamRosters` | 90 |
| Playoff player stats + rosters | `playoffStats` | 92 |
| Playoff bracket | `playoff_bracket` | 92 (`PLAYOFF_BRACKET_SEASON_ID`) |

When the season rolls over, update `PLAYOFF_BRACKET_SEASON_ID` in `src/lib/playoffBracket.ts` and the API URLs in `src/lib/playerStatsSync.ts`.

### Storage / assets

- **Supabase Storage buckets**: `logos` (team logos as `{ABBREV}.png`), `headshots` (`roster/{lastfirstfullname}.png`, `headCoaches/{ABBREV}.png`).
- **Local JSON**: `src/lib/RuleBookPdfText.json` and `src/lib/SituationBookPdfText.json` are embedded rule/situation book PDFs pre-extracted as text.
- **Assets**: `assets/rules/` contains PDF files for the in-app viewer.

### Timezone handling

Games are stored with a `timetz` column. `formatGameTime` in `ScheduleProvider` converts offsets to named abbreviations (EDT/EST/CDT/CST/MDT/MST/PDT/PST). For playoff bracket games (where HockeyTech sends wall-clock times with a fake UTC offset), use `formatGameTimeFromHomeWallClock` which re-interprets the time in the home team's IANA timezone (`teams.timezone`).

### Naming convention

Officials are matched by `roster.lastfirstfullname` (e.g., `"Dietrich, Mike"`). This field is used as the FK in `schedule` columns `referee1`, `referee2`, `linesperson1`, `linesperson2`.

## Theme

Dark UI throughout — `#000000` background, `#ff6600` accent (tab bar active, key CTAs).
