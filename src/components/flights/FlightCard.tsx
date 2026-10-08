// One flight itinerary: times, airline, route, stops, duration and price.
// Tappable in the results list, static in the trip summary.

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dayOffset, formatDuration, formatFlightTime, formatPrice, type FlightOption } from '@/src/lib/flights';

type FlightCardProps = {
  option: FlightOption;
  selected?: boolean;
  onPress?: () => void;
  /** Hide the price, e.g. on a round trip's outbound in the summary. */
  hidePrice?: boolean;
};

export default function FlightCard({ option, selected, onPress, hidePrice }: FlightCardProps) {
  const first = option.segments[0];
  const last = option.segments[option.segments.length - 1];
  const plusDays = dayOffset(first.departTime, last.arriveTime);
  const via = option.segments.slice(0, -1).map((s) => s.to);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && onPress && styles.pressed]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.top}>
        {option.airlineLogo ? (
          <Image source={{ uri: option.airlineLogo }} style={styles.logo} contentFit="contain" />
        ) : (
          <View style={[styles.logo, styles.logoEmpty]}>
            <Ionicons name="airplane" size={16} color="#666" />
          </View>
        )}
        <View style={styles.flex}>
          <Text style={styles.times}>
            {formatFlightTime(first.departTime)} – {formatFlightTime(last.arriveTime)}
            {plusDays > 0 ? <Text style={styles.plusDays}> +{plusDays}</Text> : null}
          </Text>
          <Text style={styles.airline} numberOfLines={1}>
            {option.airlines.join(', ')}
          </Text>
        </View>
        {hidePrice ? null : <Text style={styles.price}>{formatPrice(option.price)}</Text>}
      </View>
      <Text style={styles.meta}>
        {[
          `${first.from}–${last.to}`,
          option.stops === 0 ? 'Nonstop' : `${option.stops} stop${option.stops > 1 ? 's' : ''} (${via.join(', ')})`,
          formatDuration(option.totalDurationMinutes),
        ].join(' · ')}
      </Text>
      <Text style={styles.flightNumbers}>{option.segments.map((s) => s.flightNumber).join(' / ')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  cardSelected: {
    borderColor: '#ff6600',
  },
  pressed: {
    opacity: 0.7,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  logoEmpty: {
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  times: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  plusDays: {
    color: '#ff6600',
    fontSize: 12,
  },
  airline: {
    color: '#999',
    fontSize: 13,
    marginTop: 2,
  },
  price: {
    color: '#ff6600',
    fontSize: 20,
    fontWeight: '700',
  },
  meta: {
    color: '#ccc',
    fontSize: 13,
    marginTop: 10,
  },
  flightNumbers: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
});
