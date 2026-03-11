import cors from "cors";
import express from "express";
import { assertServerConfig, config } from "./config.js";
import { HttpError } from "./errors.js";
import { mergeLineStrings, normalizeLineStringGeometry } from "./geo.js";
import { fetchDirectionsPath } from "./maptiler.js";
import { planSingleBusTrip } from "./planner.js";
import {
  getAllRoutes,
  getNearbyStations,
  getPlatformsByIds,
  getPlatformsByStationIds,
  getRouteById,
  getRouteEdgesByVariantIds,
  getRouteVariantsByRouteId,
  getRouteVariantStopsByVariantIds,
  getStationsByIds,
} from "./transitRepository.js";

const ROUTE_SHAPE_MAX_POINTS_PER_REQUEST = 12;
const ROUTE_SHAPE_REQUEST_TIMEOUT_MS = 7000;
const ROUTE_SHAPE_RETRY_BACKOFF_MS = 250;
const ROUTE_SHAPE_CACHE_TTL_MS = 5 * 60 * 1000;
const ROUTE_SHAPE_CACHE_MAX_ENTRIES = 400;
const routeShapeCache = new Map();

function parseNumberParam({ raw, name, min = -Infinity, max = Infinity, fallback }) {
  if ((raw == null || raw === "") && fallback !== undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new HttpError(400, `${name} must be a valid number.`);
  }
  if (value < min || value > max) {
    throw new HttpError(400, `${name} is out of range.`);
  }
  return value;
}

