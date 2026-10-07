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
| `(protected)/(tabs)/` | Main app tabs: home, calendar, roster, clips, profile (playoffs route exists but is hidden) |
| `(protected)/game/[id]` | Game detail (team rosters, arena, coaches) |
| `(protected)/arena/[teamId]` | Arena map/info |
| `(protected)/official/[rosterId]` | Official profile |
| `(admin)/` | Admin-only screen |

`src/app/_layout.tsx` uses `Stack.Protected` guards: unauthenticated → `(auth)`, authenticated → `(loginflow)` + `(protected)`.

### Provider chain (`src/providers/`)

Providers wrap the entire app in this order (outermost first):

```
RosterProvider
  └── ScheduleProvider
        └── ClipsProvider
              └── NotificationProvider
```

(AuthProvider wraps all of it from the root layout.)

- **AuthProvider** — Supabase session, persists to AsyncStorage, emits `APP_REFRESH_EVENT` on startup and foreground-return (debounced: 5 min gap, 10 min min-background).
- **RosterProvider** — fetches the current official's row from `roster` table + all officials; 5-min AsyncStorage cache keyed by `rosterCache_<userId>`.
- **ScheduleProvider** — the central data hub. Listens for `APP_REFRESH_EVENT` and orchestrates the full sync pipeline (see below). Exposes `allGames`, `myGames`, `teamRostersRegularSeason`, sync status flags. (`teamRosters` and `playoffBracket` are still on the context but stay empty/null while playoffs are hidden.)
- **ClipsProvider** — every clip the official can see; AsyncStorage cache, refetch on `APP_REFRESH_EVENT`, Realtime on `clips`. Emits `CLIPS_UPLOADED_EVENT` for new crew clips (see Clips below).
- **NotificationProvider** — registers push token, manages permissions, schedules the 8 AM game-day reminders from `myGames`, and shows the `GameChangeAlert` pop-ups (game changes and new clips). It must stay innermost: it reads `useSchedule()`, and when it wrapped the others that returned the empty default context, so no reminder was ever scheduled.

### Data sync pipeline

Nothing in the sync blocks the UI. On startup **ScheduleProvider** first loads
the official's games straight from the DB so the app is usable immediately,
and runs the sync behind it (on foreground-return it just runs the sync):
1. **iCal sync** (`icalHockeySync.js`) — fetches the official's HorizonWebRef iCal URL, parses games, upserts to `schedule` table.
2. **Schedule fetch** — reads `schedule` + joined `teams` from Supabase filtered to this official. Team rosters load separately in the background and are never awaited.
3. **Background syncs** (gated to once per 24 h via AsyncStorage timestamps):
   - `syncPlayerStats` — HockeyTech API → `teamRosters` table (season 94).
   - `syncPlayerRoster` — HockeyTech team rosters → `teamRosters` table (season 94).
   - `syncTeamStandings` — HockeyTech standings → `teams` table (season 94).
   - `syncPlayoffBracketToDb` — disabled while playoffs are hidden.

**Season seed.** `seed_schedule.py` inserts the whole regular season from
HockeyTech once per season (insert-only: existing rows and their crews are
never touched), so admins see every game before anyone is assigned. Seeded
rows have no officials, which makes an assignment an *update* from empty: the
officials newly on the game get a "New Game Added" push, the rest of the crew
"Game Updated". Unassigned games aren't refreshed afterwards, so a postponed
game nobody works yet keeps its seeded date until a crew's iCal sync fixes it.

A **Supabase Realtime** subscription on `schedule` also triggers instant UI updates + push notifications when a game changes.

Stats and standings reach other officials' open apps the same way: Realtime on
`teamRosters` and `teams` (`sql/2026-10-05_realtime_rosters_standings.sql`)
reloads them once a burst of changes settles, and every return to the app
(at most once a minute) and every pull-to-refresh re-reads both from the DB.
Before this, rosters loaded only at startup, so only a full restart showed
another official's nightly sync.

**Change pop-ups.** Every applied schedule load is diffed against the last
schedule the official saw (`src/lib/scheduleChanges.ts`, persisted per user in
AsyncStorage as `scheduleSnapshot_v1_<auth_id>`). Upcoming games added,
updated or removed are emitted as `SCHEDULE_CHANGES_EVENT` and shown by
NotificationProvider through `GameChangeAlert`. Loads during a running sync
skip the diff and the sync checks once at the end, so a big import is one
pop-up. The first load on a device only records a baseline. A change already
shown as a game-change push isn't shown again (matched per field, 5 min).

All of this data comes from the **HockeyTech API** and is written by the app
itself — nothing syncs it server-side. Stats go stale only until the next time
someone opens the app.

