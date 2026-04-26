// HockeyTech playoff bracket (modulekit view=brackets). Season id is league-specific each year.
import { supabase } from './supabase';

const HOCKEYTECH_KEY = 'ccb91f29d6744675';
const CLIENT_CODE = 'ahl';
const LEAGUE_ID = '4';
const SITE_ID = '3';
/** How long DB-backed bracket data can age before a background/tab refresh hits the API again. */
const PLAYOFF_BRACKET_SYNC_INTERVAL_HOURS = 1;

/** Playoff bracket season id (distinct from regular-season id used in standings). Update when league republishes. */
export const PLAYOFF_BRACKET_SEASON_ID = 92;

export type BracketTeam = {
  id: string;
  city: string;
  team_code: string;
  name: string;
  division_long_name?: string;
  division_short_name?: string;
  conf_id?: string;
  logo?: string;
};

export type BracketMatchup = {
  series_letter: string;
  series_name: string;
  series_logo?: string;
  round: string;
  active?: string;
  feeder_series1?: string;
  feeder_series2?: string;
  team1: string;
  team2: string;
  winner?: string;
  games?: BracketGame[];
  team1_wins: number;
  team2_wins: number;
  ties?: number;
};

export type BracketGame = {
  game_id?: string;
  game_number?: string;
  game_num?: string;
  game?: string;
  date_time?: string;
  date?: string;
  game_date?: string;
  game_time?: string;
  status?: string;
  game_status?: string;
  game_status_string?: string;
  game_status_string_long?: string;
  home_id?: string;
  home_team_id?: string;
  home_team?: string;
  visitor_id?: string;
  visiting_team_id?: string;
  visiting_team?: string;
  home_goal_count?: string | number;
  visiting_goal_count?: string | number;
  home_score?: string | number;
  visiting_score?: string | number;
  if_necessary?: string | number | boolean;
  game_notes?: string;
  flo_hockey_url?: string;
  flo_core_event_id?: string;
  flo_live_event_id?: string;
};

export type BracketRound = {
  round: string;
  round_name?: string;
  season_id?: string;
  round_type_id?: string;
  round_type_name?: string;
  matchups: BracketMatchup[];
};

export type PlayoffBracketData = {
  teams: Record<string, BracketTeam>;
  rounds: BracketRound[];
  headerLogoUrl?: string;
  showTies?: boolean;
};

type HockeytechTeamMapRow = {
  api_team_id: number;
  api_team_code: string;
  team_abbreviation: string;
  team_name: string | null;
  updated_at: string;
};

type PlayoffSeriesRow = {
  season_id: number;
  series_letter: string;
  round: number;
  series_name: string;
  round_type_name: string | null;
  feeder_series1: string | null;
  feeder_series2: string | null;
  team1_api_team_id: number | null;
  team2_api_team_id: number | null;
  winner_api_team_id: number | null;
  team1_abbreviation: string | null;
  team2_abbreviation: string | null;
  winner_abbreviation: string | null;
  team1_wins: number;
  team2_wins: number;
  ties: number;
  active: boolean;
  content_en: string | null;
  content_fr: string | null;
  updated_at: string;
};

type PlayoffGamesRow = {
  game_id: number;
  season_id: number;
  series_letter: string;
  round: number;
  game_number: string | null;
  date_time: string | null;
  home_api_team_id: number | null;
  visiting_api_team_id: number | null;
  home_abbreviation: string | null;
  visiting_abbreviation: string | null;
  home_goal_count: number;
  visiting_goal_count: number;
  status: string | null;
  game_status: string | null;
  if_necessary: boolean;
  game_notes: string | null;
  flo_hockey_url: string | null;
  flo_core_event_id: string | null;
  flo_live_event_id: string | null;
  updated_at: string;
};

/** Map API `team_code` to `teams.abbreviation` / logos bucket filename (same as playerStatsSync). */
export function mapApiTeamCodeToAbbrev(teamCode: string): string {
  if (teamCode === 'LV') return 'LHV';
  return teamCode;
}

function toInt(n: unknown): number {
  if (n === null || n === undefined || n === '') return 0;
  const v = parseInt(String(n), 10);
  return Number.isNaN(v) ? 0 : v;
}

function toNullableInt(n: unknown): number | null {
  if (n === null || n === undefined || n === '' || n === '0') return null;
  const v = parseInt(String(n), 10);
  return Number.isNaN(v) ? null : v;
}

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

/** Top-to-bottom display order within a round: H, I, J, … */
function sortMatchupsBySeriesLetter(matchups: BracketMatchup[]): void {
  matchups.sort((a, b) =>
    String(a.series_letter ?? '').localeCompare(String(b.series_letter ?? ''), undefined, {
      sensitivity: 'base',
    })
  );
}

