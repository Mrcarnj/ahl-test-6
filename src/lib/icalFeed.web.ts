// src/lib/icalFeed.web.ts
//
// Browser implementation. horizonwebref.com sends no CORS headers, so a direct
// fetch from the page is blocked. Route through the Cloudflare Worker's /ical
// endpoint, which fetches server-side and echoes the feed back with CORS.
//
// Configure EXPO_PUBLIC_ICAL_PROXY_URL (see .env.example) to the Worker's
// /ical URL.

import type { IcalRequest } from './icalFeed';

export type { IcalRequest };

const PROXY_URL = process.env.EXPO_PUBLIC_ICAL_PROXY_URL;

export function buildIcalRequest(icalUrl: string): IcalRequest {
  if (!PROXY_URL) {
    throw new Error(
      'EXPO_PUBLIC_ICAL_PROXY_URL is not set. The web build needs the ' +
        'Cloudflare Worker iCal proxy to fetch HorizonWebRef feeds.',
    );
  }

  return {
    // User-Agent is a forbidden header in browsers; the Worker sets it upstream.
    url: `${PROXY_URL}?url=${encodeURIComponent(icalUrl)}`,
    headers: {},
  };
}
