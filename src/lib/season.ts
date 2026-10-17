// src/lib/season.ts
//
// The single definition of which AHL season a date belongs to. This used to be
// duplicated in `icalHockeySync.js` (labelling rows on sync) and in
// `game/[id].tsx` (resolving a tapped game), each carrying a "must stay in
// sync" comment. They agreed on the rule and still broke, because the rule
// itself is only right for game dates.

const SEASON_CUTOVER_MONTH = 7; // July

/**
 * Season label for a calendar year + 1-based month, e.g. (2026, 10) -> "2026-27".
 *
 * The cutover is July, not October. Games themselves run October–June, so an
 * October cutover looks correct when applied to a game date — but assignments
 * for the coming season appear in the iCal feed over the summer, and preseason
 * can fall in late September. Applied to *today*, an October cutover meant that
 * from July 1 to September 30 every already-synced game of the upcoming season
 * was unreachable: the row said "2026-27" while "now" still said "2025-26".
 *
 * Nothing is played in July–September, so no real game date changes label.
 */
export function seasonLabelForYearMonth(year: number, month: number): string {
  const startYear = month >= SEASON_CUTOVER_MONTH ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

/**
 * Season label for a `YYYY-MM-DD` game date.
 *
 * The date is read straight off the string rather than through `new Date()`,
 * which parses a bare date as UTC midnight and then reports local components —
 * west of Greenwich that shifts the first of the month into the previous one,
 * so a game on the 1st would land in the wrong season.
 */
export function seasonLabelForGameDate(gameDate: string): string {
  const [year, month] = gameDate.split('-').map(Number);
  return seasonLabelForYearMonth(year, month);
}

/** Season label for today, so it cannot go stale at rollover. */
export function currentSeasonLabel(now: Date = new Date()): string {
  return seasonLabelForYearMonth(now.getFullYear(), now.getMonth() + 1);
}
