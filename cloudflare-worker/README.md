# AHL iCal Proxy (Cloudflare Worker)

A single-purpose Cloudflare Worker that lets the **web** build of AHL Officials
fetch a user's HorizonWebRef iCal feed.

## Why this exists

`horizonwebref.com` sends no `Access-Control-Allow-Origin` header. The native
app fetches a user's feed directly and is unaffected, but a browser blocks that
request before the app ever sees the response. This Worker fetches the feed
server-side and echoes it back with CORS headers.

That is all it does. It holds no credentials and touches no database.

**It is not involved in stats, rosters or standings.** Those are synced by the
app itself, straight from the HockeyTech API — see `src/lib/playerStatsSync.ts`
(`syncPlayerStats`, `syncPlayerRoster`, `syncTeamStandings`).

> Earlier versions of this Worker also scraped `theahl.com` on a cron into the
> `teamRosters` table. That duplicated the app's own API syncs and was removed.
> The scrapers are still in git history if they are ever needed again.

## Endpoints

| Route | Purpose |
|---|---|
| `GET /ical?url=<encoded feed url>` | Fetches the feed and returns it with CORS headers |
| `GET /status` | Health check |

There is no API key. The feed URL is itself the secret, and two guards keep the
proxy from being useful to anyone else:

- the target must start with `https://www.horizonwebref.com/syncICS`, and
- the request `Origin` must be on the allowlist.

## Setup

```bash
cd cloudflare-worker
npm install
npx wrangler login
npx wrangler deploy
```

That prints the Worker URL. There are no secrets to set.

Then point the app at it — in the **repo root** `.env` (see `.env.example`):

```
EXPO_PUBLIC_ICAL_PROXY_URL=https://ahl-ical-proxy.<your-subdomain>.workers.dev/ical
```

`EXPO_PUBLIC_*` values are baked in at bundle time, so restart the dev server or
re-export after changing this.

## Allowed origins

`http://localhost:8081` and `http://localhost:19006` are always allowed, so local
`npm run web` works with no extra config. For a deployed web app, add its origin
to `wrangler.toml` and redeploy:

```toml
[vars]
ICAL_ALLOWED_ORIGINS = "https://your-web-app.example.com,https://*.expo.app"
```

An entry of the form `https://*.example.com` matches any subdomain, which is what
you want for EAS Hosting preview URLs (each preview deploy gets its own
hostname). The wildcard stands in only for leading labels — `https://*.expo.app`
matches `https://preview.expo.app` but **not** `https://evil-expo.app`.

## Local development

```bash
npm run dev
```

Then, from another shell:

```bash
curl -i "http://127.0.0.1:8787/ical?url=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' 'https://www.horizonwebref.com/syncICS?...')"
```

## Troubleshooting

- **`403 Origin not allowed`** — the browser's origin is not in
  `ICAL_ALLOWED_ORIGINS`. Add it to `wrangler.toml` and redeploy.
- **`403 Only HorizonWebRef iCal URLs may be proxied`** — the user's stored
  `ical_url` does not start with `https://www.horizonwebref.com/syncICS`.
- **`401 Access Denied. Invalid or expired link.`** — passed through from
  HorizonWebRef; the user's feed URL has expired and they need to re-link it
  in the app.
- **App throws `EXPO_PUBLIC_ICAL_PROXY_URL is not set`** — missing from `.env`,
  or the bundler was not restarted after adding it.

## License

This project is licensed under the MIT License.