A **Cloudflare Worker** (`cloudflare-worker/`) exists solely to proxy
HorizonWebRef iCal feeds with CORS headers for the web build. It holds no
credentials, touches no database and runs on no schedule. (It previously also
scraped theahl.com on a cron into `teamRosters`; that duplicated
`playerStatsSync.ts` and was removed — the scrapers are in git history.)

### Clips

Officials upload game video to a game from their schedule (today or earlier),
tag it from a preset list (`CLIP_TAGS` in `src/lib/clips.ts`), and the game's
crew sees it in their Clips tab. Schema, RLS and bucket are in
`sql/2026-10-04_clips.sql` (rollback beside it).

- **Data:** `clips` table + private `clips` bucket. Files live at
  `{schedule_id}/{clip_id}.{ext}` and `{schedule_id}/{clip_id}.jpg`
  (thumbnail, made on device). The first path segment is what the storage
  policies check.
- **Access:** view = the game's crew (live from `schedule`) + admins
  (`isAdmin`/`ahlAdmin`); upload = crew only; edit and delete = uploader or
  admin. Edits can change only `title`, `notes` and `tags` (column-level
  grant, `sql/2026-10-05_clips_edit.sql`; screen `clips/edit/[clipId]`).
  `uploaded_by`/`uploader_name` are set by a trigger, never by the client.
- **Speed:** lists load rows + batch-signed thumbnail URLs only (cached in
  memory, images disk-cached by expo-image under the storage path). The video
  URL is signed when the player opens. Search/filter run on the loaded list.
- **Upload** (`src/lib/clipUpload.ts`, web sibling `.web.ts`): PUT to a signed
  upload URL with RN's XHR and a `{ uri }` body (read natively, real
  `upload.onprogress`; expo-file-system's upload task never reported
  progress), files first, then the
  row, so nobody is alerted to a clip whose video isn't there yet.
- **Compression:** clips are re-encoded on device by `react-native-compressor`
  (a Nitro module) to 480p H.264 at 1.5 Mbps (`CLIP_MAX_EDGE` /
  `CLIP_BITRATE` in `clipUpload.ts`), starting as soon as a video is picked —
  ~6 MB per 30 s, and H.264 because iPhone HEVC won't play on Android/web.
  The picker hands over the original: its own presets fit *inside* 640x480
  (a portrait clip came out 296 px wide) at a fixed ~3.5 Mbps. Web uploads
  the file as picked.
- **Alerts:** the uploader's device pushes `type: 'clip_uploaded'` to the
  crew. While the app is open, ClipsProvider's Realtime + a per-user
  "newest clip seen" watermark (`clipsSeenAt_v1_<auth_id>`) emit
  `CLIPS_UPLOADED_EVENT`. NotificationProvider de-dupes by clip id and shows
  Close / Go to Clips, landing on `clips/game/[scheduleId]`.
- Max file size is 500 MB: the bucket's `file_size_limit`, `MAX_BYTES` in
  `clips/upload.tsx`, and the project-wide upload limit in the Supabase
  dashboard (Storage → Settings) all have to allow it.

### Admin view (`ahlAdmin`)

A roster row with `ahlAdmin = true` is league office, not an official. Read it
as `isAhlAdmin` from `useRoster()`. The switch is in ScheduleProvider: for an
admin, `myGames` (and `allGames`) is **every game of the current season** in
`schedule`, paged past PostgREST's 1000-row cap, so every screen that reads
`myGames` shows the whole league without its own branch. Prior seasons are not
loaded: the table keeps every season ever synced, and game details, uploads
and the expense cycle only use the current one. Screens read it from memory;
the DB is hit at startup, on refresh and on Realtime changes, never by opening
a screen. On top of that:

- **No iCal.** Login, TOS and `app/index.tsx` skip `ical-setup`;
  `syncScheduleFromIcal` just re-reads the DB (no banner); Realtime reloads on
  any schedule change.
- **No personal alerts.** No schedule-change diff/pop-ups and no 8 AM
  game-day reminders. Pushes only ever go to a game's crew anyway.
- **Home:** Today lists every game that day; no Upcoming Games list; the
  expense card keeps the countdown and date range but drops "Games on Report".
- **All Games** is a virtualized `SectionList` (it was a ScrollView that drew
  every card, which a full league season stalls).
- **Calendar:** a day with more than one game shows the count and opens
  `calendar/day/[date]`, a list of that day's games (this works the same for
  an official with two games in a day).
- **Clips:** every clip, no All / Mine / Crew toggle (search and tag filters
  stay). Admins can upload to any game —
  `sql/2026-10-05_admin_clip_upload.sql` (applied 2026-10-05) widens the
  crew-only insert policies to `private.is_admin()`.
- **Profile:** no game count / breakdown and no iCal URL.

