// src/lib/flights.ts
//
// Flight search for travel to a game. The app never talks to the fare
// provider itself: `searchFlights` calls the `flight-search` Supabase Edge
// Function, which holds the API key (SerpApi's Google Flights engine), checks
// the caller is an official, caches results and returns them already
// normalized to `FlightOption`. Swapping providers only touches that function.

import { addDays, format, parse } from 'date-fns';
import { safeAsyncStorage } from '@/src/lib/asyncStorageWrapper';
import { supabase } from '@/src/lib/supabase';

/**
 * The only airlines searched, by IATA code. The edge function passes these to
 * the provider and drops any itinerary with a segment marketed by anyone else.
 */
export const MAJOR_AIRLINES: Record<string, string> = {
  DL: 'Delta',
  UA: 'United',
  AA: 'American',
  WN: 'Southwest',
  AS: 'Alaska',
  WS: 'WestJet',
  AC: 'Air Canada',
};

/**
 * Airports an official flies into for each team's games, nearest/most useful
 * first, keyed by `teams.abbreviation`. Not in the DB: no table has it, and it
 * changes only when a franchise moves (update it with the season rollover).
 */
export const TEAM_AIRPORTS: Record<string, string[]> = {
  ABB: ['YXX', 'YVR'], // Abbotsford
  BAK: ['BFL', 'LAX'], // Bakersfield
  BEL: ['YYZ', 'YOW'], // Belleville
  CGY: ['YYC'], // Calgary
  CHI: ['ORD', 'MDW'], // Rosemont
  CLE: ['CLE'], // Cleveland
  CLT: ['CLT'], // Charlotte
  COL: ['DEN'], // Loveland
  CV: ['PSP'], // Palm Desert
  GR: ['GRR'], // Grand Rapids
  HAM: ['YHM', 'YYZ'], // Hamilton
  HER: ['MDT', 'BWI', 'PHL'], // Hershey
  HFD: ['BDL'], // Hartford
  HSK: ['LAS'], // Henderson
  IA: ['DSM'], // Des Moines
  LAV: ['YUL'], // Laval
  LHV: ['ABE', 'PHL', 'EWR'], // Allentown
  MB: ['YWG'], // Winnipeg
  MIL: ['MKE'], // Milwaukee
  ONT: ['ONT', 'LAX'], // Ontario, CA
  PRO: ['PVD', 'BOS'], // Providence
  RFD: ['ORD', 'RFD'], // Rockford
  ROC: ['ROC', 'BUF'], // Rochester
  SD: ['SAN'], // San Diego
  SJ: ['SJC', 'SFO'], // San Jose
  SPR: ['BDL'], // Springfield
  SYR: ['SYR'], // Syracuse
  TEX: ['AUS'], // Cedar Park
  TOR: ['YYZ', 'YTZ'], // Toronto
  TUC: ['TUS'], // Tucson
  UTC: ['SYR', 'ALB'], // Utica
  WBS: ['AVP'], // Wilkes-Barre/Scranton
};

export function airportsForTeam(abbreviation: string | undefined | null): string[] {
  return (abbreviation && TEAM_AIRPORTS[abbreviation]) || [];
}

export const isAirportCode = (code: string) => /^[A-Z]{3}$/.test(code);

export type TripType = 'round_trip' | 'one_way';

export interface TripLeg {
  from: string; // IATA
  to: string; // IATA
  date: string; // YYYY-MM-DD
}

export interface FlightSegment {
  airline: string;
  flightNumber: string; // e.g. "DL 1234"
  from: string;
  fromName: string;
  to: string;
  toName: string;
  departTime: string; // "YYYY-MM-DD HH:mm", local to the airport
  arriveTime: string;
  durationMinutes: number;
  airplane: string | null;
}

export interface FlightOption {
  /** Stable within one result list. */
  id: string;
  /**
   * Economy fare in USD. For a round trip this is the whole trip's price, on
   * both the outbound list and the return list. Null when Google shows none.
   */
  price: number | null;
  airlines: string[];
  airlineLogo: string | null;
  segments: FlightSegment[];
  totalDurationMinutes: number;
  stops: number;
  /** Round-trip outbound only: picks this flight and lists its returns. */
  departureToken: string | null;
}

export type FlightSearchRequest =
  | { type: 'one_way'; from: string; to: string; date: string }
  | {
      type: 'round_trip';
      from: string;
      to: string;
      date: string;
      returnDate: string;
      /** From the chosen outbound option; returns that flight's return options. */
      departureToken?: string;
    };

export async function searchFlights(request: FlightSearchRequest): Promise<FlightOption[]> {
  const { data, error } = await supabase.functions.invoke<{ options: FlightOption[] }>('flight-search', {
    body: request,
  });
  if (error) {
    // FunctionsHttpError carries the function's JSON body in `context`.
    let message = error.message;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch {
      // Not JSON; keep the generic message.
    }
    throw new Error(message);
  }
  return data?.options ?? [];
}

// ---- dates ---------------------------------------------------------------

export const shiftDate = (date: string, days: number) =>
  format(addDays(parse(date, 'yyyy-MM-dd', new Date()), days), 'yyyy-MM-dd');

export const formatTripDate = (date: string) => format(parse(date, 'yyyy-MM-dd', new Date()), 'EEE, MMM d');

/** "2026-10-14 18:05" -> "6:05 PM" */
export const formatFlightTime = (dateTime: string) =>
  format(parse(dateTime, 'yyyy-MM-dd HH:mm', new Date()), 'h:mm a');

/** Days the arrival lands after the departure (red-eyes, long connections). */
export const dayOffset = (departTime: string, arriveTime: string) => {
  const day = (s: string) => parse(s.slice(0, 10), 'yyyy-MM-dd', new Date()).getTime();
  return Math.round((day(arriveTime) - day(departTime)) / 86_400_000);
};

export const formatDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const formatPrice = (price: number | null) => (price == null ? '—' : `$${Math.round(price).toLocaleString()}`);

// ---- remembered home airport --------------------------------------------

const homeAirportKey = (authId: string) => `flightsHomeAirport_v1_${authId}`;

export async function loadHomeAirport(authId: string): Promise<string | null> {
  return safeAsyncStorage.getItem(homeAirportKey(authId));
}

export async function saveHomeAirport(authId: string, code: string): Promise<void> {
  await safeAsyncStorage.setItem(homeAirportKey(authId), code);
}
