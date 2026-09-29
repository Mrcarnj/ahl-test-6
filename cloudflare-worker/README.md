# AHL Scraper Cloudflare Worker

This Cloudflare Worker runs the AHL player and number scrapers on a scheduled basis using Cloudflare's CRON triggers.

## Features

- Runs player-scraper.js and numbers-scraper.js in sequence
- Scheduled to run every 8 hours (at 00:00, 08:00, 16:00 UTC)
- Can be manually triggered via HTTP endpoints
- Secured with API key authentication
- Optimized for Cloudflare Workers environment

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare account
- Supabase account with appropriate tables set up

## Setup

1. Install dependencies:

```bash
cd cloudflare-worker
npm install
```

2. Generate an API key for securing HTTP endpoints:

```bash
# On macOS/Linux
openssl rand -base64 32

# On Windows (PowerShell)
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
```

3. Configure environment variables in `wrangler.toml`:

```toml
[vars]
SUPABASE_URL = "your-supabase-url"
SUPABASE_KEY = "your-supabase-key"
API_KEY = "your-generated-api-key"  # Paste the generated key here
```

4. Adjust the CRON schedule in `wrangler.toml` if needed:

```toml
[triggers]
crons = ["0 */8 * * *"] # Run every 8 hours (at 00:00, 08:00, 16:00 UTC)
```

## Deployment

Deploy the worker to Cloudflare:

```bash
npx wrangler deploy
```

## Usage

### Scheduled Execution

The worker will automatically run according to the configured CRON schedule.

### Manual Execution

You can manually trigger the scrapers using the following HTTP endpoints:

- Run both scrapers: `GET /run-all`
- Run only player scraper: `GET /run-player-scraper`
- Run only numbers scraper: `GET /run-numbers-scraper`

All endpoints require authentication with the API key:

```bash
curl -H "Authorization: Bearer your-api-key" https://your-worker-url.workers.dev/run-all
```

## iCal proxy (`/ical`)

The web build cannot fetch a user's HorizonWebRef feed directly: `horizonwebref.com`
sends no `Access-Control-Allow-Origin` header, so the browser blocks the request.
`GET /ical?url=<encoded feed url>` fetches the feed server-side and returns it
with CORS headers. The native app is unaffected and still fetches directly.

This endpoint is **not** behind the API key — the feed URL is itself the secret.
Two guards keep it from being an open proxy:

- the target must start with `https://www.horizonwebref.com/syncICS`, and
- the request `Origin` must be allowed.

Set the allowed origins in the Worker environment:

```
ICAL_ALLOWED_ORIGINS=https://your-web-app.example.com,https://preview--your-app.expo.app
```

`http://localhost:8081` and `http://localhost:19006` are always allowed so local
`npm run web` works against a deployed Worker.

Point the app at it with `EXPO_PUBLIC_ICAL_PROXY_URL` (see `.env.example` in the
repo root):

```
EXPO_PUBLIC_ICAL_PROXY_URL=https://your-worker-url.workers.dev/ical
```

## Limitations

- Cloudflare Workers have a maximum execution time of 30 seconds
- The scrapers have been optimized to work within this limit by:
  - Only processing the most recent seasons
  - Using smaller chunk sizes
  - Reducing timeouts and delays
  - Implementing timeout handling

## Troubleshooting

- If the worker times out, consider further reducing the number of seasons processed
- Check the Cloudflare Workers logs for detailed error messages
- Ensure your Supabase credentials are correct and have the necessary permissions

## License

This project is licensed under the MIT License. 