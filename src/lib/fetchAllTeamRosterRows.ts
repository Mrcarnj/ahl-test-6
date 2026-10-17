import { supabase } from './supabase'
import { PLAYER_ROSTER_STATS_TABLE, PLAYER_ROSTER_SYNC_SEASON_ID } from './rosterStatsTable'

const PAGE = 1000

/** `teamRosters.season_id` for the active regular season (2026-27). */
export const REGULAR_SEASON_ROSTER_SEASON_ID = PLAYER_ROSTER_SYNC_SEASON_ID

async function fetchAllRows(
  table: string,
  seasonId?: number,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let from = 0
  for (;;) {
    let query = supabase
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (seasonId != null) {
      query = query.eq('season_id', seasonId)
    }
    const { data, error } = await query
    if (error) {
      throw error
    }
    const batch = data ?? []
    if (batch.length === 0) {
      break
    }
    rows.push(...(batch as Record<string, unknown>[]))
    if (batch.length < PAGE) {
      break
    }
    from += PAGE
  }
  return rows
}

/**
 * Every row in the active roster stats table, regardless of season.
 * Used by the sync diff, which matches on player `id` across seasons.
 * PostgREST caps each response (commonly 1000 rows).
 */
export async function fetchAllTeamRosterRows(): Promise<Record<string, unknown>[]> {
  return fetchAllRows(PLAYER_ROSTER_STATS_TABLE)
}

/**
 * Every `teamRosters` row for the active regular season (`season_id` 94).
 * This is what the UI displays.
 */
export async function fetchAllRegularSeasonTeamRosterRows(): Promise<
  Record<string, unknown>[]
> {
  return fetchAllRows('teamRosters', REGULAR_SEASON_ROSTER_SEASON_ID)
}
