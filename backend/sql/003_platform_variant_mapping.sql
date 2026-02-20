-- Migration for existing databases to support direction-specific platform mapping.

create unique index if not exists uq_platforms_station_id_id
on public.platforms (station_id, id);

alter table public.route_variant_stops
add column if not exists platform_id text;

alter table public.route_variant_stops
drop constraint if exists fk_rvs_platform_id;

alter table public.route_variant_stops
add constraint fk_rvs_platform_id
foreign key (platform_id) references public.platforms(id);

alter table public.route_variant_stops
drop constraint if exists fk_rvs_station_platform_match;

alter table public.route_variant_stops
add constraint fk_rvs_station_platform_match
foreign key (station_id, platform_id)
references public.platforms(station_id, id);

alter table public.route_edges
add column if not exists from_platform_id text;

alter table public.route_edges
add column if not exists to_platform_id text;

alter table public.route_edges
drop constraint if exists fk_route_edges_from_platform;

alter table public.route_edges
add constraint fk_route_edges_from_platform
foreign key (from_platform_id) references public.platforms(id);

alter table public.route_edges
drop constraint if exists fk_route_edges_to_platform;

alter table public.route_edges
add constraint fk_route_edges_to_platform
foreign key (to_platform_id) references public.platforms(id);

-- Initial automatic platform assignment:
-- forward variants prefer left-side platform, reverse variants prefer right-side.
with platform_candidates as (
  select
    rvs.variant_id,
    rvs.stop_sequence,
    (
      select p.id
      from public.platforms p
      where p.station_id = rvs.station_id
      order by
        case
          when rv.direction = 'forward' and p.side = 'left' then 0
          when rv.direction = 'reverse' and p.side = 'right' then 0
          else 1
        end,
        p.id
      limit 1
    ) as picked_platform_id
  from public.route_variant_stops rvs
  join public.route_variants rv
    on rv.id = rvs.variant_id
  where coalesce(rvs.platform_id, '') = ''
)
update public.route_variant_stops rvs
set platform_id = pc.picked_platform_id
from platform_candidates pc
where rvs.variant_id = pc.variant_id
  and rvs.stop_sequence = pc.stop_sequence
  and pc.picked_platform_id is not null;
