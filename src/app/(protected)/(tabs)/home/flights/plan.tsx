// Plan the trip to one game: where from, one way or round trip, which day to
// fly, and — one way only — any further flights (on to another city, then
// home).

import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFlightTrip } from '@/src/components/flights/FlightTripContext';
import {
  airportsForTeam,
  formatTripDate,
  isAirportCode,
  loadHomeAirport,
  saveHomeAirport,
  shiftDate,
  type TripLeg,
  type TripType,
} from '@/src/lib/flights';
import { useAuth } from '@/src/providers/AuthProvider';
import { formatGameDate, formatGameTime, useSchedule } from '@/src/providers/ScheduleProvider';

const MAX_LEGS = 4;

export default function PlanTripScreen() {
  const { scheduleId } = useLocalSearchParams<{ scheduleId: string }>();
  const { myGames } = useSchedule();
  const { user } = useAuth();
  const { startTrip } = useFlightTrip();

  const game = myGames.find((g) => g.id === Number(scheduleId));
  const teamAirports = airportsForTeam(game?.homeTeamData?.abbreviation);
  const today = format(new Date(), 'yyyy-MM-dd');

  const [home, setHome] = useState('');
  const [dest, setDest] = useState(teamAirports[0] ?? '');
  const [tripType, setTripType] = useState<TripType>('round_trip');
  const [departDate, setDepartDate] = useState(() =>
    game && shiftDate(game.gamedate, -1) >= today ? shiftDate(game.gamedate, -1) : (game?.gamedate ?? today),
  );
  const [returnDate, setReturnDate] = useState(() => (game ? shiftDate(game.gamedate, 1) : today));
  const [extraLegs, setExtraLegs] = useState<TripLeg[]>([]);

  useEffect(() => {
    if (!user) return;
    void loadHomeAirport(user.id).then((code) => {
      if (code) setHome((current) => current || code);
    });
  }, [user]);

  // The official's next few games after this one: quick destinations for a
  // further flight.
  const laterGames = useMemo(() => {
    if (!game) return [];
    return myGames
      .filter((g) => g.gamedate > game.gamedate && airportsForTeam(g.homeTeamData?.abbreviation).length > 0)
      .sort((a, b) => a.gamedate.localeCompare(b.gamedate))
      .slice(0, 3);
  }, [game, myGames]);

  if (!game) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>This game is no longer on your schedule.</Text>
      </View>
    );
  }

  const firstLeg: TripLeg = { from: home, to: dest, date: departDate };
  const legs: TripLeg[] =
    tripType === 'round_trip'
      ? [firstLeg, { from: dest, to: home, date: returnDate }]
      : [firstLeg, ...extraLegs];

  const problem = (() => {
    if (!isAirportCode(home)) return 'Enter the airport you’re leaving from.';
    if (!isAirportCode(dest)) return 'Enter the airport you’re flying into.';
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      if (!isAirportCode(leg.from) || !isAirportCode(leg.to)) return `Flight ${i + 1} needs both airports.`;
      if (leg.from === leg.to) return `Flight ${i + 1} leaves from and lands at the same airport.`;
      if (i > 0 && leg.date < legs[i - 1].date) return `Flight ${i + 1} is before flight ${i}.`;
    }
    return null;
  })();

  const updateLeg = (i: number, patch: Partial<TripLeg>) =>
    setExtraLegs((prev) => prev.map((leg, j) => (j === i ? { ...leg, ...patch } : leg)));

  const addLeg = () => {
    const prev = legs[legs.length - 1];
    setExtraLegs((p) => [...p, { from: prev.to, to: '', date: shiftDate(prev.date, 1) }]);
  };

  const search = () => {
    if (problem) return;
    if (user) void saveHomeAirport(user.id, home);
    startTrip({ scheduleId: game.id, tripType, legs });
    router.push({ pathname: '/(protected)/(tabs)/home/flights/results', params: { leg: '0' } });
  };

  const dayBefore = shiftDate(game.gamedate, -1);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Destination */}
        <View style={styles.gameCard}>
          <Text style={styles.gameDate}>{formatGameDate(game.gamedate)}</Text>
          <Text style={styles.matchup}>
            {game.awayteam} @ {game.hometeam}
          </Text>
          <Text style={styles.gameDetails}>
            {[formatGameTime(game.gametime, game.gamedate), game.homeTeamData?.arenaname, game.homeTeamData?.city]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>

        <Text style={styles.label}>Flying from</Text>
        <AirportInput value={home} onChange={setHome} placeholder="Your home airport, e.g. DTW" />

        <Text style={styles.label}>Flying to</Text>
        {teamAirports.length > 1 ? (
          <View style={styles.chips}>
            {teamAirports.map((code) => (
              <Chip key={code} label={code} on={dest === code} onPress={() => setDest(code)} />
            ))}
          </View>
        ) : null}
        {teamAirports.length <= 1 ? <AirportInput value={dest} onChange={setDest} placeholder="Airport code" /> : null}

        <Text style={styles.label}>Trip</Text>
        <View style={styles.segment}>
          <Segment label="Round trip" on={tripType === 'round_trip'} onPress={() => setTripType('round_trip')} />
          <Segment label="One way" on={tripType === 'one_way'} onPress={() => setTripType('one_way')} />
        </View>

        <Text style={styles.label}>Depart</Text>
        <View style={styles.chips}>
          <Chip
            label={`Day before · ${formatTripDate(dayBefore)}`}
            on={departDate === dayBefore}
            disabled={dayBefore < today}
            onPress={() => setDepartDate(dayBefore)}
          />
          <Chip
            label={`Game day · ${formatTripDate(game.gamedate)}`}
            on={departDate === game.gamedate}
            onPress={() => setDepartDate(game.gamedate)}
          />
        </View>

        {tripType === 'round_trip' ? (
          <>
            <Text style={styles.label}>Return</Text>
            <DateStepper value={returnDate} min={departDate} onChange={setReturnDate} />
          </>
        ) : (
          <>
            {extraLegs.map((leg, i) => {
              const prevLeg = legs[i];
              return (
                <View key={i} style={styles.legCard}>
                  <View style={styles.legHeader}>
                    <Text style={styles.legTitle}>Flight {i + 2}</Text>
                    <Pressable
                      onPress={() => setExtraLegs((p) => p.filter((_, j) => j !== i))}
                      hitSlop={8}
                      accessibilityLabel={`Remove flight ${i + 2}`}
                    >
                      <Ionicons name="close-circle" size={22} color="#666" />
                    </Pressable>
                  </View>
                  <View style={styles.legRow}>
                    <View style={styles.flex}>
                      <Text style={styles.subLabel}>From</Text>
                      <AirportInput value={leg.from} onChange={(from) => updateLeg(i, { from })} placeholder="From" />
                    </View>
                    <Ionicons name="arrow-forward" size={18} color="#666" style={styles.legArrow} />
                    <View style={styles.flex}>
                      <Text style={styles.subLabel}>To</Text>
                      <AirportInput value={leg.to} onChange={(to) => updateLeg(i, { to })} placeholder="To" />
                    </View>
                  </View>
                  <View style={styles.chips}>
                    {isAirportCode(home) ? (
                      <Chip label={`Home · ${home}`} on={leg.to === home} onPress={() => updateLeg(i, { to: home })} />
                    ) : null}
                    {laterGames.map((g) => {
                      const code = airportsForTeam(g.homeTeamData?.abbreviation)[0];
                      return (
                        <Chip
                          key={g.id}
                          label={`${g.hometeam} ${formatTripDate(g.gamedate)} · ${code}`}
                          on={leg.to === code}
                          onPress={() => updateLeg(i, { to: code })}
                        />
                      );
                    })}
                  </View>
                  <Text style={styles.subLabel}>Date</Text>
                  <DateStepper value={leg.date} min={prevLeg.date} onChange={(date) => updateLeg(i, { date })} />
                </View>
              );
            })}
            {legs.length < MAX_LEGS ? (
              <Pressable style={styles.addLeg} onPress={addLeg}>
                <Ionicons name="add-circle-outline" size={20} color="#ff6600" />
                <Text style={styles.addLegText}>Add another flight</Text>
              </Pressable>
            ) : null}
          </>
        )}

        <Pressable style={[styles.submit, problem && styles.submitDisabled]} onPress={search} disabled={!!problem}>
          <Text style={styles.submitText}>Search Flights</Text>
        </Pressable>
        {problem ? <Text style={styles.hint}>{problem}</Text> : null}
        <Text style={styles.hint}>Economy fares on Delta, United, American, Southwest, Alaska, WestJet and Air Canada.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AirportInput({ value, onChange, placeholder }: { value: string; onChange: (code: string) => void; placeholder: string }) {
  return (
    <TextInput
      value={value}
      onChangeText={(t) => onChange(t.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 3))}
      placeholder={placeholder}
      placeholderTextColor="#666"
      autoCapitalize="characters"
      autoCorrect={false}
      maxLength={3}
      style={styles.input}
    />
  );
}

