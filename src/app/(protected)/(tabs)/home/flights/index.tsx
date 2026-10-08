// Pick the game to fly to: the official's games from today on, soonest first.

import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { airportsForTeam } from '@/src/lib/flights';
import { formatGameDate, formatGameTime, useSchedule } from '@/src/providers/ScheduleProvider';

export default function FlightGamesScreen() {
  const { myGames, scheduleLoaded } = useSchedule();

  const upcoming = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return myGames
      .filter((g) => g.id > 0 && g.gamedate >= today)
      .sort((a, b) => a.gamedate.localeCompare(b.gamedate) || a.gametime.localeCompare(b.gametime));
  }, [myGames]);

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={upcoming}
      keyExtractor={(g) => String(g.id)}
      ListHeaderComponent={<Text style={styles.intro}>Pick the game you’re flying to.</Text>}
      ListEmptyComponent={
        <Text style={styles.empty}>{scheduleLoaded ? 'No upcoming games.' : 'Loading your schedule…'}</Text>
      }
      renderItem={({ item: g }) => {
        const airports = airportsForTeam(g.homeTeamData?.abbreviation);
        return (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            onPress={() =>
              router.push({ pathname: '/(protected)/(tabs)/home/flights/plan', params: { scheduleId: String(g.id) } })
            }
          >
            <View style={styles.flex}>
              <Text style={styles.date}>{formatGameDate(g.gamedate)}</Text>
              <Text style={styles.matchup}>
                {g.awayteam} @ {g.hometeam} <Text style={styles.gameNum}>· Game {g.gameid}</Text>
              </Text>
              <Text style={styles.details}>
                {[formatGameTime(g.gametime, g.gamedate), g.homeTeamData?.city, airports[0]].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Ionicons name="airplane" size={22} color="#ff6600" />
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 10,
  },
  intro: {
    color: '#999',
    fontSize: 14,
    marginBottom: 4,
  },
  empty: {
    color: '#999',
    fontSize: 16,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  date: {
    fontSize: 15,
    color: '#ff6600',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  matchup: {
    fontSize: 17,
    color: '#fff',
  },
  gameNum: {
    color: '#999',
    fontSize: 14,
  },
  details: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#999',
    paddingTop: 4,
  },
});
