// (protected)/(tabs)/home/flights/_layout.tsx
//
// index    upcoming games; tap one to fly to it
// plan     home airport, one way / round trip, dates, extra flights
// results  flights for one leg of the trip (?leg=0, 1, …)
// summary  the flights picked, with the total
//
// The trip being built lives in FlightTripProvider, here, so it's shared by
// these screens and dropped when the official leaves Flights.

import { Stack } from 'expo-router';
import HeaderBackButton from '@/src/components/HeaderBackButton';
import { FlightTripProvider } from '@/src/components/flights/FlightTripContext';

const header = {
  headerShown: true,
  headerStyle: { backgroundColor: '#000000' },
  headerTintColor: '#ffffff',
  headerBackVisible: false,
} as const;

const back = (label: string) =>
  function FlightsBackButton() {
    return <HeaderBackButton label={label} fallback="/(protected)/(tabs)/home" />;
  };

export default function FlightsLayout() {
  return (
    <FlightTripProvider>
      <Stack screenOptions={{ contentStyle: { backgroundColor: '#000000' } }}>
        <Stack.Screen name="index" options={{ ...header, headerTitle: 'Flights', headerLeft: back('Home') }} />
        <Stack.Screen name="plan" options={{ ...header, headerTitle: 'Plan Trip', headerLeft: back('Games') }} />
        <Stack.Screen name="results" options={{ ...header, headerTitle: 'Choose Flight', headerLeft: back('Back') }} />
        <Stack.Screen name="summary" options={{ ...header, headerTitle: 'Your Trip', headerLeft: back('Back') }} />
      </Stack>
    </FlightTripProvider>
  );
}
