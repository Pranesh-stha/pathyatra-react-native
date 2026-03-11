# RouteApp Backend

Express API for transit trip planning with Supabase + MapTiler.

## 1) Install

```bash
cd backend
npm install
```

## 2) Environment

Copy `.env.example` to `.env` and fill values:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MAPTILER_API_KEY`
- `OSRM_BASE_URL` (optional fallback, default public OSRM)
- `PREFERRED_ROUTE_IDS` (optional CSV route ids to prioritize, e.g. `r1,r2`)
- `PREFERRED_ROUTE_BONUS_S` (optional score bonus in seconds for preferred routes, default `0`)
- `PREFERRED_ROUTE_ORDER_STEP_S` (optional extra bonus by list order, default `120`)
- `PORT` (optional, default `4000`)

## 3) Supabase SQL

Run SQL in order:

1. `sql/001_schema.sql`
2. `sql/002_functions.sql`

## 4) Import Data

From `backend/`:

```bash
npm run import:transit
```

Optional:

```bash
npm run import:transit -- --file ../rough_data/transit.json --no-reset
```

## 5) Precompute Bus Edges

```bash
npm run precompute:edges
```

Optional:

```bash
npm run precompute:edges -- --force
npm run precompute:edges -- --variant-id <route_variant_uuid>
```

## 6) Run API

```bash
npm run dev
```

Endpoints:

- `GET /health`
- `GET /v1/stops/near?lat=<>&lon=<>&radiusM=<>&limit=<>`
- `GET /v1/routes/:routeId`
- `GET /v1/trips/plan?fromLat=<>&fromLon=<>&toLat=<>&toLon=<>`
  - Optional: `preferredRouteIds=<id1,id2>` and `preferredRouteBonusS=<seconds>`