function Chip({ label, on, onPress, disabled }: { label: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      style={[styles.chip, on && styles.chipOn, disabled && styles.chipDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: on, disabled }}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Segment({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.segmentItem, on && styles.segmentItemOn]} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }}>
      <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{label}</Text>
    </Pressable>
  );
}

function DateStepper({ value, min, onChange }: { value: string; min: string; onChange: (date: string) => void }) {
  // Keep the date valid when the earlier flight moves past it.
  useEffect(() => {
    if (value < min) onChange(min);
  }, [value, min, onChange]);
  const atMin = value <= min;
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => onChange(shiftDate(value, -1))} disabled={atMin} hitSlop={8} accessibilityLabel="Earlier day">
        <Ionicons name="chevron-back" size={22} color={atMin ? '#333' : '#ff6600'} />
      </Pressable>
      <Text style={styles.stepperText}>{formatTripDate(value)}</Text>
      <Pressable onPress={() => onChange(shiftDate(value, 1))} hitSlop={8} accessibilityLabel="Later day">
        <Ionicons name="chevron-forward" size={22} color="#ff6600" />
      </Pressable>
    </View>
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
  },
  muted: {
    color: '#888',
    fontSize: 15,
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
  gameDetails: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#999',
    paddingTop: 4,
  },
  label: {
    color: '#ff6600',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
  },
  subLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#111',
    borderRadius: 10,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
  },
  chipOn: {
    borderColor: '#ff6600',
    backgroundColor: '#2a1400',
  },
  chipDisabled: {
    opacity: 0.35,
  },
  chipText: {
    color: '#ccc',
    fontSize: 14,
  },
  chipTextOn: {
    color: '#fff',
    fontWeight: '600',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentItemOn: {
    backgroundColor: '#ff6600',
  },
  segmentText: {
    color: '#ccc',
    fontSize: 15,
    fontWeight: '600',
  },
  segmentTextOn: {
    color: '#000',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stepperText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  legCard: {
    marginTop: 20,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#222',
    gap: 4,
  },
  legHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legTitle: {
    color: '#ff6600',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  legRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 8,
  },
  legArrow: {
    marginBottom: 12,
  },
  addLeg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 10,
  },
  addLegText: {
    color: '#ff6600',
    fontSize: 15,
    fontWeight: '600',
  },
  submit: {
    marginTop: 28,
    backgroundColor: '#ff6600',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
  },
});
