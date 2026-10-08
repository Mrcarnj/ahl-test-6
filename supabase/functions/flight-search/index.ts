// supabase/functions/flight-search
//
// Economy fares for one flight search, on the major airlines only, for the
// app's Flights screens (src/lib/flights.ts). Backed by SerpApi's Google
// Flights engine: the only affordable source that includes Southwest, and it
// filters by airline server-side.
//
// - Caller must be a signed-in official (a `roster` row for their auth id).
// - Responses are cached in `flight_search_cache` for CACHE_HOURS: SerpApi's
//   free plan is 250 searches a month, shared by every official.
// - Results come back normalized (`FlightOption`, same shape as the app's
//   type), so the app knows nothing about the provider.
//
// Secrets:  supabase secrets set SERPAPI_KEY=...
// Deploy:   supabase functions deploy flight-search
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CACHE_HOURS = 3;

/** Keep in sync with MAJOR_AIRLINES in src/lib/flights.ts. */
const AIRLINES = ['DL', 'UA', 'AA', 'WN', 'AS', 'WS', 'AC'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type SearchRequest = {
  type: 'one_way' | 'round_trip';
  from: string;
  to: string;
  date: string;
  returnDate?: string;
  departureToken?: string;
};

const IATA = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseRequest(body: unknown): SearchRequest | string {
  const b = body as Partial<SearchRequest> | null;
  if (!b || (b.type !== 'one_way' && b.type !== 'round_trip')) return 'Bad trip type.';
  if (!IATA.test(b.from ?? '') || !IATA.test(b.to ?? '')) return 'Airports must be 3-letter codes.';
  if (!DATE.test(b.date ?? '')) return 'Bad departure date.';
  if (b.type === 'round_trip' && !DATE.test(b.returnDate ?? '')) return 'Bad return date.';
  if (b.departureToken != null && (typeof b.departureToken !== 'string' || b.departureToken.length > 4000)) {
    return 'Bad departure token.';
  }
  return {
    type: b.type,
    from: b.from!,
    to: b.to!,
    date: b.date!,
    returnDate: b.type === 'round_trip' ? b.returnDate : undefined,
    departureToken: b.type === 'round_trip' ? b.departureToken : undefined,
  };
}

// ---- SerpApi -> FlightOption ------------------------------------------------

// deno-lint-ignore no-explicit-any
type Any = any;

function normalize(data: Any) {
  const itineraries: Any[] = [...(data.best_flights ?? []), ...(data.other_flights ?? [])];
  const options: Any[] = [];
  for (const [i, it] of itineraries.entries()) {
    const segments = (it.flights ?? []).map((f: Any) => ({
      airline: f.airline ?? '',
      flightNumber: f.flight_number ?? '',
      from: f.departure_airport?.id ?? '',
      fromName: f.departure_airport?.name ?? '',
      to: f.arrival_airport?.id ?? '',
      toName: f.arrival_airport?.name ?? '',
      departTime: f.departure_airport?.time ?? '',
      arriveTime: f.arrival_airport?.time ?? '',
      durationMinutes: f.duration ?? 0,
      airplane: f.airplane ?? null,
    }));
    if (segments.length === 0) continue;
    // include_airlines should already guarantee this; drop anything that slips
    // through (e.g. a partner segment) rather than show a carrier we don't allow.
    if (!segments.every((s: Any) => AIRLINES.includes(s.flightNumber.split(' ')[0]))) continue;
    options.push({
      id: `${i}-${segments.map((s: Any) => s.flightNumber).join('_')}`,
      price: typeof it.price === 'number' ? it.price : null,
      airlines: [...new Set<string>(segments.map((s: Any) => s.airline))],
      airlineLogo: it.airline_logo ?? null,
      segments,
      totalDurationMinutes: it.total_duration ?? 0,
      stops: segments.length - 1,
      departureToken: it.departure_token ?? null,
    });
  }
  return { options };
}

async function serpApiSearch(req: SearchRequest, apiKey: string) {
  const params = new URLSearchParams({
    engine: 'google_flights',
    departure_id: req.from,
    arrival_id: req.to,
    outbound_date: req.date,
    type: req.type === 'round_trip' ? '1' : '2',
    travel_class: '1', // economy
    adults: '1',
    currency: 'USD',
    hl: 'en',
    gl: 'us',
    include_airlines: AIRLINES.join(','),
    api_key: apiKey,
  });
  if (req.returnDate) params.set('return_date', req.returnDate);
  if (req.departureToken) params.set('departure_token', req.departureToken);

  const res = await fetch(`https://serpapi.com/search.json?${params}`);
  const data = await res.json().catch(() => null);
  if (data?.error) {
    // "Google Flights hasn't returned any results for this query." is an
    // empty result, not a failure.
    if (/no results|hasn't returned any results/i.test(data.error)) return { options: [] };
    throw new Error(data.error);
  }
  if (!res.ok || !data) throw new Error(`Flight search failed (${res.status}).`);
  return normalize(data);
}

// ---- handler ---------------------------------------------------------------

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const apiKey = Deno.env.get('SERPAPI_KEY');
  if (!apiKey) return json({ error: 'Flight search is not set up yet.' }, 503);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // Officials only.
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const { data: official } = await admin.from('roster').select('id').eq('auth_id', user.id).maybeSingle();
  if (!official) return json({ error: 'Not allowed.' }, 403);

  const parsed = parseRequest(await request.json().catch(() => null));
  if (typeof parsed === 'string') return json({ error: parsed }, 400);

  const key = JSON.stringify(parsed);
  const since = new Date(Date.now() - CACHE_HOURS * 3600_000).toISOString();
  const { data: cached } = await admin
    .from('flight_search_cache')
    .select('response')
    .eq('key', key)
    .gte('created_at', since)
    .maybeSingle();
  if (cached) return json(cached.response);

  try {
    const response = await serpApiSearch(parsed, apiKey);
    await admin
      .from('flight_search_cache')
      .upsert({ key, response, created_at: new Date().toISOString() });
    return json(response);
  } catch (e) {
    console.error('flight-search:', e);
    return json({ error: e instanceof Error ? e.message : 'Flight search failed.' }, 502);
  }
});