/**
 * Wins needed to clinch, from scheduled `games` length (HockeyTech lists all legs).
 * Round fallback when `games` is empty (TBD series).
 */
function winsToClinchSeries(matchup: BracketMatchup): number {
  const n = Array.isArray(matchup.games) ? matchup.games.length : 0;
  if (n >= 7) return 4;
  if (n >= 4) return 3;
  if (n >= 2) return 2;
  if (n === 1) return 2;
  const rnd = Number(matchup.round);
  if (Number.isNaN(rnd) || rnd <= 1) return 2;
  if (rnd === 2) return 3;
  return 4;
}

/**
 * `1` = team1 won, `2` = team2 won. Uses `winner` when the feed sets it; otherwise infers from
 * win totals vs series length (the API often leaves `winner` blank even when the series is over).
 */
export function bracketResolvedWinnerSlot(matchup: BracketMatchup): 1 | 2 | null {
  const id1 = String(matchup.team1 ?? '').trim();
  const id2 = String(matchup.team2 ?? '').trim();
  if (!id1 || id1 === '0' || !id2 || id2 === '0') return null;

  const raw = matchup.winner;
  if (raw != null && String(raw).trim() !== '' && String(raw).trim() !== '0') {
    const w = String(raw).trim();
    if (w === id1) return 1;
    if (w === id2) return 2;
  }

  const w1 = toInt(matchup.team1_wins);
  const w2 = toInt(matchup.team2_wins);
  if (w1 === w2) return null;

  const need = winsToClinchSeries(matchup);
  const hi = Math.max(w1, w2);
  const lo = Math.min(w1, w2);
  if (hi < need || lo >= need) return null;
  return w1 > w2 ? 1 : 2;
}

/** True if this team row lost a decided series (for bracket UI). */
export function isBracketTeamSlotEliminated(matchup: BracketMatchup, slot: 1 | 2): boolean {
  const won = bracketResolvedWinnerSlot(matchup);
  if (!won) return false;
  return slot !== won;
}

export async function fetchPlayoffBracket(
  seasonId: number = PLAYOFF_BRACKET_SEASON_ID
): Promise<PlayoffBracketData> {
  const u = new URL('https://lscluster.hockeytech.com/feed/index.php');
  u.searchParams.set('feed', 'modulekit');
  u.searchParams.set('view', 'brackets');
  u.searchParams.set('fmt', 'json');
  u.searchParams.set('season_id', String(seasonId));
  u.searchParams.set('key', HOCKEYTECH_KEY);
  u.searchParams.set('client_code', CLIENT_CODE);
  u.searchParams.set('league_id', LEAGUE_ID);
  u.searchParams.set('site_id', SITE_ID);
  u.searchParams.set('lang', 'en');

  const res = await fetch(u.toString());
  if (!res.ok) {
    throw new Error(`Bracket HTTP ${res.status}`);
  }
  const json = await res.json();
  const b = json?.SiteKit?.Brackets;
  if (!b || typeof b !== 'object') {
    throw new Error('Bracket payload missing');
  }

  const rounds: BracketRound[] = Array.isArray(b.rounds) ? b.rounds : [];
  const teams: Record<string, BracketTeam> =
    b.teams && typeof b.teams === 'object' ? b.teams : {};

  for (const r of rounds) {
    if (!Array.isArray(r.matchups)) {
      r.matchups = [];
    }
    for (const m of r.matchups) {
      m.team1_wins = toInt(m.team1_wins);
      m.team2_wins = toInt(m.team2_wins);
      m.games = Array.isArray(m.games) ? (m.games as BracketGame[]) : [];
    }
    sortMatchupsBySeriesLetter(r.matchups);
  }

  return {
    teams,
    rounds,
    headerLogoUrl: typeof b.logo === 'string' ? b.logo : undefined,
    showTies: Boolean(b.show_ties),
  };
}

