import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchDirectionsLeg } from "../src/maptiler.js";
import { haversineDistanceMeters, normalizeLineStringGeometry } from "../src/geo.js";
import { getSupabaseClient } from "../src/supabase.js";
import {
  getAllRouteVariants,
  getPlatformsByIds,
  getRouteEdgesByVariantIds,
  getRouteVariantStopsByVariantIds,
  getStationsByIds,
} from "../src/transitRepository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_FILE = path.resolve(__dirname, "../.cache/driving-directions-cache.json");
const UPSERT_BATCH_SIZE = 300;
const FALLBACK_MIN_DISTANCE_M = 8;
const FALLBACK_DRIVING_SPEED_MPS = 7.5;
const FALLBACK_MIN_DURATION_S = 8;

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    force: args.includes("--force"),
    variantId: (() => {
      const index = args.findIndex((entry) => entry === "--variant-id");
      if (index >= 0 && args[index + 1]) return args[index + 1];
      return null;
    })(),
  };
}

function chunk(items, size) {
  const output = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
}

async function readCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCache(cache) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

function buildStopsByVariant(variantStops) {
  const byVariant = new Map();
  for (const stop of variantStops) {
    if (!byVariant.has(stop.variant_id)) {
      byVariant.set(stop.variant_id, []);
    }
    byVariant.get(stop.variant_id).push(stop);
  }
  for (const stops of byVariant.values()) {
    stops.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
  }
  return byVariant;
}

