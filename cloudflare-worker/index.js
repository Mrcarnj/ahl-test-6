// cloudflare-worker/index.js
//
// A single-purpose Worker: the CORS proxy that lets the web build fetch a
// user's HorizonWebRef iCal feed. See ical-proxy.js for the guards.
//
// It holds no credentials and touches no database. Stats, rosters and
// standings are synced by the app itself, straight from the HockeyTech API
// (src/lib/playerStatsSync.ts) — this Worker is not involved.

import { handleIcalProxy } from './ical-proxy.js';

/**
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response>}
 */
async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/ical') {
    return handleIcalProxy(request, env);
  }

  if (url.pathname === '/status') {
    return new Response(
      JSON.stringify({
        status: 'online',
        message: 'AHL iCal proxy is running',
        time: new Date().toISOString(),
        endpoints: ['/ical?url=<encoded HorizonWebRef feed url>'],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (url.pathname === '/') {
    return new Response('AHL iCal proxy - see /status', { status: 200 });
  }

  return new Response('Endpoint not found', { status: 404 });
}

export default {
  fetch: handleRequest,
};
