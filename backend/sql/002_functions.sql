create or replace function public.nearby_stations(
  p_lat double precision,
  p_lon double precision,
  p_radius_m double precision default 2000,
  p_limit integer default 10
)
returns table (
  id text,
  name text,
  lat double precision,
  lon double precision,
  distance_m double precision
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    s.lat,
    s.lon,
    st_distance(
      s.geom,
      st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
    ) as distance_m
  from public.stations s
  where st_dwithin(
    s.geom,
    st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
    p_radius_m
  )
  order by
    st_distance(
      s.geom,
      st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
    )
  limit greatest(1, least(p_limit, 100));
$$;

create or replace function public.reset_transit_data()
returns void
language plpgsql
security definer
as $$
begin
  truncate table public.route_edges restart identity cascade;
  truncate table public.route_variant_stops cascade;
  truncate table public.route_variants cascade;
  truncate table public.platforms cascade;
  truncate table public.routes cascade;
  truncate table public.stations cascade;
end;
$$;