### Key season IDs / tables

Current season is **2026-27 = HockeyTech season_id 94**.

| Data | Table | Season ID |
|---|---|---|
| Regular season standings | `teams` columns | 94 |
| Regular season player stats + rosters | `teamRosters` | 94 (`PLAYER_ROSTER_SYNC_SEASON_ID`) |
| Playoff player stats + rosters (inactive) | `playoffStats` | 92 |
| Playoff bracket (inactive) | `playoff_bracket` | 92 (`PLAYOFF_BRACKET_SEASON_ID`) |

When the season rolls over, update `PLAYER_ROSTER_SYNC_SEASON_ID` in `src/lib/rosterStatsTable.ts`, the API URLs in `src/lib/playerStatsSync.ts` (and the matching `fetch_*.py` scripts), `PLAYOFF_BRACKET_SEASON_ID` in `src/lib/playoffBracket.ts`, and `EXPENSE_SEASON_START` / `EXPENSE_SEASON_END` in `src/app/(protected)/(tabs)/home/index.tsx`, then bump `SEASON_ID` / `SEASON_LABEL` in `seed_schedule.py` and run it.
`EXPENSE_SEASON_START` **must be a Monday** (reports are due Mondays, every 14
days from it). Copying last year's date shifts the weekday: 2026-27 shipped
with Sept 22, a Tuesday, and every report showed a day late.

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
- **Local JSON**: `src/lib/RuleBookPdfText_2026_27.json` and `src/lib/SituationBookPdfText.json` are the rule/situation book PDFs pre-extracted as per-page search text (`page` = physical PDF page, which the viewer's `#page=` jumps to). Regenerate them with `extract_pdf_text.py` when a new book is posted, stripping the running header (see its docstring). `RulebookScreen.getSectionTitle` hardcodes the index's printed page range — check it against the new book.
- **Assets**: `assets/rules/` contains PDF files for the in-app viewer.

### Timezone handling

Games are stored with a `timetz` column. `formatGameTime` in `ScheduleProvider` converts offsets to named abbreviations (EDT/EST/CDT/CST/MDT/MST/PDT/PST). For playoff bracket games (where HockeyTech sends wall-clock times with a fake UTC offset), use `formatGameTimeFromHomeWallClock` which re-interprets the time in the home team's IANA timezone (`teams.timezone`).

### Naming convention

Officials are matched by `roster.lastfirstfullname` (e.g., `"Dietrich, Mike"`). This field is used as the FK in `schedule` columns `referee1`, `referee2`, `linesperson1`, `linesperson2`.

## Security

**RLS is on for every table** (`sql/2026-10-01_enable_rls.sql`, rollback beside
it). anon gets nothing; a signed-in user sees data only if they have a `roster`
row (`private.is_official()`). Officials can read everything the app shows and
insert/update what the client-side syncs write; nothing grants DELETE except an
official's own push tokens. Grants are explicit — but Supabase's default privileges still give
anon/authenticated **every** privilege on a new table in `public`, so a new
table needs `revoke all ... from anon, authenticated`, then exactly the grants
it uses, plus RLS policies (see `sql/2026-10-04_clips.sql`).

- `roster`: officials update only their own row, and only the onboarding
  columns (`ical_url`, `changedpassword`, `accepted_tos`, `tos_accepted_at`,
  `ical_entered`). Admin flags are not client-writable.
- `roster.ical_url` is personal. Read your own with `fetchMyIcalUrl()`
  (`src/lib/rosterColumns.ts`, RPC `get_my_ical_url`) and select roster with
  `ROSTER_COLUMNS`, never `select('*')`. Phase 2
  (`sql/2026-10-01_hide_ical_url.sql`) makes the DB enforce this; run it only
  once officials are on a native build containing this change.
- The Python scripts and `logoupload.py` need `SUPABASE_SERVICE_ROLE_KEY` in the
  environment — the anon key is blocked. Never commit that key.

**Login** relies on Supabase Auth's per-IP rate limits plus a client backoff
after repeated failures, with one generic error for a bad email or password.
There is deliberately no CAPTCHA: Supabase's CAPTCHA setting is project-wide
and would put a challenge on the iOS login too. Sign-ups are disabled;
accounts are created by an admin.

**Web shell** lives in `public/` (copied to the export root): `index.html`
template (meta/OG tags, https guard), favicons, `og-image.png`, `robots.txt`,
`sitemap.xml`, the support page `support.html` (the App Store Support URL), and
the legal pages `privacy.html` / `terms.html`, whose text is
kept in `docs/legal/*.md`. `src/lib/legal.ts` holds the legal and support URLs.

## Theme

Dark UI throughout — `#000000` background, `#ff6600` accent (tab bar active, key CTAs).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
