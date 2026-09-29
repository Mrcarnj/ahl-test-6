# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

**AHL Officials** — a React Native/Expo app for AHL hockey officials. Each official authenticates, links their personal HorizonWebRef iCal feed, and the app syncs their game schedule, team rosters, and standings from Supabase.

## Commands

```bash
# Start dev server (Expo Go or dev client)
npm start

# Native builds (requires dev client installed on device/sim)
expo run:ios
expo run:android

# Web (browser) — dev server
npm run web

# Web — production export + deploy to EAS Hosting
npm run web:export
npm run web:deploy       # preview URL
npm run web:deploy:prod  # production

# Lint
npm run lint

# EAS builds (internal/production)
eas build --profile development
eas build --profile preview
eas build --profile production

# Cloudflare Worker — iCal CORS proxy for the web build (in cloudflare-worker/)
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
| `(protected)/(tabs)/` | Main app tabs: home, calendar, roster, profile (playoffs route exists but is hidden) |
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
- **ScheduleProvider** — the central data hub. Listens for `APP_REFRESH_EVENT` and orchestrates the full sync pipeline (see below). Exposes `allGames`, `myGames`, `teamRostersRegularSeason`, sync status flags. (`teamRosters` and `playoffBracket` are still on the context but stay empty/null while playoffs are hidden.)
- **NotificationProvider** — registers push token, manages permissions.

### Data sync pipeline

On each startup/foreground event, **ScheduleProvider** runs:
1. **iCal sync** (`icalHockeySync.js`) — fetches the official's HorizonWebRef iCal URL, parses games, upserts to `schedule` table.
2. **Schedule fetch** — reads `schedule` + joined `teams` from Supabase filtered to this official.
3. **Background syncs** (gated to once per 24 h via AsyncStorage timestamps):
   - `syncPlayerStats` — HockeyTech API → `teamRosters` table (season 94).
   - `syncPlayerRoster` — HockeyTech team rosters → `teamRosters` table (season 94).
   - `syncTeamStandings` — HockeyTech standings → `teams` table (season 94).
   - `syncPlayoffBracketToDb` — disabled while playoffs are hidden.

A **Supabase Realtime** subscription on `schedule` also triggers instant UI updates + push notifications when a game changes.

All of this data comes from the **HockeyTech API** and is written by the app
itself — nothing syncs it server-side. Stats go stale only until the next time
someone opens the app.

A **Cloudflare Worker** (`cloudflare-worker/`) exists solely to proxy
HorizonWebRef iCal feeds with CORS headers for the web build. It holds no
credentials, touches no database and runs on no schedule. (It previously also
scraped theahl.com on a cron into `teamRosters`; that duplicated
`playerStatsSync.ts` and was removed — the scrapers are in git history.)

### Key season IDs / tables

Current season is **2026-27 = HockeyTech season_id 94**.

| Data | Table | Season ID |
|---|---|---|
| Regular season standings | `teams` columns | 94 |
| Regular season player stats + rosters | `teamRosters` | 94 (`PLAYER_ROSTER_SYNC_SEASON_ID`) |
| Playoff player stats + rosters (inactive) | `playoffStats` | 92 |
| Playoff bracket (inactive) | `playoff_bracket` | 92 (`PLAYOFF_BRACKET_SEASON_ID`) |

When the season rolls over, update `PLAYER_ROSTER_SYNC_SEASON_ID` in `src/lib/rosterStatsTable.ts`, the API URLs in `src/lib/playerStatsSync.ts` (and the matching `fetch_*.py` scripts), `PLAYOFF_BRACKET_SEASON_ID` in `src/lib/playoffBracket.ts`, and `EXPENSE_SEASON_START` / `EXPENSE_SEASON_END` in `src/app/(protected)/(tabs)/home/index.tsx`.

Those last two do double duty: they drive the 14-day expense-report cycle *and*
bound which games can appear on a report. `myGames` keeps prior seasons, and the
playoff branch of `gamesOnExpenseReport` matches on game code rather than date,
so without that bound last season's playoff games (`M2`, `O3`, …) surface on the
new season's first reports.

### Playoffs are hidden

Playoffs are switched off for 2026-27. Nothing was deleted — the routes under
`(protected)/(tabs)/playoffs/` and `src/lib/playoffBracket.ts` are intact. To bring them back:

1. `(tabs)/_layout.tsx` — restore the `tabBarLabel`/`tabBarIcon` options on the `playoffs` screen (currently `href: null`).
2. `ScheduleProvider.tsx` — replace the `refreshPlayoffBracket` no-op stub with the commented-out implementation below it, restore the three `useState` lines for bracket state and the `teamRosters` state, and re-add the post-standings bracket sync in `runBackgroundSyncs`.
3. `src/lib/rosterStatsTable.ts` — point `PLAYER_ROSTER_STATS_TABLE` back at `playoffStats` and set the playoff season id.
4. `game/[id].tsx` — restore `TeamSeasonRosterPager` (the Playoffs / Regular Season toggle) from git history.
5. Bump `PLAYOFF_BRACKET_SEASON_ID` to the new playoff season.

### Web build

The same Expo Router app also builds for the browser (`npm run web`). There is
one codebase; platform differences are handled two ways:

- **`.web.tsx` / `.web.ts` siblings** for anything with no browser
  implementation. Metro picks these automatically on web:

  | Module | Native | Web |
  |---|---|---|
  | `components/PdfViewer` | `react-native-webview` | `<iframe>` (browser PDF viewer) |
  | `components/ArenaMap` | `react-native-maps` | Google Maps embed `<iframe>` |
  | `lib/alert` | RN `Alert` | `window.alert` / `window.confirm` (RN Web's `Alert.alert` is a **silent no-op**) |
  | `lib/saveContact` | `expo-contacts` | vCard `.vcf` download |
  | `lib/fetchImageBase64` | `expo-file-system` | `fetch` + `FileReader` |
  | `lib/shareImage` | `expo-sharing` | Web Share API, falling back to download |
  | `lib/icalFeed` | direct fetch | Cloudflare Worker `/ical` proxy (CORS) |

- **`isWeb` from `src/lib/platform.ts`** for in-file branching (push
  notifications are skipped on web; the home screen drops its Rulebook /
  Situation Book buttons because they are menu items there).

**Navigation.** `(tabs)/_layout.tsx` renders one `Tabs` navigator for both
platforms. On native it draws the bottom tab bar; on web `tabBar` returns null
and `components/nav/WebShell.tsx` supplies a left sidebar (>= 900px) or a
hamburger drawer (below that). Menu entries live in
`components/nav/navItems.ts` — add a route there and both platforms pick it up.

Note this branches *inside* `_layout.tsx` rather than using a `_layout.web.tsx`:
expo-router derives route names from filenames without stripping a `.web`
suffix, so such a file would register as a route, not as the layout. Platform
siblings are fine everywhere outside `src/app/`.

**Rulebook / Situation Book** are now top-level routes
(`(tabs)/rulebook.tsx`, `(tabs)/situation-book.tsx`) re-exporting
`src/screens/`. They are `href: null` on native and reached from the home
screen; on web they are sidebar links.

**iCal sync on web** requires the Cloudflare Worker's `/ical` proxy, because
HorizonWebRef sends no CORS headers. Set `EXPO_PUBLIC_ICAL_PROXY_URL`
(see `.env.example`). `localhost` is allowed by default; add the deployed web
app's origin to `ICAL_ALLOWED_ORIGINS` in `cloudflare-worker/wrangler.toml`.

Note that `EXPO_PUBLIC_*` values are inlined at transform time and Metro caches
the result, so a stale cache bakes in the old value — for this variable that
means a bundle whose iCal sync throws on every call, with no build error.
`npm run web:export` passes `--clear` for that reason; after editing `.env`
during development, restart with `npm run web -- --clear`.

**Not available on web:** push notifications and background fetch. Game changes
still arrive live through the Supabase Realtime subscription.

Auth is unchanged across platforms — Supabase sessions persist through
AsyncStorage, which is backed by `localStorage` in the browser.

### Teams

BRI (Bridgeport) left the league after 2025-26 and HAM (Hamilton Hammers, HockeyTech
`team_id` 457) joined for 2026-27. BRI's rows are intentionally left in `teams` /
`teamRosters` (with stale 2025-26 standings) but it is no longer in any sync's team list.

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

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
