// The flights picked for the trip and what they cost. This is what the
// travel form will be filled from.

import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import FlightCard from '@/src/components/flights/FlightCard';
import { useFlightTrip } from '@/src/components/flights/FlightTripContext';
import { formatPrice, formatTripDate } from '@/src/lib/flights';
import { formatGameDate, useSchedule } from '@/src/providers/ScheduleProvider';

export default function TripSummaryScreen() {
  const { trip, selections } = useFlightTrip();
  const { myGames } = useSchedule();
  const game = trip ? myGames.find((g) => g.id === trip.scheduleId) : undefined;

  if (!trip || selections.some((s) => !s)) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>Pick a flight for every leg of the trip first.</Text>
      </View>
    );
  }

  const roundTrip = trip.tripType === 'round_trip';
  // A round trip's fare is quoted once for both flights (it's on the return
  // pick); one-way flights add up.
  const total = roundTrip
    ? selections[1]!.price
    : selections.every((s) => s!.price != null)
      ? selections.reduce((sum, s) => sum + s!.price!, 0)
      : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {game ? (
        <View style={styles.gameCard}>
          <Text style={styles.gameDate}>{formatGameDate(game.gamedate)}</Text>
          <Text style={styles.matchup}>
            {game.awayteam} @ {game.hometeam} <Text style={styles.gameNum}>· Game {game.gameid}</Text>
          </Text>
        </View>
      ) : null}

      {trip.legs.map((leg, i) => (
        <View key={i} style={styles.leg}>
          <Text style={styles.label}>
            {roundTrip ? (i === 0 ? 'Outbound' : 'Return') : `Flight ${i + 1}`} · {leg.from} → {leg.to} ·{' '}
            {formatTripDate(leg.date)}
          </Text>
          <FlightCard option={selections[i]!} hidePrice={roundTrip} />
        </View>
      ))}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{roundTrip ? 'Round trip, economy' : 'Total, economy'}</Text>
        <Text style={styles.total}>{formatPrice(total)}</Text>
      </View>
      <Text style={styles.hint}>Fares from Google Flights at the time of search; they can change before booking.</Text>

      <Pressable style={styles.secondary} onPress={() => router.dismissTo('/(protected)/(tabs)/home/flights')}>
        <Text style={styles.secondaryText}>Start Over</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  muted: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    padding: 16,
  },
  gameCard: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 8,
  },
  gameDate: {
    fontSize: 15,
    color: '#ff6600',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  matchup: {
    fontSize: 18,
    color: '#fff',
  },
  gameNum: {
    color: '#999',
    fontSize: 14,
  },
  leg: {
    marginTop: 20,
  },
  label: {
    color: '#ff6600',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  totalLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  total: {
    color: '#ff6600',
    fontSize: 26,
    fontWeight: '700',
  },
  hint: {
    color: '#888',
    fontSize: 13,
    marginTop: 8,
  },
  secondary: {
    marginTop: 28,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff6600',
  },
  secondaryText: {
    color: '#ff6600',
    fontSize: 16,
    fontWeight: '700',
  },
});
