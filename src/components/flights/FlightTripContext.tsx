// The trip being planned, shared by the screens under home/flights. Lives in
// that stack's layout, so leaving Flights discards it.
//
// legs: round trip  -> [outbound, return]
//       one way     -> [to the game, ...any further flights]
// selections[i] is the flight picked for legs[i].

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { FlightOption, TripLeg, TripType } from '@/src/lib/flights';

export interface Trip {
  scheduleId: number;
  tripType: TripType;
  legs: TripLeg[];
}

interface FlightTripContextValue {
  trip: Trip | null;
  selections: (FlightOption | null)[];
  /** Starts a new search; clears any flights already picked. */
  startTrip: (trip: Trip) => void;
  selectFlight: (legIndex: number, option: FlightOption) => void;
}

const FlightTripContext = createContext<FlightTripContextValue | null>(null);

export function FlightTripProvider({ children }: { children: ReactNode }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [selections, setSelections] = useState<(FlightOption | null)[]>([]);

  const startTrip = useCallback((next: Trip) => {
    setTrip(next);
    setSelections(next.legs.map(() => null));
  }, []);

  const selectFlight = useCallback((legIndex: number, option: FlightOption) => {
    setSelections((prev) => {
      const next = [...prev];
      next[legIndex] = option;
      // A round trip's return options depend on the outbound picked, so a new
      // outbound invalidates everything after it.
      for (let i = legIndex + 1; i < next.length; i++) next[i] = null;
      return next;
    });
  }, []);

  const value = useMemo(() => ({ trip, selections, startTrip, selectFlight }), [trip, selections, startTrip, selectFlight]);
  return <FlightTripContext.Provider value={value}>{children}</FlightTripContext.Provider>;
}

export function useFlightTrip() {
  const ctx = useContext(FlightTripContext);
  if (!ctx) throw new Error('useFlightTrip must be used inside FlightTripProvider');
  return ctx;
}
