# Graph Report - ahl-fresh  (2026-09-29)

## Corpus Check
- 112 files · ~397,136 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 717 nodes · 1161 edges · 86 communities (38 shown, 48 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0bf46122`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- RosterProvider.tsx
- expo
- useSchedule
- icalHockeySync.js
- ScheduleProvider.tsx
- playoffBracket.ts
- NotificationProvider.tsx
- What You Must Do When Invoked
- scripts
- RulebookScreen.tsx
- ical-proxy.js
- ahlrosterupload.py
- [rosterId].tsx
- Architecture
- cloudflare-worker/package.json
- AHL iCal Proxy (Cloudflare Worker)
- dependencies
- [id].tsx
- include
- [teamId].tsx
- fetch_player_stats.py
- fetch_team_standings.py
- graphify reference: extra exports and benchmark
- fetch_player_roster.py
- graphify reference: query, path, explain
- Welcome to your Expo app 👋
- extractedPdfText.js
- alert.web.ts
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- calendar/_layout.tsx
- shareImage.web.ts
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- eslint.config.js
- icalHockeySync.d.ts
- graphify
- extraction-spec.md
- @react-native-async-storage/async-storage
- expo
- expo-background-fetch
- expo-build-properties
- expo-clipboard
- expo-constants
- expo-contacts
- expo-dev-client
- expo-device
- expo-file-system
- expo-font
- expo-image
- expo-linking
- expo-notifications
- expo-router
- expo-sharing
- expo-splash-screen
- expo-status-bar
- expo-symbols
- expo-system-ui
- @expo/vector-icons
- expo-web-browser
- global.d.ts
- ical.js
- react
- react-native-gesture-handler
- react-native
- react-native-calendars
- react-native-maps
- react-native-reanimated
- react-native-safe-area-context
- date-fns
- react-native-url-polyfill
- react-native-view-shot
- react-native-web
- react-native-webview
- react-native-worklets
- @react-navigation/bottom-tabs
- @react-navigation/elements
- @react-navigation/native
- @supabase/supabase-js

## God Nodes (most connected - your core abstractions)
1. `expo-router` - 25 edges
2. `useRoster()` - 25 edges
3. `useSchedule()` - 23 edges
4. `supabase` - 17 edges
5. `useAuth()` - 17 edges
6. `expo` - 15 edges
7. `BackgroundSyncService` - 13 edges
8. `ScheduleProvider()` - 13 edges
9. `fetchAndParseHockeySchedule()` - 12 edges
10. `What You Must Do When Invoked` - 12 edges

## Surprising Connections (you probably didn't know these)
- `PlayoffsScreen()` --calls--> `useSchedule()`  [EXTRACTED]
  src/app/(protected)/(tabs)/playoffs/index.tsx → src/providers/ScheduleProvider.tsx
- `handleRequest()` --calls--> `handleIcalProxy()`  [EXTRACTED]
  cloudflare-worker/index.js → cloudflare-worker/ical-proxy.js
- `TestScheduleScreen()` --calls--> `useRoster()`  [EXTRACTED]
  src/app/(protected)/(tabs)/home/index.tsx → src/providers/RosterProvider.tsx
- `PlayoffSeriesScreen()` --calls--> `useSchedule()`  [EXTRACTED]
  src/app/(protected)/(tabs)/playoffs/[seriesLetter].tsx → src/providers/ScheduleProvider.tsx
- `BracketTeamLogo()` --calls--> `getTeamLogo()`  [EXTRACTED]
  src/app/(protected)/(tabs)/playoffs/index.tsx → src/providers/ScheduleProvider.tsx

## Import Cycles
- 3-file cycle: `src/lib/icalHockeySync.js -> src/lib/notificationService.ts -> src/providers/ScheduleProvider.tsx -> src/lib/icalHockeySync.js`
- 3-file cycle: `src/lib/backgroundNotificationSync.ts -> src/lib/icalHockeySync.js -> src/lib/notificationService.ts -> src/lib/backgroundNotificationSync.ts`

## Communities (86 total, 48 thin omitted)

### Community 0 - "RosterProvider.tsx"
Cohesion: 0.07
Nodes (36): expo-background-fetch, expo-router, styles, Index(), RootLayoutNav(), ChangePassword(), styles, validatePassword() (+28 more)

### Community 1 - "expo"
Cohesion: 0.04
Nodes (47): package, permissions, projectId, typedRoutes, expo, android, experiments, extra (+39 more)

### Community 2 - "useSchedule"
Cohesion: 0.07
Nodes (40): CalendarScreen(), calendarTheme, CustomMarking, styles, AllGames(), styles, EXPENSE_SEASON_END, EXPENSE_SEASON_START (+32 more)

### Community 3 - "icalHockeySync.js"
Cohesion: 0.08
Nodes (34): HockeySyncButton(), HockeySyncButtonProps, styles, BackgroundSyncService, NOTE:, buildIcalRequest(), IcalRequest, cleanLocation() (+26 more)

### Community 4 - "ScheduleProvider.tsx"
Cohesion: 0.13
Nodes (30): fetchAllRegularSeasonTeamRosterRows(), fetchAllRows(), fetchAllTeamRosterRows(), REGULAR_SEASON_ROSTER_SEASON_ID, buildTeamIdToAbbrevMap(), CoachingStaff, extractCoachingStaff(), fetchPlayerStats() (+22 more)

### Community 5 - "playoffBracket.ts"
Cohesion: 0.10
Nodes (37): BracketTeamLogo(), MatchupCard(), PlayoffsScreen(), styles, teamAbbrevFromBracket(), findSeries(), formatPlayoffGameHeaderDate(), parseGame() (+29 more)

### Community 6 - "NotificationProvider.tsx"
Cohesion: 0.11
Nodes (15): DetailsRouteParams, GameRouteParams, styles, SyncBlockingOverlayHost(), styles, ToastState, APP_REFRESH_EVENT, SYNC_TOAST_EVENT (+7 more)

### Community 7 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 8 - "scripts"
Cohesion: 0.08
Nodes (23): eslint, eslint-config-expo, devDependencies, eslint, eslint-config-expo, @types/react, typescript, main (+15 more)

### Community 9 - "RulebookScreen.tsx"
Cohesion: 0.13
Nodes (16): PdfViewer(), PdfViewerProps, styles, styles, escapeRegex(), getRuleTitle(), getSectionTitle(), getSnippet() (+8 more)

### Community 10 - "ical-proxy.js"
Cohesion: 0.43
Nodes (6): allowedOrigins(), corsHeaders(), DEFAULT_ALLOWED_ORIGINS, handleIcalProxy(), originMatches(), handleRequest()

### Community 11 - "ahlrosterupload.py"
Cohesion: 0.14
Nodes (20): check_existing_user(), create_auth_user(), execute_sql(), get_auth_user_by_email(), get_phone_number(), insert_roster_entry(), process_csv_file(), process_csv_row() (+12 more)

### Community 12 - "[rosterId].tsx"
Cohesion: 0.18
Nodes (13): plugins, expo-contacts, expo-task-manager, Details(), styles, useContactsPermissions(), fetchImageBase64(), OfficialContact (+5 more)

### Community 13 - "Architecture"
Cohesion: 0.12
Nodes (15): Architecture, Commands, Data sync pipeline, graphify, Key season IDs / tables, Naming convention, Playoffs are hidden, Provider chain (`src/providers/`) (+7 more)

### Community 14 - "cloudflare-worker/package.json"
Cohesion: 0.17
Nodes (11): description, devDependencies, wrangler, main, name, scripts, deploy, dev (+3 more)

### Community 15 - "AHL iCal Proxy (Cloudflare Worker)"
Cohesion: 0.22
Nodes (8): AHL iCal Proxy (Cloudflare Worker), Allowed origins, Endpoints, License, Local development, Setup, Troubleshooting, Why this exists

### Community 16 - "dependencies"
Cohesion: 0.15
Nodes (13): date-fns-tz, expo-haptics, @expo/metro-runtime, dependencies, date-fns-tz, expo-haptics, @expo/metro-runtime, react-dom (+5 more)

### Community 17 - "[id].tsx"
Cohesion: 0.21
Nodes (15): formatRosterPlayerName(), formatRosterStat(), GameDetails(), gpSortGroup(), rosterNum(), rosterPlayersForTeam(), styles, TeamRosterStatsTables() (+7 more)

### Community 18 - "include"
Cohesion: 0.18
Nodes (10): expo-env.d.ts, expo/tsconfig.base, .expo/types/**/*.ts, **/*.ts, **/*.tsx, compilerOptions, paths, strict (+2 more)

### Community 19 - "[teamId].tsx"
Cohesion: 0.22
Nodes (6): ArenaDetails, styles, ArenaMap(), ArenaMapProps, styles, styles

### Community 20 - "fetch_player_stats.py"
Cohesion: 0.29
Nodes (9): fetch_api_data(), insert_players(), main(), map_team_code(), Insert/update players into Supabase, only writing changes, Map API team codes to database abbreviations, Fetch data from the HockeyTech API and parse JSONP response, Transform API data to match database schema (+1 more)

### Community 21 - "fetch_team_standings.py"
Cohesion: 0.29
Nodes (9): fetch_api_data(), main(), map_team_code(), Update teams in database, only writing changes, Map API team codes to database abbreviations, Fetch data from the HockeyTech API and parse JSONP response, Transform API data to match database schema, transform_standings_data() (+1 more)

### Community 22 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 23 - "fetch_player_roster.py"
Cohesion: 0.21
Nodes (13): build_team_id_to_abbrev(), extract_coaching_staff(), fetch_team_roster(), main(), Pull head coach + first two assistant coaches from the feed's staff block. The…, Write a team's coaching staff to `teams`, skipping the write when unchanged.…, Update players in database, only writing changes, HockeyTech numeric team_id -> teams.abbreviation, from the standings feed. (+5 more)

### Community 24 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 25 - "Welcome to your Expo app 👋"
Cohesion: 0.33
Nodes (5): Get a fresh project, Get started, Join the community, Learn more, Welcome to your Expo app 👋

### Community 26 - "extractedPdfText.js"
Cohesion: 0.50
Nodes (4): axios, extractTextFromPDF(), fs, pdf

### Community 27 - "alert.web.ts"
Cohesion: 0.40
Nodes (3): Alert, AlertButton, AlertButtonStyle

### Community 28 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 29 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 30 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 32 - "shareImage.web.ts"
Cohesion: 0.83
Nodes (3): dataUrlToFile(), download(), shareImage()

## Knowledge Gaps
- **257 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+252 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **48 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `expo-router` connect `RosterProvider.tsx` to `useSchedule`, `playoffBracket.ts`, `NotificationProvider.tsx`, `[rosterId].tsx`, `[id].tsx`, `[teamId].tsx`, `calendar/_layout.tsx`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Why does `expo` connect `expo` to `[rosterId].tsx`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `plugins` connect `[rosterId].tsx` to `RosterProvider.tsx`, `expo`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _257 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `RosterProvider.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07139079851930195 - nodes in this community are weakly interconnected._
- **Should `expo` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `useSchedule` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._