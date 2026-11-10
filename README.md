# RxNear

RxNear finds pharmacies near a U.S. location. Names, addresses, and phone numbers come from the CMS NPPES registry. Coordinates come from the U.S. Census Bureau geocoder. ZIP and city outlines come from Census TIGERweb. A website, hours, wheelchair note, or drive-through note is shown only when OpenStreetMap matches that same pharmacy. Missing facts say “Information unavailable.” RxNear does not invent stock, prices, hours, or pharmacies.

No API key is required. Optional Upstash Redis environment variables make the request limit shared across serverless instances.

## Requirements

- Node.js 22
- Network access to NPPES, the Census geocoder, Census TIGERweb, and OpenStreetMap during a search
- The gazetteer files in `data/`, built by `npm run ingest` when they are missing

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and search `10001`, `Chicago, IL`, or `1600 Pennsylvania Ave NW, Washington, DC`.

`npm run ingest` rebuilds the Census 2025 ZIP and place gazetteer in `data/` when those files are missing. Set `RXNEAR_REFRESH_GAZETTEER=1` to download them again.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | No | Upstash REST endpoint. When this and the token are set, rate limits are counted in Redis. |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash REST token. |
| `RXNEAR_REFRESH_GAZETTEER` | No | Set to `1` to re-download the Census gazetteer during ingest. |
| `RXNEAR_USE_FIXTURES` | No | If set to `1`, the app refuses to serve results. There is no fixture mode. |

`/api/health` reports `rateLimit.mode` as `upstash` or `memory`.

## Limits and caching

Without Upstash, the limit is per server process. It does not carry across separate Vercel serverless instances. Set both Upstash variables before a multi-instance deployment.

| Route | Limit |
| --- | --- |
| `/api/geocode` | 30 requests per minute per client |
| `/api/pharmacies` | 20 requests per minute per client |
| `/api/pharmacies/[npi]` | 30 requests per minute per client |

| Data | How long it is reused |
| --- | --- |
| NPPES results for one ZIP code | 12 hours, in the current process |
| Census ZIP and place boundaries | 12 hours, in the current process |
| OpenStreetMap pharmacy points | 6 hours, in the current process |
| HTTP API responses | `Cache-Control: no-store` |
| Last successful search | This browser only, in `localStorage`. If the next search for that same place fails, the page shows that copy and the time it was retrieved. |
| Saved locations | Up to 5 on this browser. Notifications are off until you opt in. |

The service worker caches the app shell (`/`, `/sources`, `/about`). It does not answer `/api/` from cache. A periodic background check, when the browser allows it, compares NPI numbers for saved locations that have alerts turned on. The notification says only that the federal NPI list changed. It does not claim a pharmacy opened, has stock, or has hours.

## Search coverage

A ZIP or city search starts at the Census center, then keeps a pharmacy when any of these is true:

- Its distance is inside the selected radius.
- Its published practice-location ZIP code is the ZIP code you searched.
- Its Census-geocoded point is inside the official ZIP or place polygon.

Pharmacies kept only by the boundary or the published ZIP are labeled as beyond the selected radius. If TIGERweb does not return the polygon, the page says the boundary could not be loaded and still keeps same-ZIP records.

The map is an interactive map of the United States before the first search. Pharmacy pins appear after a search. The Census boundary is drawn when TIGERweb returns one.

## Checks

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
npm run check:ready
npm run build
```

`check:ready` confirms the gazetteer counts and one live NPPES read. `RXNEAR_USE_FIXTURES=1` is refused. The site does not serve sample pharmacies.

Powered by Codyza.