async function withRetry(fn, retries = 3, delayMs = 500) {
  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function upsertEdges(supabase, rows) {
  for (const batch of chunk(rows, UPSERT_BATCH_SIZE)) {
    const { error } = await supabase
      .from("route_edges")
      .upsert(batch, { onConflict: "variant_id,from_stop_sequence,to_stop_sequence" });
    if (error) {
      throw new Error(`Failed to upsert route_edges: ${error.message}`);
    }
  }
}

function buildFallbackEdge(fromPoint, toPoint, source = "fallback_straight_line") {
  const rawDistance = haversineDistanceMeters(
    Number(fromPoint.lat),
    Number(fromPoint.lon),
    Number(toPoint.lat),
    Number(toPoint.lon)
  );
  const distanceM = Math.max(Number(rawDistance) || 0, FALLBACK_MIN_DISTANCE_M);
  const durationS = Math.max(
    Math.round(distanceM / FALLBACK_DRIVING_SPEED_MPS),
    FALLBACK_MIN_DURATION_S
  );

  return {
    distanceM,
    durationS,
    geometry: {
      type: "LineString",
      coordinates: [
        [Number(fromPoint.lon), Number(fromPoint.lat)],
        [Number(toPoint.lon), Number(toPoint.lat)],
      ],
    },
    source,
  };
}

function resolveStopPoint(stopRow, stationById, platformById) {
  const station = stationById.get(stopRow.station_id);
  const platform = stopRow.platform_id ? platformById.get(stopRow.platform_id) : null;
  const lat = platform ? Number(platform.lat) : station ? Number(station.lat) : NaN;
  const lon = platform ? Number(platform.lon) : station ? Number(station.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    id: platform?.id ?? station?.id ?? `${stopRow.station_id}:${stopRow.stop_sequence}`,
    lat,
    lon,
    stationId: station?.id ?? stopRow.station_id,
    platformId: platform?.id ?? null,
  };
}

function buildPointCacheToken(point) {
  return [
    point.id,
    Number(point.lat).toFixed(6),
    Number(point.lon).toFixed(6),
  ].join("@");
}

async function main() {
  const { force, variantId } = parseArgs();
  const supabase = getSupabaseClient();
  const cache = await readCache();

  let variants = await getAllRouteVariants();
  if (variantId) {
    variants = variants.filter((variant) => variant.id === variantId);
  }
  if (variants.length === 0) {
    throw new Error("No route variants found for edge precomputation.");
  }

  const variantIds = variants.map((variant) => variant.id);
  const variantStops = await getRouteVariantStopsByVariantIds(variantIds);
  const stopIds = Array.from(new Set(variantStops.map((stop) => stop.station_id)));
  const stations = await getStationsByIds(stopIds);
  const platformIds = Array.from(
    new Set(variantStops.map((stop) => stop.platform_id).filter(Boolean))
  );
  const platforms = await getPlatformsByIds(platformIds);
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const platformById = new Map(platforms.map((platform) => [platform.id, platform]));
  const stopsByVariant = buildStopsByVariant(variantStops);

  const existingEdges = force ? [] : await getRouteEdgesByVariantIds(variantIds);
  const existingEdgeSet = new Set(
    existingEdges.map(
      (edge) => `${edge.variant_id}:${edge.from_stop_sequence}:${edge.to_stop_sequence}`
    )
  );

  const edgesToWrite = [];
  let skippedExisting = 0;
  let created = 0;
  let fallbackCount = 0;
  let apiFailureFallbackCount = 0;

  for (const variant of variants) {
    const orderedStops = stopsByVariant.get(variant.id) ?? [];
    for (let index = 0; index < orderedStops.length - 1; index += 1) {
      const fromStop = orderedStops[index];
      const toStop = orderedStops[index + 1];
      const edgeKey = `${variant.id}:${fromStop.stop_sequence}:${toStop.stop_sequence}`;

      if (!force && existingEdgeSet.has(edgeKey)) {
        skippedExisting += 1;
        continue;
      }

      const fromStation = stationById.get(fromStop.station_id);
      const toStation = stationById.get(toStop.station_id);
      const fromPoint = resolveStopPoint(fromStop, stationById, platformById);
      const toPoint = resolveStopPoint(toStop, stationById, platformById);
      if (!fromStation || !toStation || !fromPoint || !toPoint) {
        throw new Error(`Station not found for edge ${edgeKey}.`);
      }

      const cacheKey = `${buildPointCacheToken(fromPoint)}->${buildPointCacheToken(toPoint)}`;
      let directions = cache[cacheKey] ?? null;
      if (!directions) {
        try {
          directions = await withRetry(() =>
            fetchDirectionsLeg({
              profile: "driving",
              from: { lat: fromPoint.lat, lon: fromPoint.lon },
              to: { lat: toPoint.lat, lon: toPoint.lon },
            })
          );
        } catch {
          directions = buildFallbackEdge(
            fromPoint,
            toPoint,
            "fallback_straight_line_api_failure"
          );
          apiFailureFallbackCount += 1;
          fallbackCount += 1;
          console.warn(`[precompute] API failure fallback used for edge ${edgeKey}.`);
        }
        cache[cacheKey] = directions;
      }

      const lineGeometry = normalizeLineStringGeometry(directions.geometry);
      const hasInvalidGeometry = !lineGeometry;
      const hasInvalidMetrics =
        (Number(directions.distanceM) || 0) <= 0 || (Number(directions.durationS) || 0) <= 0;

      let distanceM = Number(directions.distanceM) || 0;
      let durationS = Number(directions.durationS) || 0;
      let edgeGeometry = lineGeometry;
      let source = directions.source ?? "maptiler";

      if (hasInvalidGeometry || hasInvalidMetrics) {
        const fallback = buildFallbackEdge(
          fromPoint,
          toPoint,
          "fallback_straight_line_invalid_metrics"
        );
        distanceM = fallback.distanceM;
        durationS = fallback.durationS;
        edgeGeometry = normalizeLineStringGeometry(fallback.geometry);
        source = fallback.source;
        fallbackCount += 1;
        console.warn(
          `[precompute] Fallback used for edge ${edgeKey} (distance=${distanceM.toFixed(
            1
          )}m, duration=${durationS}s).`
        );
      }

      if (!edgeGeometry) {
        throw new Error(`Invalid geometry for edge ${edgeKey} after fallback.`);
      }

      edgesToWrite.push({
        variant_id: variant.id,
        from_stop_sequence: Number(fromStop.stop_sequence),
        to_stop_sequence: Number(toStop.stop_sequence),
        from_station_id: fromStation.id,
        to_station_id: toStation.id,
        from_platform_id: fromPoint.platformId,
        to_platform_id: toPoint.platformId,
        distance_m: distanceM,
        duration_s: durationS,
        line_geojson: edgeGeometry,
        source,
      });
      created += 1;
    }
  }

  if (edgesToWrite.length > 0) {
    await upsertEdges(supabase, edgesToWrite);
  }
  await writeCache(cache);

  console.log(
    [
      `Edge precompute complete`,
      `variants=${variants.length}`,
      `created_or_updated=${created}`,
      `skipped_existing=${skippedExisting}`,
      `fallback_edges=${fallbackCount}`,
      `api_failure_fallbacks=${apiFailureFallbackCount}`,
      `cache_file=${CACHE_FILE}`,
    ].join(" | ")
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