export async function syncPlayoffBracketToDb(
  seasonId: number = PLAYOFF_BRACKET_SEASON_ID
): Promise<{ success: boolean; seriesUpserted: number; gamesUpserted: number; mapUpserted: number; error?: string }> {
  try {
    const bracket = await fetchPlayoffBracket(seasonId);
    const now = new Date().toISOString();

    const teamsByApiId: Record<string, BracketTeam> = bracket.teams || {};
    const mapRows: HockeytechTeamMapRow[] = Object.values(teamsByApiId)
      .filter((t) => t.id && t.team_code)
      .map((t) => ({
        api_team_id: toInt(t.id),
        api_team_code: t.team_code,
        team_abbreviation: mapApiTeamCodeToAbbrev(t.team_code),
        team_name: t.name || null,
        updated_at: now,
      }))
      .filter((r) => r.api_team_id > 0);

    if (mapRows.length > 0) {
      const { error: mapError } = await supabase
        .from('hockeytech_team_map')
        .upsert(mapRows, { onConflict: 'api_team_id' });
      if (mapError) throw mapError;
    }

    const seriesRows: PlayoffSeriesRow[] = [];
    const gamesRows: PlayoffGamesRow[] = [];

    for (const round of bracket.rounds || []) {
      const roundNum = toInt(round.round);
      for (const matchup of round.matchups || []) {
        const team1ApiId = toNullableInt(matchup.team1);
        const team2ApiId = toNullableInt(matchup.team2);
        const winnerApiId = toNullableInt(matchup.winner);

        const team1Code = team1ApiId ? teamsByApiId[String(team1ApiId)]?.team_code : null;
        const team2Code = team2ApiId ? teamsByApiId[String(team2ApiId)]?.team_code : null;
        const winnerCode = winnerApiId ? teamsByApiId[String(winnerApiId)]?.team_code : null;

        seriesRows.push({
          season_id: seasonId,
          series_letter: matchup.series_letter,
          round: roundNum,
          series_name: matchup.series_name ?? `Series ${matchup.series_letter}`,
          round_type_name: round.round_type_name ?? null,
          feeder_series1:
            matchup.feeder_series1 && matchup.feeder_series1 !== 'N/A' ? matchup.feeder_series1 : null,
          feeder_series2:
            matchup.feeder_series2 && matchup.feeder_series2 !== 'N/A' ? matchup.feeder_series2 : null,
          team1_api_team_id: team1ApiId,
          team2_api_team_id: team2ApiId,
          winner_api_team_id: winnerApiId,
          team1_abbreviation: team1Code ? mapApiTeamCodeToAbbrev(team1Code) : null,
          team2_abbreviation: team2Code ? mapApiTeamCodeToAbbrev(team2Code) : null,
          winner_abbreviation: winnerCode ? mapApiTeamCodeToAbbrev(winnerCode) : null,
          team1_wins: toInt(matchup.team1_wins),
          team2_wins: toInt(matchup.team2_wins),
          ties: toInt(matchup.ties),
          active: matchup.active == null ? true : toBool(matchup.active),
          content_en: (matchup as Record<string, unknown>).content_en as string | null,
          content_fr: (matchup as Record<string, unknown>).content_fr as string | null,
          updated_at: now,
        });

        const games = Array.isArray(matchup.games) ? matchup.games : [];
        games.forEach((game, gameIdx) => {
          const gameId = toInt(game.game_id);
          if (!gameId) return;
          const homeApiId = toNullableInt(game.home_team ?? game.home_team_id ?? game.home_id);
          const visitingApiId = toNullableInt(
            game.visiting_team ?? game.visiting_team_id ?? game.visitor_id
          );

          const homeCode = homeApiId ? teamsByApiId[String(homeApiId)]?.team_code : null;
          const visitingCode = visitingApiId ? teamsByApiId[String(visitingApiId)]?.team_code : null;

          gamesRows.push({
            game_id: gameId,
            season_id: seasonId,
            series_letter: matchup.series_letter,
            round: roundNum,
            game_number: game.game_num ?? game.game_number ?? game.game ?? String(gameIdx + 1),
            date_time: game.date_time ?? null,
            home_api_team_id: homeApiId,
            visiting_api_team_id: visitingApiId,
            home_abbreviation: homeCode ? mapApiTeamCodeToAbbrev(homeCode) : null,
            visiting_abbreviation: visitingCode ? mapApiTeamCodeToAbbrev(visitingCode) : null,
            home_goal_count: toInt(game.home_goal_count ?? game.home_score),
            visiting_goal_count: toInt(game.visiting_goal_count ?? game.visiting_score),
            status: game.status ? String(game.status) : null,
            game_status: game.game_status ? String(game.game_status) : null,
            if_necessary: toBool(game.if_necessary),
            game_notes: game.game_notes ?? null,
            flo_hockey_url: game.flo_hockey_url ?? null,
            flo_core_event_id: game.flo_core_event_id ?? null,
            flo_live_event_id: game.flo_live_event_id ?? null,
            updated_at: now,
          });
        });
      }
    }

    if (seriesRows.length > 0) {
      const { error: seriesError } = await supabase
        .from('playoff_series')
        .upsert(seriesRows, { onConflict: 'season_id,series_letter' });
      if (seriesError) throw seriesError;
    }

    if (gamesRows.length > 0) {
      const { error: gamesError } = await supabase
        .from('playoff_games')
        .upsert(gamesRows, { onConflict: 'game_id' });
      if (gamesError) throw gamesError;
    }

    return {
      success: true,
      seriesUpserted: seriesRows.length,
      gamesUpserted: gamesRows.length,
      mapUpserted: mapRows.length,
    };
  } catch (error) {
    return {
      success: false,
      seriesUpserted: 0,
      gamesUpserted: 0,
      mapUpserted: 0,
      error: error instanceof Error ? error.message : 'Unknown playoff sync error',
    };
  }
}

