# momo_manager

> Formerly known internally as “MoMo Monitor.”

Phones + Third-Party APIs → Server (Express/Firestore) → Web UI

This app ingests mobile money transactions from phones (planned) and third‑party REST APIs (polling), stores them in Firestore (Admin SDK), and provides a dashboard, transactions browser, reports (daily/weekly/monthly), integrations management, CSV export, and live updates via SSE.

## Stack
- Server: Node 20+, Express, dotenv, helmet, cors, compression, pino, express-rate-limit, node-cron, csv-stringify, firebase-admin
- DB: Firestore via firebase-admin (Admin SDK)
- Frontend: Single-page HTML + Tailwind (CDN) + vanilla ES modules. Charts via Chart.js (CDN). PDF via jsPDF (CDN)
- Live updates: SSE at `/live`
- Timezone: Africa/Kampala (UTC+3) for rollups

## Setup
1. Install Node 20+.
2. Create a Firebase project and a service account JSON (Admin SDK). Save it as `momo-monitor/firebase.serviceAccount.json` (not committed).
3. Copy env example and configure:
   - `cp .env.example .env` and set values. Ensure `GOOGLE_APPLICATION_CREDENTIALS` points to your service account path.
4. Install dependencies and run server:
   - `cd server && npm install && npm run dev`
5. Open http://localhost:8080 to access the UI.

## Authentication
- All dashboard assets are now behind a lightweight session wall.
- Configure `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `SESSION_SECRET` in `.env`.
- Visit `/login`, enter the credentials, and the server will issue an HTTP-only session cookie.
- Use `/logout` (top-right button) to clear the session.

## Integrations (multiple networks)
- The app supports multiple integrations running concurrently. Each integration is an independent entry with its own `providerType`, `config` and `enabled` flag.
- Example networks you can configure side-by-side: `MTN`, `Airtel`, `Africell`, `UTL` — each becomes its own integration record and is polled/used independently.
- The UI under **Integrations** allows creating many integrations; back-end connectors are keyed by `providerType` (see `server/connectors/generic-rest.js`). To add presets, POST to `/integrations` with a JSON body like:

```json
{
   "name": "MTN Poller",
   "providerType": "generic-rest",
   "enabled": true,
   "config": { "baseUrl": "https://mtn.example/api", "apiKey": "XXX" }
}
```

- Recommendations:
   - Give each integration a descriptive `name` and unique `config` (credentials) per network.
   - Set `enabled: false` until you verify credentials with the `/integrations/:id/test` endpoint.
   - Use different poll intervals or run schedules for high-volume providers to avoid rate limits.

If you want, I can add a few demo presets (MTN/Airtel) to the demo data so you can see them listed immediately in `DEMO=true` mode.

## Environment
See `.env.example` at repo root. Important:
- `TZ=Africa/Kampala`
- `CORS_ORIGIN=http://localhost:8080` (adjust if front-end is on another host)

## Firestore
Schema (all writes via server):

Collections:
- `devices/{deviceId}` → { provider, secretHash, lastHeartbeatAt, queueSize, battery, createdAt, updatedAt }
- `transactions/{idKey}` → normalized transaction
  - { idKey, provider, type, amount, currency, fromMsisdn, toMsisdn, externalRef, status, reasonCode, occurredAt, rawPayload, createdAt }
- `ingest_events/{autoId}` → archive of raw batches
- `integrations/{integrationId}` → { name, providerType, enabled, status, lastRunAt, pollIntervalSec, config, createdAt, updatedAt }
- `rollups_daily/{yyyyMMdd}`
- `rollups_weekly/{yyyy_II}` // ISO week
- `rollups_monthly/{yyyy_MM}`

Rules (deny all to clients) are in `firebase/firestore.rules`. Admin SDK bypasses rules.

Indexes are in `firebase/firestore.indexes.json`. Deploy them via Firebase CLI if desired.

## Running cron jobs
- Connectors polling: runs every minute (`server/jobs/run-connectors.js`).
- Rollups: builds yesterday’s daily rollup at 00:05 Africa/Kampala (`server/jobs/build-rollups.js`). Weekly/monthly computed from daily docs on demand.

## Adding a connector
1. Copy `server/connectors/generic-rest.js` to a new file and implement:
   - `fetchSince({ config, sinceIso, untilIso })` returning normalized records
   - `testConnection(config)`
2. When creating an integration via UI/API, set `providerType` to your connector key.

## Security
- Admin SDK only; client never talks to Firestore.
- CORS restricted to `CORS_ORIGIN`.
- Authenticated session required for UI/API access (except `/healthz`).
- Rate limits on `/ingest/*` and manual `/integrations/:id/run`.
- Optional HMAC verification for phone ingest.

## Troubleshooting
- CORS: ensure `CORS_ORIGIN` matches the browser origin exactly.
- Time skew: server timezone must be `Africa/Kampala` (`TZ` env var).
- Indexes: if queries warn about indexes, deploy from `firebase/firestore.indexes.json`.

