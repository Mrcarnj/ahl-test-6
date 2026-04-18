import { supabase } from './supabase'

const PAGE = 1000

/**
 * Load every row from `teamRosters`. PostgREST caps each response (commonly 1000 rows).
 */
export async function fetchAllTeamRosterRows(): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('teamRosters')
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