function parseCsvParam(raw) {
  if (raw == null || raw === "") return [];
  return String(raw)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseLineGeoJson(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return normalizeLineStringGeometry(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return normalizeLineStringGeometry(value);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildStraightSegment(fromStation, toStation) {
  return {
    type: "LineString",
    coordinates: [
      [Number(fromStation.lon), Number(fromStation.lat)],
      [Number(toStation.lon), Number(toStation.lat)],
    ],
  };
}

function resolveRouteStopPoint(stopRow, stationById, platformById) {
  const station = stationById.get(stopRow.station_id);
  const platform = stopRow.platform_id ? platformById.get(stopRow.platform_id) : null;
  const lat = platform ? Number(platform.lat) : station ? Number(station.lat) : NaN;
  const lon = platform ? Number(platform.lon) : station ? Number(station.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat,
    lon,
    station,
    platform,
  };
}

function buildFallbackStraightGeometry(stops, stationById, platformById) {
  const coordinates = stops
    .map((entry) => resolveRouteStopPoint(entry, stationById, platformById))
    .filter(Boolean)
    .map((point) => [Number(point.lon), Number(point.lat)]);
  if (coordinates.length < 2) return null;
  return {
    type: "LineString",
    coordinates,
  };
}

function buildWaypointChunksFromStops(sortedStopRows, stationById, platformById) {
  const stations = sortedStopRows
    .map((row) => {
      const point = resolveRouteStopPoint(row, stationById, platformById);
      if (!point) return null;
      return {
        ...point,
        stopSequence: Number(row.stop_sequence),
      };
    })
    .filter(Boolean);
  if (stations.length < 2) return [];

  const chunks = [];
  let start = 0;
  while (start < stations.length - 1) {
    const end = Math.min(start + ROUTE_SHAPE_MAX_POINTS_PER_REQUEST - 1, stations.length - 1);
    const chunk = stations.slice(start, end + 1);
    if (chunk.length >= 2) chunks.push(chunk);
    if (end >= stations.length - 1) break;
    start = end;
  }
  return chunks;
}

function getCachedRouteShape(variantId) {
  const entry = routeShapeCache.get(variantId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > ROUTE_SHAPE_CACHE_TTL_MS) {
    routeShapeCache.delete(variantId);
    return null;
  }
  return entry.shape;
}

function setCachedRouteShape(variantId, shape) {
  if (!shape) return;
  routeShapeCache.set(variantId, {
    shape,
    createdAt: Date.now(),
  });
  if (routeShapeCache.size <= ROUTE_SHAPE_CACHE_MAX_ENTRIES) return;
  const oldestKey = routeShapeCache.keys().next().value;
  if (oldestKey) routeShapeCache.delete(oldestKey);
}

function buildEdgeBySeq(edgeRows) {
  const edgeBySeq = new Map();
  for (const edge of edgeRows) {
    edgeBySeq.set(`${Number(edge.from_stop_sequence)}:${Number(edge.to_stop_sequence)}`, edge);
  }
  return edgeBySeq;
}

function getTrustedEdgeLine(edge) {
  if (!edge) return null;
  if (!(edge.source === "maptiler" || edge.source === "osrm")) return null;
  const distanceM = Number(edge.distance_m) || 0;
  const durationS = Number(edge.duration_s) || 0;
  if (distanceM <= 0 || durationS <= 0) return null;
  const geometry = parseLineGeoJson(edge.line_geojson);
  if (!geometry) return null;
  // Reject straight-line geometry (only 2 coordinates) for non-trivial distances
  if (geometry.coordinates.length <= 2 && distanceM > 100) return null;
  return geometry;
}

async function fetchRoadChunkLine(stationsChunk, { retries = 2 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let timeoutId = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), ROUTE_SHAPE_REQUEST_TIMEOUT_MS);
      const points = stationsChunk.map((station) => ({
        lat: Number(station.lat),
        lon: Number(station.lon),
      }));
      const result = await fetchDirectionsPath({
        profile: "driving",
        points,
        signal: controller.signal,
      });
      const geometry = normalizeLineStringGeometry(result.geometry);
      if (geometry) return geometry;
    } catch {
      // try again below
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
    if (attempt < retries) {
      await wait(ROUTE_SHAPE_RETRY_BACKOFF_MS * (attempt + 1));
    }
  }
  return null;
}

async function buildRoadLineFromChunkLegs(stationsChunk, edgeBySeq) {
  const legTasks = [];
  for (let index = 0; index < stationsChunk.length - 1; index += 1) {
    const from = stationsChunk[index];
    const to = stationsChunk[index + 1];
    legTasks.push(
      (async () => {
        const edge = edgeBySeq.get(`${Number(from.stopSequence)}:${Number(to.stopSequence)}`);
        const trustedEdgeLine = getTrustedEdgeLine(edge);
        if (trustedEdgeLine) {
          return {
            line: trustedEdgeLine,
            usedStraightFallback: false,
          };
        }

        const fetchedLegLine = await fetchRoadChunkLine([from, to], { retries: 1 });
        if (fetchedLegLine) {
          return {
            line: fetchedLegLine,
            usedStraightFallback: false,
          };
        }

        // Use straight-line fallback only for this specific leg
        return {
          line: buildStraightSegment(from, to),
          usedStraightFallback: true,
        };
      })()
    );
  }

  const legResults = await Promise.all(legTasks);
  const usedAnyFallback = legResults.some((entry) => entry.usedStraightFallback);
  const lines = legResults.map((entry) => entry.line).filter(Boolean);
  if (lines.length === 0) {
    return {
      line: null,
      usedStraightFallback: true,
    };
  }
  return {
    line: mergeLineStrings(lines),
    usedStraightFallback: usedAnyFallback,
  };
}

async function buildVariantShapeFromEdges({
  variantId,
  sortedStopRows,
  edgesByVariantId,
  stationById,
  platformById,
}) {
  const edgeRows = (edgesByVariantId.get(variantId) ?? [])
    .slice()
    .sort((a, b) => Number(a.from_stop_sequence) - Number(b.from_stop_sequence));
  const edgeBySeq = buildEdgeBySeq(edgeRows);

  const lines = [];
  for (let i = 0; i < sortedStopRows.length - 1; i += 1) {
    const from = sortedStopRows[i];
    const to = sortedStopRows[i + 1];
    const fromSeq = Number(from.stop_sequence);
    const toSeq = Number(to.stop_sequence);
    const edge = edgeBySeq.get(`${fromSeq}:${toSeq}`);

    const fromPoint = resolveRouteStopPoint(from, stationById, platformById);
    const toPoint = resolveRouteStopPoint(to, stationById, platformById);
    if (!fromPoint || !toPoint) continue;

    const trustedEdgeLine = getTrustedEdgeLine(edge);
    if (trustedEdgeLine) {
      lines.push(trustedEdgeLine);
      continue;
    }

    // Try fetching actual driving directions instead of a straight line
    let fetchedLine = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ROUTE_SHAPE_REQUEST_TIMEOUT_MS);
      try {
        const result = await fetchDirectionsPath({
          profile: "driving",
          points: [
            { lat: Number(fromPoint.lat), lon: Number(fromPoint.lon) },
            { lat: Number(toPoint.lat), lon: Number(toPoint.lon) },
          ],
          signal: controller.signal,
        });
        fetchedLine = normalizeLineStringGeometry(result?.geometry);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch {
      fetchedLine = null;
    }

    lines.push(fetchedLine ?? buildStraightSegment(fromPoint, toPoint));
  }

  return (
    mergeLineStrings(lines) ??
    buildFallbackStraightGeometry(sortedStopRows, stationById, platformById)
  );
}

async function buildSnappedShapeFromStops(
  sortedStopRows,
  stationById,
  platformById,
  edgesByVariantId,
  variantId
) {
  const chunks = buildWaypointChunksFromStops(sortedStopRows, stationById, platformById);
  const edgeBySeq = buildEdgeBySeq(edgesByVariantId.get(variantId) ?? []);
  if (chunks.length === 0) {
    return {
      shape: buildFallbackStraightGeometry(sortedStopRows, stationById, platformById),
      usedStraightFallback: true,
    };
  }

  const chunkTasks = chunks.map(async (chunk) => {
    const roadLine = await fetchRoadChunkLine(chunk, { retries: 1 });
    if (roadLine) {
      return {
        line: roadLine,
        usedStraightFallback: false,
      };
    }

    const legFallback = await buildRoadLineFromChunkLegs(chunk, edgeBySeq);
    if (legFallback.line) {
      return legFallback;
    }

    return {
      line: null,
      usedStraightFallback: true,
    };
  });

  const chunkResults = await Promise.all(chunkTasks);
  const hasFallback = chunkResults.some((entry) => entry.usedStraightFallback || !entry.line);

  const lines = chunkResults.map((entry) => entry.line).filter(Boolean);
  const mergedLine = mergeLineStrings(lines);
  if (!mergedLine) {
    return {
      shape: null,
      usedStraightFallback: true,
    };
  }

  return {
    shape: mergedLine,
    usedStraightFallback: hasFallback,
  };
}

async function formatRouteResponse(
  route,
  variants,
  variantStops,
  stations,
  platforms,
  edges,
  { shapeVariantId = null } = {}
) {
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const platformById = new Map(platforms.map((platform) => [platform.id, platform]));
  const stopsByVariantId = new Map();
  const edgesByVariantId = new Map();

  for (const stop of variantStops) {
    if (!stopsByVariantId.has(stop.variant_id)) {
      stopsByVariantId.set(stop.variant_id, []);
    }
    stopsByVariantId.get(stop.variant_id).push(stop);
  }
  for (const edge of edges) {
    if (!edgesByVariantId.has(edge.variant_id)) {
      edgesByVariantId.set(edge.variant_id, []);
    }
    edgesByVariantId.get(edge.variant_id).push(edge);
  }

  const selectedShapeVariantId =
    shapeVariantId && variants.some((variant) => variant.id === shapeVariantId)
      ? shapeVariantId
      : variants[0]?.id ?? null;

  const formattedVariants = [];
  for (const variant of variants) {
    const sortedStopRows = (stopsByVariantId.get(variant.id) ?? [])
      .slice()
      .sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    const stops = sortedStopRows
      .map((entry) => {
        const point = resolveRouteStopPoint(entry, stationById, platformById);
        const station = stationById.get(entry.station_id);
        const platform = entry.platform_id ? platformById.get(entry.platform_id) : null;
        return {
          stopSequence: Number(entry.stop_sequence),
          station: station
            ? {
                id: station.id,
                name: station.name,
                lat: point ? point.lat : station.lat,
                lon: point ? point.lon : station.lon,
              }
            : {
                id: entry.station_id,
                name: entry.station_id,
                lat: null,
                lon: null,
              },
          platform: platform
            ? {
                id: platform.id,
                name: platform.name,
                side: platform.side,
                lat: platform.lat,
                lon: platform.lon,
              }
            : null,
        };
      });
    let shape = null;
    if (selectedShapeVariantId === variant.id) {
      shape = getCachedRouteShape(variant.id);
      if (!shape) {
        const snapped = await buildSnappedShapeFromStops(
          sortedStopRows,
          stationById,
          platformById,
          edgesByVariantId,
          variant.id
        );
        shape = snapped.shape;
        if (shape && !snapped.usedStraightFallback) {
          setCachedRouteShape(variant.id, shape);
        }
      }
    } else {
      shape = await buildVariantShapeFromEdges({
        variantId: variant.id,
        sortedStopRows,
        edgesByVariantId,
        stationById,
        platformById,
      });
    }

    formattedVariants.push({
      id: variant.id,
      variantKey: variant.variant_key,
      direction: variant.direction,
      stopCount: Number(variant.stop_count),
      shape,
      stops,
    });
  }

  return {
    route: {
      id: route.id,
      name: route.name,
      isLoop: route.is_loop,
      directionality: route.directionality,
      loopDirection: route.loop_direction,
      variants: formattedVariants,
    },
  };
}

async function main() {
  assertServerConfig();

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "routeapp-backend",
    });
  });

  app.get("/v1/stops/near", async (req, res, next) => {
    try {
      const lat = parseNumberParam({
        raw: req.query.lat,
        name: "lat",
        min: -90,
        max: 90,
      });
      const lon = parseNumberParam({
        raw: req.query.lon,
        name: "lon",
        min: -180,
        max: 180,
      });
      const radiusM = parseNumberParam({
        raw: req.query.radiusM,
        name: "radiusM",
        min: 50,
        max: 5000,
        fallback: 1500,
      });
      const limit = parseNumberParam({
        raw: req.query.limit,
        name: "limit",
        min: 1,
        max: 30,
        fallback: 10,
      });

      const stations = await getNearbyStations({
        lat,
        lon,
        radiusM,
        limit,
      });
      const platforms = await getPlatformsByStationIds(stations.map((station) => station.id));
      const platformsByStation = new Map();
      for (const platform of platforms) {
        if (!platformsByStation.has(platform.station_id)) {
          platformsByStation.set(platform.station_id, []);
        }
        platformsByStation.get(platform.station_id).push(platform);
      }

      res.json({
        stops: stations.map((station) => ({
          id: station.id,
          name: station.name,
          lat: station.lat,
          lon: station.lon,
          distanceM: Math.round(station.distanceM),
          platforms: (platformsByStation.get(station.id) ?? []).map((platform) => ({
            id: platform.id,
            name: platform.name,
            side: platform.side,
            lat: platform.lat,
            lon: platform.lon,
          })),
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/routes", async (_req, res, next) => {
    try {
      const routes = await getAllRoutes();
      res.json({
        routes: routes.map((route) => ({
          id: route.id,
          name: route.name,
          isLoop: route.is_loop,
          directionality: route.directionality,
          loopDirection: route.loop_direction,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/routes/:routeId", async (req, res, next) => {
    try {
      const route = await getRouteById(req.params.routeId);
      if (!route) {
        throw new HttpError(404, "Route not found.");
      }

      const variants = await getRouteVariantsByRouteId(route.id);
      const variantIds = variants.map((variant) => variant.id);
      const variantStops = await getRouteVariantStopsByVariantIds(variantIds);
      const edges = await getRouteEdgesByVariantIds(variantIds);
      const stationIds = Array.from(new Set(variantStops.map((stop) => stop.station_id)));
      const platformIds = Array.from(
        new Set(variantStops.map((stop) => stop.platform_id).filter(Boolean))
      );
      const stations = await getStationsByIds(stationIds);
      const platforms = await getPlatformsByIds(platformIds);
      const shapeVariantId =
        typeof req.query.shapeVariantId === "string" ? req.query.shapeVariantId : null;

      const payload = await formatRouteResponse(
        route,
        variants,
        variantStops,
        stations,
        platforms,
        edges,
        { shapeVariantId }
      );
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/trips/plan", async (req, res, next) => {
    try {
      const fromLat = parseNumberParam({
        raw: req.query.fromLat,
        name: "fromLat",
        min: -90,
        max: 90,
      });
      const fromLon = parseNumberParam({
        raw: req.query.fromLon,
        name: "fromLon",
        min: -180,
        max: 180,
      });
      const toLat = parseNumberParam({
        raw: req.query.toLat,
        name: "toLat",
        min: -90,
        max: 90,
      });
      const toLon = parseNumberParam({
        raw: req.query.toLon,
        name: "toLon",
        min: -180,
        max: 180,
      });
      const preferredRouteIds = parseCsvParam(req.query.preferredRouteIds);
      let preferredRouteBonusS;
      if (req.query.preferredRouteBonusS != null && req.query.preferredRouteBonusS !== "") {
        preferredRouteBonusS = parseNumberParam({
          raw: req.query.preferredRouteBonusS,
          name: "preferredRouteBonusS",
          min: 0,
          max: 24 * 60 * 60,
        });
      }

      const trip = await planSingleBusTrip({
        fromLat,
        fromLon,
        toLat,
        toLon,
        preferredRouteIds,
        preferredRouteBonusS,
      });
      res.json(trip);
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "Internal server error.";
    const details = error instanceof HttpError ? error.details : null;

    res.status(status).json({
      error: {
        message,
        ...(details ? { details } : {}),
      },
    });
  });

  app.listen(config.port, () => {
    console.log(`Route backend listening on port ${config.port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
