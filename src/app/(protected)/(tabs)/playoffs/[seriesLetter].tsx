import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { format, isValid, parse } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BracketGame, BracketMatchup, BracketTeam } from '@/src/lib/playoffBracket';
import { mapApiTeamCodeToAbbrev } from '@/src/lib/playoffBracket';
import { supabase } from '@/src/lib/supabase';
import {
  formatGameTimeFromHomeWallClock,
  getTeamLogo,
  stripBracketFeedUtcNoise,
  useSchedule,
  type Team,
} from '@/src/providers/ScheduleProvider';

function teamAbbrev(teams: Record<string, BracketTeam>, teamId: string): string {
  if (!teamId || teamId === '0' || !teams[teamId]?.team_code) return 'TBD';
  return mapApiTeamCodeToAbbrev(teams[teamId].team_code);
}

function teamLogo(teamAbbreviation: string): string {
  if (teamAbbreviation === 'TBD') return '';
  return getTeamLogo({ abbreviation: teamAbbreviation } as Team);
}

function formatPlayoffGameHeaderDate(isoDate: string): string {
  if (!isoDate || isoDate === 'TBD') return isoDate;
  const d = parse(isoDate, 'yyyy-MM-dd', new Date());
  if (!isValid(d)) return isoDate;
  return format(d, 'EEEE, MMMM d, yyyy');
}

function parseIfNecessary(game: BracketGame): boolean {
  const v = game.if_necessary;
  if (v === true || v === 1 || v === '1') return true;
  if (v === false || v === 0 || v === '0' || v === 'false' || v == null || v === '') return false;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    return s === 'true' || s === 'yes';
  }
  return false;
}

function parseGame(game: BracketGame, index: number) {
  const number =
    game.game_num ??
    game.game_number ??
    (typeof (game as Record<string, unknown>).game === 'string'
      ? ((game as Record<string, unknown>).game as string)
      : String(index + 1));
  const dateTimeRaw = game.date_time ?? null;
  let date = game.game_date ?? game.date ?? 'TBD';
  let time = '';
  if (dateTimeRaw) {
    if (dateTimeRaw.includes('T')) {
      const [d, rest] = dateTimeRaw.split('T');
      date = d || date;
      time = rest.replace(/Z$/i, '').trim();
    } else {
      const parts = dateTimeRaw.split(' ');
      date = parts[0] || date;
      time = parts.slice(1).join(' ') || '';
    }
  }
  if (!time) {
    time =
      (game.game_time ??
        (typeof (game as Record<string, unknown>).scheduled_time === 'string'
          ? ((game as Record<string, unknown>).scheduled_time as string)
          : '')) || '';
  }
  const status = game.game_status_string_long ?? game.game_status_string ?? game.game_status ?? '';

  time = stripBracketFeedUtcNoise(time);

  const homeId = String(game.home_team ?? game.home_team_id ?? game.home_id ?? '');
  const awayId = String(game.visiting_team ?? game.visiting_team_id ?? game.visitor_id ?? '');
  const homeScore = String(game.home_goal_count ?? game.home_score ?? '-');
  const awayScore = String(game.visiting_goal_count ?? game.visiting_score ?? '-');
  const ifNecessary = parseIfNecessary(game);

  return { number, date, time, status, homeId, awayId, homeScore, awayScore, ifNecessary };
}

function findSeries(seriesLetter: string, rounds: { matchups: BracketMatchup[] }[]) {
  for (const round of rounds) {
    const hit = round.matchups.find((m) => m.series_letter === seriesLetter);
    if (hit) return hit;
  }
  return null;
}

