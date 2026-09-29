// cloudflare-worker/ical-proxy.js
//
// CORS proxy for HorizonWebRef iCal feeds.
//
// The native app fetches a user's feed directly, but a browser cannot:
// horizonwebref.com sends no Access-Control-Allow-Origin header, so the request
// is blocked before the app ever sees it. This route fetches the feed
// server-side and echoes it back with CORS headers.
//
// Two guards keep this from becoming an open proxy:
//   * the target must be a HorizonWebRef syncICS URL, and
//   * the Origin must be one we serve the web app from.

const ALLOWED_TARGET_PREFIX = 'https://www.horizonwebref.com/syncICS';

/**
 * Origins allowed to call the proxy. Set ICAL_ALLOWED_ORIGINS in the Worker
 * environment as a comma-separated list; localhost is always permitted so
 * `npm run web` works against a deployed Worker.
 */
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19006',
];

function allowedOrigins(env) {
  const configured = (env.ICAL_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_ORIGINS, ...configured];
}

/**
 * An allowlist entry matches either exactly, or as a subdomain wildcard like
 * `https://*.expo.app`. The wildcard only stands in for one or more leading
 * labels, so `https://*.expo.app` matches `https://preview.expo.app` but never
 * `https://evil-expo.app` — the dot is part of the required suffix.
 *
 * EAS Hosting gives every preview deploy its own hostname, so without the
 * wildcard form the allowlist would need editing on each deploy.
 */
function originMatches(pattern, origin) {
  if (pattern === origin) return true;

  const wildcard = 'https://*.';
  if (!pattern.startsWith(wildcard)) return false;

  const suffix = pattern.slice(wildcard.length - 1); // keep the leading dot
  if (!origin.startsWith('https://')) return false;

  const host = origin.slice('https://'.length);
  return host.endsWith(suffix) && host.length > suffix.length;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response>}
 */
export async function handleIcalProxy(request, env) {
  const origin = request.headers.get('Origin') ?? '';
  const isAllowedOrigin = allowedOrigins(env).some((pattern) =>
    originMatches(pattern, origin),
  );

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: isAllowedOrigin ? 204 : 403,
      headers: isAllowedOrigin ? corsHeaders(origin) : {},
    });
  }

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (origin && !isAllowedOrigin) {
    return new Response('Origin not allowed', { status: 403 });
  }

  const target = new URL(request.url).searchParams.get('url');
  if (!target) {
    return new Response('Missing "url" query parameter', {
      status: 400,
      headers: corsHeaders(origin),
    });
  }

  if (!target.startsWith(ALLOWED_TARGET_PREFIX)) {
    return new Response('Only HorizonWebRef iCal URLs may be proxied', {
      status: 403,
      headers: corsHeaders(origin),
    });
  }

  try {
    const upstream = await fetch(target, {
      headers: { 'User-Agent': 'DietrichApp/v1.0.1' },
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...corsHeaders(origin),
        'Content-Type': upstream.headers.get('Content-Type') ?? 'text/calendar',
        // The feed is per-user; never let an edge or browser cache share it.
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('iCal proxy error:', error);
    return new Response(`Failed to fetch iCal feed: ${error.message}`, {
      status: 502,
      headers: corsHeaders(origin),
    });
  }
}
