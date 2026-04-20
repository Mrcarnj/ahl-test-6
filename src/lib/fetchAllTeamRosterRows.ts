import { supabase } from './supabase'
import { PLAYER_ROSTER_STATS_TABLE } from './rosterStatsTable'

const PAGE = 1000

/** `teamRosters.season_id` for regular season (frozen snapshot). */
export const REGULAR_SEASON_ROSTER_SEASON_ID = 90

/**
 * Load every row from the active roster stats table (`playoffStats`).
 * PostgREST caps each response (commonly 1000 rows).
 */
export async function fetchAllTeamRosterRows(): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(PLAYER_ROSTER_STATS_TABLE)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
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
 * Load every row from `teamRosters` for regular season (`season_id` 90).
 * PostgREST caps each response (commonly 1000 rows).
 */
export async function fetchAllRegularSeasonTeamRosterRows(): Promise<
  Record<string, unknown>[]
> {
  const rows: Record<string, unknown>[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('teamRosters')
      .select('*')
      .eq('season_id', REGULAR_SEASON_ROSTER_SEASON_ID)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
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
