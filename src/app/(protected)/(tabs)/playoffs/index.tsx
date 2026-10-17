// app/(protected)/(tabs)/playoffs/index.tsx
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BracketMatchup, BracketTeam } from '@/src/lib/playoffBracket';
import { isBracketTeamSlotEliminated, mapApiTeamCodeToAbbrev } from '@/src/lib/playoffBracket';
import { getTeamLogo, useSchedule, type Team } from '@/src/providers/ScheduleProvider';

const ROUND_COLUMN_WIDTH = 158;
/** Space between round columns (same as old bracket connector gutter). */
const ROUND_COLUMN_GAP = 20;
const ROUND_BADGE_HEIGHT = 22;
const CARD_HEIGHT = 112;
const CARD_GAP = 10;

function teamAbbrevFromBracket(teams: Record<string, BracketTeam>, teamId: string): string | null {
  if (!teamId || teamId === '0') return null;
  const row = teams[teamId];
  if (!row?.team_code) return null;
  return mapApiTeamCodeToAbbrev(row.team_code);
}

function BracketTeamLogo({ abbrev, eliminated }: { abbrev: string | null; eliminated?: boolean }) {
  if (!abbrev) {
    return (
      <View style={[styles.tbdLogo, eliminated && styles.eliminatedMuted]}>
        <Text style={styles.tbdText}>TBD</Text>
      </View>
    );
  }
  const uri = getTeamLogo({ abbreviation: abbrev } as Team);
  return (
    <Image
      source={{ uri }}
      style={[styles.teamLogo, eliminated && styles.eliminatedMuted]}
      resizeMode="contain"
    />
  );
}

function MatchupCard({
  matchup,
  teams,
  onPress,
}: {
  matchup: BracketMatchup;
  teams: Record<string, BracketTeam>;
  onPress: () => void;
}) {
  const a1 = teamAbbrevFromBracket(teams, matchup.team1);
  const a2 = teamAbbrevFromBracket(teams, matchup.team2);
  const slot1Out = isBracketTeamSlotEliminated(matchup, 1);
  const slot2Out = isBracketTeamSlotEliminated(matchup, 2);

  return (
    <Pressable onPress={onPress} style={styles.matchupCard}>
      <View style={styles.seriesHeaderRow}>
        <Text style={styles.seriesHeaderText}>Series {matchup.series_letter}</Text>
      </View>
      <View style={styles.teamRow}>
        <View style={styles.teamRowLeft}>
          <BracketTeamLogo abbrev={a1} eliminated={slot1Out} />
          <Text style={[styles.teamAbbrev, slot1Out && styles.teamAbbrevEliminated]}>{a1 ?? 'TBD'}</Text>
        </View>
        <View style={styles.teamWinsCol}>
          <Text style={[styles.teamWins, slot1Out && styles.teamWinsEliminated]}>{matchup.team1_wins}</Text>
        </View>
      </View>
      <View style={styles.teamRow}>
        <View style={styles.teamRowLeft}>
          <BracketTeamLogo abbrev={a2} eliminated={slot2Out} />
          <Text style={[styles.teamAbbrev, slot2Out && styles.teamAbbrevEliminated]}>{a2 ?? 'TBD'}</Text>
        </View>
        <View style={styles.teamWinsCol}>
          <Text style={[styles.teamWins, slot2Out && styles.teamWinsEliminated]}>{matchup.team2_wins}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function PlayoffsScreen() {
  const router = useRouter();
  const {
    playoffBracket,
    playoffBracketError,
    syncingPlayoffBracket,
    refreshPlayoffBracket,
  } = useSchedule();
  const [pullRefreshing, setPullRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refreshPlayoffBracket();
    }, [refreshPlayoffBracket])
  );

  const onPull = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await refreshPlayoffBracket({ force: true });
    } finally {
      setPullRefreshing(false);
    }
  }, [refreshPlayoffBracket]);

  const rounds = [...(playoffBracket?.rounds ?? [])].sort(
    (a, b) => Number(a.round) - Number(b.round)
  );
  const teams = playoffBracket?.teams ?? {};

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={onPull}
            tintColor="#ff6600"
            colors={['#ff6600']}
          />
        }
      >
        {playoffBracket?.headerLogoUrl ? (
          <Image
            source={{ uri: playoffBracket.headerLogoUrl }}
            style={styles.bracketBanner}
            resizeMode="contain"
          />
        ) : null}

        {playoffBracketError ? (
          <Text style={styles.errorText}>{playoffBracketError}</Text>
        ) : null}

        {!playoffBracketError && rounds.length === 0 && !syncingPlayoffBracket ? (
          <Text style={styles.emptyText}>No bracket data yet.</Text>
        ) : null}

        {syncingPlayoffBracket && rounds.length === 0 ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color="#ff6600" />
            <Text style={styles.loadingCaption}>Loading bracket…</Text>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardContent}>
          {rounds.map((round) => (
            <View key={`round-${round.round}`} style={styles.roundColumnWrap}>
              <View style={styles.roundColumn}>
                <Text style={styles.roundBadge}>R{round.round}</Text>
                <View style={styles.roundCards}>
                  {(round.matchups ?? []).map((m) => (
                    <MatchupCard
                      key={`${round.round}-${m.series_letter}`}
                      matchup={m}
                      teams={teams}
                      onPress={() =>
                        router.push({
                          pathname: '/(protected)/(tabs)/playoffs/[seriesLetter]',
                          params: { seriesLetter: m.series_letter },
                        })
                      }
                    />
                  ))}
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  bracketBanner: {
    width: '100%',
    height: 100,
    marginBottom: 16,
  },
  boardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ROUND_COLUMN_GAP,
    paddingBottom: 8,
  },
  roundColumnWrap: {
    width: ROUND_COLUMN_WIDTH,
  },
  roundColumn: {
    width: ROUND_COLUMN_WIDTH,
  },
  roundBadge: {
    color: '#ff6600',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
    height: ROUND_BADGE_HEIGHT,
  },
  roundCards: {
    gap: CARD_GAP,
  },
  matchupCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 5,
    paddingBottom: 14,
    height: CARD_HEIGHT,
    borderWidth: 1,
    borderColor: '#333',
  },
  seriesHeaderRow: {
    marginBottom: 8,
  },
  seriesHeaderText: {
    color: '#999',
    fontSize: 11,
    fontWeight: '600',
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  teamRowLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  teamWinsCol: {
    minWidth: 28,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 0,
  },
  teamAbbrev: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  teamWins: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 30,
  },
  teamAbbrevEliminated: {
    color: '#5a5a5a',
  },
  teamWinsEliminated: {
    color: '#4a4a4a',
  },
  eliminatedMuted: {
    opacity: 0.45,
  },
  teamLogo: {
    width: 22,
    height: 22,
  },
  tbdLogo: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tbdText: {
    color: '#aaa',
    fontSize: 8,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#ff4444',
    marginBottom: 12,
    fontSize: 14,
  },
  emptyText: {
    color: '#999',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 24,
  },
  loadingBlock: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  loadingCaption: {
    color: '#999',
    marginTop: 10,
    fontSize: 14,
  },
});
