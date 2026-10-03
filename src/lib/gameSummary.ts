// HockeyTech game summary for one game: lineups, penalties and goals. Feeds
// the incident report builder, which turns a picked player + penalty into the
// report's player, period, clock and score fields.
//
// Like the other HockeyTech feeds, this sends no CORS headers, so it only
// works from the native app.

const GAME_SUMMARY_URL =
  'https://lscluster.hockeytech.com/feed/index.php?feed=gc&tab=gamesummary&key=ccb91f29d6744675&client_code=ahl&fmt=json&lang_code=en';

/** Regulation period length, used when the feed doesn't say. */
const DEFAULT_PERIOD_SECONDS = 20 * 60;

/** HockeyTech's game id for an AHL game number ("4" -> 1029074). */
export function hockeyTechGameId(gameNumber: string | number): number {
  return 1029070 + Number(gameNumber);
}

export interface SummaryTeam {
  id: string;
  code: string;
  name: string;
}

export interface SummaryPlayer {
  playerId: string;
  number: string;
  name: string;
  position: string;
}

export interface SummaryPenalty {
  key: string;
  teamId: string;
  period: number;
  periodLabel: string;
  /** Seconds elapsed in the period. */
  seconds: number;
  /** Elapsed time as HockeyTech shows it, e.g. "13:17". */
  time: string;
  minutes: string;
  /** e.g. "Minor", "Major", "Game Misconduct", "Match". */
  penaltyClass: string;
  offence: string;
  playerId: string | null;
  playerNumber: string | null;
  playerName: string | null;
}

export interface SummaryGoal {
  teamId: string;
  period: number;
  seconds: number;
}

export interface GameSummary {
  home: SummaryTeam;
  visitor: SummaryTeam;
  homeRoster: SummaryPlayer[];
  visitorRoster: SummaryPlayer[];
  /** Coaches as roster rows: no number, `position` holds the role. */
  homeCoaches: SummaryPlayer[];
  visitorCoaches: SummaryPlayer[];
  penalties: SummaryPenalty[];
  goals: SummaryGoal[];
  /** Period id -> length in seconds (OT is 5:00 in the regular season). */
  periodSeconds: Record<number, number>;
}

function fullName(p: { first_name?: string; last_name?: string } | null | undefined) {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ');
}

function toTeam(t: any): SummaryTeam {
  return { id: String(t.id), code: t.code ?? '', name: t.name ?? '' };
}

function toRoster(lineup: any): SummaryPlayer[] {
  const people = [...(lineup?.goalies ?? []), ...(lineup?.players ?? [])];
  return people
    .map((p: any) => ({
      playerId: String(p.player_id),
      number: String(p.jersey_number ?? ''),
      name: fullName(p),
      position: p.position_str ?? '',
    }))
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));
}

function toCoaches(coaches: any[] | undefined): SummaryPlayer[] {
  return (coaches ?? []).map((c: any) => ({
    playerId: `coach-${c.person_id}`,
    number: '',
    name: fullName(c),
    position: c.description ?? '',
  }));
}

export async function fetchGameSummary(gameNumber: string | number): Promise<GameSummary> {
  const res = await fetch(`${GAME_SUMMARY_URL}&game_id=${hockeyTechGameId(gameNumber)}`);
  if (!res.ok) throw new Error(`Game summary request failed (${res.status})`);
  const json = await res.json();
  const gs = json?.GC?.Gamesummary;
  if (!gs?.home || !gs?.visitor) throw new Error('Game summary not available');

  const periodSeconds: Record<number, number> = {};
  for (const p of Object.values<any>(gs.periods ?? {})) {
    periodSeconds[Number(p.id)] = Number(p.length) || DEFAULT_PERIOD_SECONDS;
  }

  const penalties: SummaryPenalty[] = (gs.penalties ?? []).map((p: any, i: number) => {
    const player = p.player_penalized_info;
    return {
      key: String(i),
      teamId: String(p.team_id),
      period: Number(p.period_id),
      periodLabel: p.period ?? String(p.period_id),
      seconds: Number(p.s) || 0,
      time: p.time_off_formatted ?? '',
      minutes: String(p.minutes ?? ''),
      penaltyClass: p.penalty_class ?? '',
      offence: p.lang_penalty_description ?? '',
      playerId: player?.player_id ? String(player.player_id) : null,
      playerNumber: player?.jersey_number ? String(player.jersey_number) : null,
      playerName: player ? fullName(player) || null : null,
    };
  });

  const goals: SummaryGoal[] = (gs.goals ?? []).map((g: any) => ({
    teamId: String(g.team_id),
    period: Number(g.period_id),
    seconds: Number(g.s) || 0,
  }));

  return {
    home: toTeam(gs.home),
    visitor: toTeam(gs.visitor),
    homeRoster: toRoster(gs.home_team_lineup),
    visitorRoster: toRoster(gs.visitor_team_lineup),
    homeCoaches: toCoaches(gs.coaches?.home),
    visitorCoaches: toCoaches(gs.coaches?.visitor),
    penalties,
    goals,
    periodSeconds,
  };
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Time left on the clock at a penalty. HockeyTech records elapsed time, the
 * report wants the clock: 13:17 into a 20:00 period is 6:43.
 */
export function clockRemaining(summary: GameSummary, penalty: SummaryPenalty): string {
  const length = summary.periodSeconds[penalty.period] ?? DEFAULT_PERIOD_SECONDS;
  return formatClock(length - penalty.seconds);
}

/**
 * Score at the moment of a penalty: every goal up to and including the
 * penalty's time. A goal at the same second counts — the whistle for a
 * penalty on the play comes after the puck went in.
 */
export function scoreAtPenalty(summary: GameSummary, penalty: SummaryPenalty) {
  let visitor = 0;
  let home = 0;
  for (const g of summary.goals) {
    const before =
      g.period < penalty.period ||
      (g.period === penalty.period && g.seconds <= penalty.seconds);
    if (!before) continue;
    if (g.teamId === summary.home.id) home++;
    else if (g.teamId === summary.visitor.id) visitor++;
  }
  return { visitor, home };
}

/** The incident report's "Period" radio options. */
export function reportPeriodLabel(period: number): string {
  if (period === 1) return '1st';
  if (period === 2) return '2nd';
  if (period === 3) return '3rd';
  return 'Overtime';
}
