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
import { mapApiTeamCodeToAbbrev } from '@/src/lib/playoffBracket';
import { getTeamLogo, useSchedule, type Team } from '@/src/providers/ScheduleProvider';

const ROUND_COLUMN_WIDTH = 210;
const CONNECTOR_GUTTER = 28;
const ROUND_BADGE_HEIGHT = 22;
const CARD_HEIGHT = 112;
const CARD_GAP = 10;
const CARD_CENTER_Y = CARD_HEIGHT / 2;

function teamAbbrevFromBracket(teams: Record<string, BracketTeam>, teamId: string): string | null {
  if (!teamId || teamId === '0') return null;
  const row = teams[teamId];
  if (!row?.team_code) return null;
  return mapApiTeamCodeToAbbrev(row.team_code);
}

function BracketTeamLogo({ abbrev }: { abbrev: string | null }) {
  if (!abbrev) {
    return (
      <View style={styles.tbdLogo}>
        <Text style={styles.tbdText}>TBD</Text>
      </View>
    );
  }
  const uri = getTeamLogo({ abbreviation: abbrev } as Team);
  return <Image source={{ uri }} style={styles.teamLogo} resizeMode="contain" />;
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

  return (
    <Pressable onPress={onPress} style={styles.matchupCard}>
      <View style={styles.seriesHeaderRow}>
        <Text style={styles.seriesHeaderText}>Series {matchup.series_letter}</Text>
      </View>
      <View style={styles.teamRow}>
        <View style={styles.teamRowLeft}>
          <BracketTeamLogo abbrev={a1} />
          <Text style={styles.teamAbbrev}>{a1 ?? 'TBD'}</Text>
        </View>
        <Text style={styles.teamWins}>{matchup.team1_wins}</Text>
      </View>
      <View style={styles.teamRow}>
        <View style={styles.teamRowLeft}>
          <BracketTeamLogo abbrev={a2} />
          <Text style={styles.teamAbbrev}>{a2 ?? 'TBD'}</Text>
        </View>
        <Text style={styles.teamWins}>{matchup.team2_wins}</Text>
      </View>
    </Pressable>
  );
}

function RoundConnectors({ matchupCount }: { matchupCount: number }) {
  if (matchupCount <= 0) return null;
  const yPoints = Array.from({ length: matchupCount }, (_, i) => i * (CARD_HEIGHT + CARD_GAP) + CARD_CENTER_Y);
  const firstY = yPoints[0];
  const lastY = yPoints[yPoints.length - 1];

  return (
    <View style={styles.connectorLayer} pointerEvents="none">
      {yPoints.map((y, index) => (
        <View key={`stub-${index}`} style={[styles.connectorStub, { top: y }]} />
      ))}
      {matchupCount > 1 ? (
        <View
          style={[
            styles.connectorSpine,
            {
              top: firstY,
              height: Math.max(2, lastY - firstY),
            },
          ]}
        />
      ) : null}
      {matchupCount > 1 ? (
        <View style={[styles.connectorOut, { top: firstY + (lastY - firstY) / 2 }]} />
      ) : null}
    </View>
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
          {rounds.map((round, roundIndex) => (
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
              {roundIndex < rounds.length - 1 ? (
                <RoundConnectors matchupCount={round.matchups?.length ?? 0} />
              ) : null}
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
    gap: 2,
    paddingBottom: 8,
  },
  roundColumnWrap: {
    width: ROUND_COLUMN_WIDTH + CONNECTOR_GUTTER,
    position: 'relative',
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
    padding: 10,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  teamRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamAbbrev: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  teamWins: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 36,
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
    color: '#888',
    fontSize: 8,
    fontWeight: 'bold',
  },
  connectorLayer: {
    position: 'absolute',
    left: ROUND_COLUMN_WIDTH,
    top: ROUND_BADGE_HEIGHT + 4,
    width: CONNECTOR_GUTTER,
    bottom: 0,
  },
  connectorStub: {
    position: 'absolute',
    left: 0,
    width: 12,
    height: 1,
    backgroundColor: '#3a3a3a',
  },
  connectorSpine: {
    position: 'absolute',
    left: 12,
    width: 1,
    backgroundColor: '#2d2d2d',
  },
  connectorOut: {
    position: 'absolute',
    left: 12,
    width: 12,
    height: 1,
    backgroundColor: '#3a3a3a',
  },
  errorText: {
    color: '#ff4444',
    marginBottom: 12,
    fontSize: 14,
  },
  emptyText: {
    color: '#666',
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
