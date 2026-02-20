import { HttpError } from "./errors.js";
import { getSupabaseClient } from "./supabase.js";

const IN_BATCH_SIZE = 120;

function assertNoError(error, message) {
  if (!error) return;
  throw new HttpError(500, message, error.message ?? error);
}

function dedupe(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isMissingColumnError(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("column") && message.includes("does not exist");
}

async function selectInBatches({ table, column, values, select }) {
  const supabase = getSupabaseClient();
  const ids = dedupe(values);
  if (ids.length === 0) return [];

  const rows = [];
  for (let i = 0; i < ids.length; i += IN_BATCH_SIZE) {
    const batch = ids.slice(i, i + IN_BATCH_SIZE);
    const { data, error } = await supabase.from(table).select(select).in(column, batch);
    assertNoError(error, `Failed to fetch ${table}.`);
    rows.push(...(data ?? []));
  }
  return rows;
}

async function selectInBatchesWithFallback({
  table,
  column,
  values,
  select,
  fallbackSelect,
}) {
  try {
    return await selectInBatches({ table, column, values, select });
  } catch (error) {
    const isMissingColumn =
      error instanceof HttpError &&
      error.status === 500 &&
      isMissingColumnError(error.details ?? error.message);
    if (!fallbackSelect || !isMissingColumn) {
      throw error;
    }
    const rows = await selectInBatches({
      table,
      column,
      values,
      select: fallbackSelect,
    });
    return rows;
  }
}

export async function getNearbyStations({ lat, lon, radiusM = 2200, limit = 12 }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("nearby_stations", {
    p_lat: lat,
    p_lon: lon,
    p_radius_m: radiusM,
    p_limit: limit,
  });
  assertNoError(error, "Failed to fetch nearby stations.");

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    lat: Number(row.lat),
    lon: Number(row.lon),
    distanceM: Number(row.distance_m),
  }));
}

export async function getRouteById(routeId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("routes").select("*").eq("id", routeId).maybeSingle();
  assertNoError(error, "Failed to fetch route.");
  return data ?? null;
}

export async function getAllRoutes() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("routes")
    .select("*")
    .order("name", { ascending: true });
  assertNoError(error, "Failed to fetch routes.");
  return data ?? [];
}

export async function getRoutesByIds(routeIds) {
  const routes = await selectInBatches({
    table: "routes",
    column: "id",
    values: routeIds,
    select: "*",
  });
  return routes;
}

export async function getAllRouteVariants() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("route_variants")
    .select("id, route_id, variant_key, direction, stop_count")
    .order("route_id")
    .order("direction");
  assertNoError(error, "Failed to fetch route variants.");
  return data ?? [];
}

export async function getRouteVariantsByRouteId(routeId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("route_variants")
    .select("id, route_id, variant_key, direction, stop_count")
    .eq("route_id", routeId)
    .order("direction");
  assertNoError(error, "Failed to fetch route variants.");
  return data ?? [];
}

export async function getRouteVariantStopsByVariantIds(variantIds) {
  const rows = await selectInBatchesWithFallback({
    table: "route_variant_stops",
    column: "variant_id",
    values: variantIds,
    select: "variant_id, stop_sequence, station_id, platform_id",
    fallbackSelect: "variant_id, stop_sequence, station_id",
  });
  rows.sort((a, b) => {
    if (a.variant_id !== b.variant_id) return a.variant_id.localeCompare(b.variant_id);
    return Number(a.stop_sequence) - Number(b.stop_sequence);
  });
  return rows.map((row) => ({
    ...row,
    platform_id: row.platform_id ?? null,
  }));
}

export async function getRouteEdgesByVariantIds(variantIds) {
  const rows = await selectInBatchesWithFallback({
    table: "route_edges",
    column: "variant_id",
    values: variantIds,
    select:
      "variant_id, from_stop_sequence, to_stop_sequence, from_station_id, to_station_id, from_platform_id, to_platform_id, distance_m, duration_s, line_geojson, source",
    fallbackSelect:
      "variant_id, from_stop_sequence, to_stop_sequence, from_station_id, to_station_id, distance_m, duration_s, line_geojson, source",
  });
  rows.sort((a, b) => {
    if (a.variant_id !== b.variant_id) return a.variant_id.localeCompare(b.variant_id);
    return Number(a.from_stop_sequence) - Number(b.from_stop_sequence);
  });
  return rows.map((row) => ({
    ...row,
    from_platform_id: row.from_platform_id ?? null,
    to_platform_id: row.to_platform_id ?? null,
  }));
}

export async function getStationsByIds(stationIds) {
  const rows = await selectInBatches({
    table: "stations",
    column: "id",
    values: stationIds,
    select: "id, name, lat, lon",
  });
  return rows.map((row) => ({
    ...row,
    lat: Number(row.lat),
    lon: Number(row.lon),
  }));
}

export async function getPlatformsByStationIds(stationIds) {
  const rows = await selectInBatches({
    table: "platforms",
    column: "station_id",
    values: stationIds,
    select: "id, station_id, name, side, lat, lon",
  });
  return rows.map((row) => ({
    ...row,
    lat: Number(row.lat),
    lon: Number(row.lon),
  }));
}

export async function getPlatformsByIds(platformIds) {
  const rows = await selectInBatches({
    table: "platforms",
    column: "id",
    values: platformIds,
    select: "id, station_id, name, side, lat, lon",
  });
  return rows.map((row) => ({
    ...row,
    lat: Number(row.lat),
    lon: Number(row.lon),
  }));
}
