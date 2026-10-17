// src/lib/icalFeed.ts
//
// Native implementation: fetch the HorizonWebRef feed directly. See
// icalFeed.web.ts, which routes through the Cloudflare Worker to get past CORS.

export type IcalRequest = {
  url: string;
  headers: Record<string, string>;
};

export function buildIcalRequest(icalUrl: string): IcalRequest {
  return {
    url: icalUrl,
    headers: { 'User-Agent': 'DietrichApp/v1.0.1' },
  };
}
