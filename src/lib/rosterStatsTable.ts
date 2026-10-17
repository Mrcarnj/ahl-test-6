/**
 * Supabase table for HockeyTech player stats + roster sync.
 *
 * Playoffs are hidden for now, so the active table is the regular season one
 * (`teamRosters`). To bring playoffs back, point this at `playoffStats` and the
 * season id at that playoff season.
 */
export const PLAYER_ROSTER_STATS_TABLE = 'teamRosters' as const

/** HockeyTech / DB season_id for the active skater stats + rosters (2026-27 regular season). */
export const PLAYER_ROSTER_SYNC_SEASON_ID = 94
