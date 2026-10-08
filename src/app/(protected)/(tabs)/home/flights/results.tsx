// Flights for one leg of the trip. Picking one moves on to the next leg, or
// to the summary after the last.
//
// A round trip is searched as one: leg 0 lists outbound flights priced as the
// whole round trip, and leg 1 lists the returns that go with the outbound
// picked (via its departureToken), again at the round-trip price. One-way
// legs are each their own search.

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import FlightCard from '@/src/components/flights/FlightCard';
import { useFlightTrip } from '@/src/components/flights/FlightTripContext';
import { formatTripDate, searchFlights, type FlightOption, type FlightSearchRequest } from '@/src/lib/flights';

type Sort = 'price' | 'departure';

export default function FlightResultsScreen() {
  const params = useLocalSearchParams<{ leg: string }>();
  const legIndex = Number(params.leg ?? 0);
  const { trip, selections, selectFlight } = useFlightTrip();
  const leg = trip?.legs[legIndex];
  // Only the return list depends on a pick (the outbound's token). Keying on
  // the token, not on `selections`, keeps a pick on this screen from
  // re-running its own search — every search spends API quota.
  const departureToken = trip?.tripType === 'round_trip' && legIndex === 1 ? selections[0]?.departureToken : undefined;

  const [options, setOptions] = useState<FlightOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('price');

  const request = useMemo((): FlightSearchRequest | null => {
    if (!trip || !leg) return null;
    if (trip.tripType === 'one_way') return { type: 'one_way', from: leg.from, to: leg.to, date: leg.date };
    const [out, ret] = trip.legs;
    const base = { type: 'round_trip' as const, from: out.from, to: out.to, date: out.date, returnDate: ret.date };
    if (legIndex === 0) return base;
    return departureToken ? { ...base, departureToken } : null;
  }, [trip, leg, legIndex, departureToken]);

  // Returns a cancel, so a search that outlives its screen (or its request)
  // can't overwrite the list.
  const load = useCallback(() => {
    if (!request) return;
    let cancelled = false;
    setOptions(null);
    setError(null);
    searchFlights(request).then(
      (result) => !cancelled && setOptions(result),
      (e) => !cancelled && setError(e instanceof Error ? e.message : 'Search failed.'),
    );
    return () => {
      cancelled = true;
    };
  }, [request]);
  useEffect(() => load(), [load]);

  const sorted = useMemo(() => {
    if (!options) return [];
    return [...options].sort((a, b) =>
      sort === 'price'
        ? (a.price ?? Infinity) - (b.price ?? Infinity)
        : a.segments[0].departTime.localeCompare(b.segments[0].departTime),
    );
  }, [options, sort]);

  if (!trip || !leg || !request) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>This search has expired. Go back and start again.</Text>
      </View>
    );
  }

  const choose = (option: FlightOption) => {
    selectFlight(legIndex, option);
    if (legIndex + 1 < trip.legs.length) {
      router.push({ pathname: '/(protected)/(tabs)/home/flights/results', params: { leg: String(legIndex + 1) } });
    } else {
      router.push('/(protected)/(tabs)/home/flights/summary');
    }
  };

  const roundTrip = trip.tripType === 'round_trip';

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={sorted}
      keyExtractor={(o) => o.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.legLabel}>
            {roundTrip ? (legIndex === 0 ? 'Outbound' : 'Return') : `Flight ${legIndex + 1} of ${trip.legs.length}`}
          </Text>
          <Text style={styles.route}>
            {leg.from} → {leg.to}
          </Text>
          <Text style={styles.date}>{formatTripDate(leg.date)}</Text>
          {roundTrip ? <Text style={styles.note}>Prices are for the whole round trip, economy.</Text> : null}
          {options && options.length > 1 ? (
            <View style={styles.sortRow}>
              <SortChip label="Cheapest" on={sort === 'price'} onPress={() => setSort('price')} />
              <SortChip label="Earliest" on={sort === 'departure'} onPress={() => setSort('departure')} />
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={() => load()} style={styles.retry}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : options ? (
          <Text style={styles.muted}>No economy flights on the major airlines for this day. Try another date or airport.</Text>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color="#ff6600" />
            <Text style={styles.muted}>Searching flights…</Text>
          </View>
        )
      }
      renderItem={({ item }) => (
        <FlightCard option={item} selected={selections[legIndex]?.id === item.id} onPress={() => choose(item)} />
      )}
    />
  );
}

function SortChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.sortChip, on && styles.sortChipOn]} onPress={onPress}>
      <Text style={[styles.sortChipText, on && styles.sortChipTextOn]}>{label}</Text>
    </Pressable>
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
    gap: 10,
  },
  header: {
    marginBottom: 6,
  },
  legLabel: {
    color: '#ff6600',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  route: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },
  date: {
    color: '#ccc',
    fontSize: 15,
    marginTop: 2,
  },
  note: {
    color: '#888',
    fontSize: 13,
    marginTop: 6,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  sortChipOn: {
    borderColor: '#ff6600',
    backgroundColor: '#2a1400',
  },
  sortChipText: {
    color: '#ccc',
    fontSize: 13,
  },
  sortChipTextOn: {
    color: '#fff',
    fontWeight: '600',
  },
  center: {
    alignItems: 'center',
    paddingTop: 30,
    gap: 10,
  },
  muted: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    padding: 16,
  },
  error: {
    color: '#ef4444',
    fontSize: 15,
    textAlign: 'center',
  },
  retry: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: {
    color: '#ff6600',
    fontSize: 15,
    fontWeight: '600',
  },
});