export default function PlayoffSeriesScreen() {
  const { seriesLetter } = useLocalSearchParams<{ seriesLetter: string }>();
  const { playoffBracket, refreshPlayoffBracket } = useSchedule();
  const teams = useMemo(() => playoffBracket?.teams ?? {}, [playoffBracket]);
  const rounds = playoffBracket?.rounds ?? [];
  const series = seriesLetter ? findSeries(seriesLetter, rounds) : null;

  const homeAbbrevKeys = useMemo(() => {
    if (!series) return '';
    const g = Array.isArray(series.games) ? series.games : [];
    const set = new Set<string>();
    const seriesHome = teamAbbrev(teams, series.team1);
    for (let i = 0; i < g.length; i++) {
      const p = parseGame(g[i], i);
      const ha = p.homeId ? teamAbbrev(teams, p.homeId) : seriesHome;
      if (ha && ha !== 'TBD') set.add(ha);
    }
    return [...set].sort().join('|');
  }, [series, teams]);

  const [tzByAbbrev, setTzByAbbrev] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!homeAbbrevKeys) return;
    const list = homeAbbrevKeys.split('|').filter(Boolean);
    if (list.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('abbreviation, timezone')
        .in('abbreviation', list);
      if (cancelled || error || !data) return;
      const next: Record<string, string> = {};
      for (const row of data) {
        if (row.abbreviation && row.timezone) next[row.abbreviation] = row.timezone;
      }
      setTzByAbbrev((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [homeAbbrevKeys]);

  useFocusEffect(
    useCallback(() => {
      void refreshPlayoffBracket();
    }, [refreshPlayoffBracket])
  );

  if (!series) {
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
        <View style={styles.centerBlock}>
          <Text style={styles.emptyText}>Series not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const homeAbbrev = teamAbbrev(teams, series.team1);
  const awayAbbrev = teamAbbrev(teams, series.team2);
  const games = Array.isArray(series.games) ? series.games : [];

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.summaryCard}>
          <View style={styles.teamSummary}>
            {awayAbbrev !== 'TBD' ? (
              <Image source={{ uri: teamLogo(awayAbbrev) }} style={styles.summaryLogo} resizeMode="contain" />
            ) : (
              <View style={styles.tbdSummaryLogo}>
                <Text style={styles.tbdText}>TBD</Text>
              </View>
            )}
            <Text style={styles.summaryAbbrev}>{awayAbbrev}</Text>
          </View>

          <View style={styles.summaryCenter}>
            <Text style={styles.roundText}>Series {series.series_letter}</Text>
            <Text style={styles.scoreBig}>
              {series.team1_wins}-{series.team2_wins}
            </Text>
            <Text style={styles.seriesName}>{series.series_name}</Text>
          </View>

          <View style={styles.teamSummary}>
            {homeAbbrev !== 'TBD' ? (
              <Image source={{ uri: teamLogo(homeAbbrev) }} style={styles.summaryLogo} resizeMode="contain" />
            ) : (
              <View style={styles.tbdSummaryLogo}>
                <Text style={styles.tbdText}>TBD</Text>
              </View>
            )}
            <Text style={styles.summaryAbbrev}>{homeAbbrev}</Text>
          </View>
        </View>

        {games.length === 0 ? (
          <View style={[styles.noGamesCard, styles.belowSummary]}>
            <Text style={styles.noGamesText}>No games posted in the bracket feed yet.</Text>
            <Text style={styles.noGamesSubText}>
              Once games are published for this series, they will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.gameList}>
            {games.map((g, i) => {
              const parsed = parseGame(g, i);
              const awayGameAbbrev = parsed.awayId ? teamAbbrev(teams, parsed.awayId) : awayAbbrev;
              const homeGameAbbrev = parsed.homeId ? teamAbbrev(teams, parsed.homeId) : homeAbbrev;
              const homeTz = tzByAbbrev[homeGameAbbrev];
              const timeLabel =
                parsed.date !== 'TBD' && parsed.time
                  ? formatGameTimeFromHomeWallClock(parsed.date, parsed.time, homeTz)
                  : '';
              const metaParts = [timeLabel, parsed.status].filter(Boolean);
              const metaText = metaParts.length > 0 ? metaParts.join(' • ') : 'Scheduled';
              return (
                <View key={`game-${i}`} style={styles.gameCard}>
                  <View style={styles.gameHeaderBlock}>
                    <View style={styles.gameHeaderRow}>
                      <Text style={styles.gameHeaderTitle} numberOfLines={1}>
                        {`Game ${parsed.number}${parsed.ifNecessary ? '*' : ''}`}
                      </Text>
                      <Text style={styles.gameHeaderDate} numberOfLines={2}>
                        {formatPlayoffGameHeaderDate(parsed.date)}
                      </Text>
                    </View>
                    {parsed.ifNecessary ? (
                      <Text style={styles.ifNecessaryNote}>(if necessary)</Text>
                    ) : null}
                  </View>
                  <View style={styles.gameRow}>
                    <Text style={styles.gameTeam}>{awayGameAbbrev}</Text>
                    <Text style={styles.gameScore}>{parsed.awayScore}</Text>
                    <Text style={styles.atText}>@</Text>
                    <Text style={styles.gameScore}>{parsed.homeScore}</Text>
                    <Text style={styles.gameTeam}>{homeGameAbbrev}</Text>
                  </View>
                  <Text style={styles.gameMeta}>{metaText}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  centerBlock: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#999', fontSize: 15 },
  summaryCard: {
    backgroundColor: '#1a1a1a',
    borderColor: '#333',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamSummary: { width: 70, alignItems: 'center' },
  summaryLogo: { width: 40, height: 40, marginBottom: 6 },
  tbdSummaryLogo: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  tbdText: { color: '#aaa', fontSize: 10, fontWeight: '700' },
  summaryAbbrev: { color: '#fff', fontSize: 16, fontWeight: '700' },
  summaryCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  roundText: { color: '#ff6600', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  scoreBig: { color: '#fff', fontSize: 28, fontWeight: '800' },
  seriesName: { color: '#aaa', fontSize: 12, textAlign: 'center' },
  belowSummary: { marginTop: 12 },
  gameList: { marginTop: 12 },
  noGamesCard: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    padding: 14,
  },
  noGamesText: { color: '#ddd', fontSize: 14, marginBottom: 4 },
  noGamesSubText: { color: '#aaa', fontSize: 12 },
  gameCard: {
    backgroundColor: '#121212',
    borderColor: '#2a2a2a',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  gameHeaderBlock: { marginBottom: 8 },
  gameHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 10,
  },
  gameHeaderTitle: { color: '#fff', fontSize: 16, fontWeight: '700', flexShrink: 0 },
  gameHeaderDate: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  ifNecessaryNote: {
    marginTop: 4,
    fontSize: 11,
    fontStyle: 'italic',
    fontWeight: '400',
    color: '#aaa',
  },
  gameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gameTeam: { color: '#fff', fontSize: 22, fontWeight: '700' },
  gameScore: { color: '#fff', fontSize: 26, fontWeight: '800' },
  atText: { color: '#aaa', fontSize: 14 },
  gameMeta: { color: '#aaa', fontSize: 12, marginTop: 8 },
});
