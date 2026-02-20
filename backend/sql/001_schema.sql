create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.stations (
  id text primary key,
  name text not null,
  lat double precision not null,
  lon double precision not null,
  geom geography(Point, 4326) generated always as (
    st_setsrid(st_makepoint(lon, lat), 4326)::geography
  ) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.platforms (
  id text primary key,
  station_id text not null references public.stations(id) on delete cascade,
  name text not null,
  side text not null check (side in ('left', 'right')),
  lat double precision not null,
  lon double precision not null,
  geom geography(Point, 4326) generated always as (
    st_setsrid(st_makepoint(lon, lat), 4326)::geography
  ) stored,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_platforms_station_id_id
  on public.platforms (station_id, id);

create table if not exists public.routes (
  id text primary key,
  name text not null,
  is_loop boolean not null default false,
  directionality text not null check (directionality in ('one_way', 'bidirectional')),
  loop_direction text null,
  created_at timestamptz not null default now()
);

create table if not exists public.route_variants (
  id uuid primary key default gen_random_uuid(),
  variant_key text not null unique,
  route_id text not null references public.routes(id) on delete cascade,
  direction text not null check (direction in ('forward', 'reverse')),
  stop_count integer not null check (stop_count > 1),
  created_at timestamptz not null default now()
);

create table if not exists public.route_variant_stops (
  variant_id uuid not null references public.route_variants(id) on delete cascade,
  stop_sequence integer not null check (stop_sequence > 0),
  station_id text not null references public.stations(id) on delete restrict,
  platform_id text null references public.platforms(id) on delete restrict,
  constraint fk_rvs_station_platform_match
    foreign key (station_id, platform_id)
    references public.platforms(station_id, id),
  primary key (variant_id, stop_sequence)
);

create table if not exists public.route_edges (
  id bigserial primary key,
  variant_id uuid not null references public.route_variants(id) on delete cascade,
  from_stop_sequence integer not null check (from_stop_sequence > 0),
  to_stop_sequence integer not null check (to_stop_sequence > 0),
  from_station_id text not null references public.stations(id) on delete restrict,
  to_station_id text not null references public.stations(id) on delete restrict,
  from_platform_id text null references public.platforms(id) on delete restrict,
  to_platform_id text null references public.platforms(id) on delete restrict,
  distance_m double precision not null check (distance_m >= 0),
  duration_s double precision not null check (duration_s >= 0),
  line_geojson jsonb not null,
  source text not null default 'maptiler',
  created_at timestamptz not null default now(),
  unique (variant_id, from_stop_sequence, to_stop_sequence)
);

create index if not exists idx_stations_geom on public.stations using gist (geom);
create index if not exists idx_platforms_geom on public.platforms using gist (geom);
create index if not exists idx_platforms_station_id on public.platforms (station_id);
create index if not exists idx_route_variants_route_id on public.route_variants (route_id);
create index if not exists idx_route_variant_stops_variant_seq
  on public.route_variant_stops (variant_id, stop_sequence);
create index if not exists idx_route_variant_stops_station_id
  on public.route_variant_stops (station_id);
create index if not exists idx_route_edges_variant_range
  on public.route_edges (variant_id, from_stop_sequence, to_stop_sequence);

alter table public.stations enable row level security;
alter table public.platforms enable row level security;
alter table public.routes enable row level security;
alter table public.route_variants enable row level security;
alter table public.route_variant_stops enable row level security;
alter table public.route_edges enable row level security;