export async function shouldSyncPlayoffBracket(
  seasonId: number = PLAYOFF_BRACKET_SEASON_ID
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('playoff_series')
      .select('updated_at')
      .eq('season_id', seasonId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.updated_at) {
      return true;
    }

    const lastSync = new Date(data.updated_at);
    const now = new Date();
    const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
    return hoursSinceSync >= PLAYOFF_BRACKET_SYNC_INTERVAL_HOURS;
  } catch {
    return true;
  }
}

export async function fetchPlayoffBracketFromDb(
  seasonId: number = PLAYOFF_BRACKET_SEASON_ID
): Promise<PlayoffBracketData> {
  const [{ data: seriesRows, error: seriesError }, { data: gamesRows, error: gamesError }, { data: mapRows }] =
    await Promise.all([
      supabase
        .from('playoff_series')
        .select('*')
        .eq('season_id', seasonId)
        .order('round', { ascending: true }),
      supabase
        .from('playoff_games')
        .select('*')
        .eq('season_id', seasonId)
        .order('date_time', { ascending: true, nullsFirst: false }),
      supabase
        .from('hockeytech_team_map')
        .select('api_team_id, api_team_code, team_name'),
    ]);

  if (seriesError) throw seriesError;
  if (gamesError) throw gamesError;

  const mapByApiId = new Map<number, { api_team_code: string; team_name: string | null }>();
  for (const r of ((mapRows || []) as { api_team_id: number; api_team_code: string; team_name: string | null }[])) {
    mapByApiId.set(r.api_team_id, { api_team_code: r.api_team_code, team_name: r.team_name });
  }

  const teams: Record<string, BracketTeam> = {};
  for (const [apiId, mapped] of mapByApiId) {
    teams[String(apiId)] = {
      id: String(apiId),
      city: '',
      team_code: mapped.api_team_code,
      name: mapped.team_name || mapApiTeamCodeToAbbrev(mapped.api_team_code),
    };
  }

  const gamesBySeries = new Map<string, BracketGame[]>();
  for (const g of (gamesRows || []) as PlayoffGamesRow[]) {
    const list = gamesBySeries.get(g.series_letter) ?? [];
    list.push({
      game_id: String(g.game_id),
      game_number: g.game_number ?? undefined,
      date_time: g.date_time ?? undefined,
      home_team: g.home_api_team_id != null ? String(g.home_api_team_id) : undefined,
      visiting_team: g.visiting_api_team_id != null ? String(g.visiting_api_team_id) : undefined,
      home_goal_count: g.home_goal_count,
      visiting_goal_count: g.visiting_goal_count,
      status: g.status ?? undefined,
      game_status: g.game_status ?? undefined,
      if_necessary: g.if_necessary,
      game_notes: g.game_notes ?? undefined,
      flo_hockey_url: g.flo_hockey_url ?? undefined,
      flo_core_event_id: g.flo_core_event_id ?? undefined,
      flo_live_event_id: g.flo_live_event_id ?? undefined,
    });
    gamesBySeries.set(g.series_letter, list);
  }

  const roundsMap = new Map<number, BracketRound>();
  for (const s of (seriesRows || []) as PlayoffSeriesRow[]) {
    if (!roundsMap.has(s.round)) {
      roundsMap.set(s.round, {
        round: String(s.round),
        round_type_name: s.round_type_name ?? undefined,
        season_id: String(s.season_id),
        matchups: [],
      });
    }

    roundsMap.get(s.round)!.matchups.push({
      series_letter: s.series_letter,
      series_name: s.series_name,
      round: String(s.round),
      active: s.active ? '1' : '0',
      feeder_series1: s.feeder_series1 ?? undefined,
      feeder_series2: s.feeder_series2 ?? undefined,
      team1: s.team1_api_team_id != null ? String(s.team1_api_team_id) : '0',
      team2: s.team2_api_team_id != null ? String(s.team2_api_team_id) : '0',
      winner: s.winner_api_team_id != null ? String(s.winner_api_team_id) : undefined,
      team1_wins: toInt(s.team1_wins),
      team2_wins: toInt(s.team2_wins),
      ties: toInt(s.ties),
      games: gamesBySeries.get(s.series_letter) ?? [],
    });
  }

  const rounds = Array.from(roundsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, value]) => {
      sortMatchupsBySeriesLetter(value.matchups);
      return value;
    });

  return {
    teams,
    rounds,
    headerLogoUrl: undefined,
    showTies: false,
  };
}
