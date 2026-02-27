import { HttpError } from "./errors.js";
import {
  getAllRouteVariants,
  getNearbyStations,
  getPlatformsByIds,
  getPlatformsByStationIds,
  getRouteEdgesByVariantIds,
  getRouteVariantStopsByVariantIds,
  getStationsByIds,
  getRoutesByIds,
} from "./transitRepository.js";
import {
  haversineDistanceMeters,
  getFirstCoordinate,
  getLastCoordinate,
  mergeLineStrings,
  normalizeLineStringGeometry,
  pickNearestPlatform,
} from "./geo.js";
import { fetchDirectionsLeg } from "./maptiler.js";

const WAIT_PENALTY_S = 300;
const WALKING_SPEED_MPS = 1.3;
const ORIGIN_NEARBY_LIMIT = 14;
const DEST_NEARBY_LIMIT = 14;
const NEARBY_RADIUS_M = 2500;
const EXPANDED_ORIGIN_NEARBY_LIMIT = 30;
const EXPANDED_DEST_NEARBY_LIMIT = 30;
const EXPANDED_NEARBY_RADIUS_M = 5000;
const MAX_EXACT_WALK_EVALUATIONS = 10;
const MAX_SHORTLIST_SIZE = 20;
const MAX_FINAL_CANDIDATE_EVALUATIONS = 5;
const BUS_FALLBACK_MIN_DISTANCE_M = 8;
const BUS_FALLBACK_SPEED_MPS = 7.5;
const BUS_FALLBACK_MIN_DURATION_S = 8;
const WALK_FALLBACK_MIN_DISTANCE_M = 5;
const WALK_FALLBACK_MIN_DURATION_S = 5;
const DIRECTIONS_CALL_TIMEOUT_MS = 6000;

function buildNoRouteResponse(code, message) {
  return {
    status: "no_route",
    code,
    message,
  };
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

function buildVariantStationIndex(variantStops) {
  const variantMap = new Map();

  for (const row of variantStops) {
    const variantId = row.variant_id;
    if (!variantMap.has(variantId)) {
      variantMap.set(variantId, {
        stationSequences: new Map(),
      });
    }
    const variantEntry = variantMap.get(variantId);
    const stationId = row.station_id;
    const seq = Number(row.stop_sequence);
    if (!variantEntry.stationSequences.has(stationId)) {
      variantEntry.stationSequences.set(stationId, []);
    }
    variantEntry.stationSequences.get(stationId).push(seq);
  }

  for (const entry of variantMap.values()) {
    for (const sequences of entry.stationSequences.values()) {
      sequences.sort((a, b) => a - b);
    }
  }

  return variantMap;
}

function buildEdgeIndex(edges) {
  const byVariant = new Map();
  for (const edge of edges) {
    const variantId = edge.variant_id;
    if (!byVariant.has(variantId)) {
      byVariant.set(variantId, new Map());
    }
    const key = `${Number(edge.from_stop_sequence)}:${Number(edge.to_stop_sequence)}`;
    byVariant.get(variantId).set(key, edge);
  }
  return byVariant;
}

function resolveStopPoint(stopRow, stationById, platformById) {
  const station = stationById.get(stopRow.station_id);
  const platform = stopRow.platform_id ? platformById.get(stopRow.platform_id) : null;
  const lat = platform ? Number(platform.lat) : station ? Number(station.lat) : NaN;
  const lon = platform ? Number(platform.lon) : station ? Number(station.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat,
    lon,
    stationId: station?.id ?? stopRow.station_id,
    platformId: platform?.id ?? null,
  };
}

function isNullableIdMatch(edgeValue, pointValue) {
  if (!edgeValue) return true;
  return String(edgeValue) === String(pointValue ?? "");
}

function isEdgeAlignedWithPoints(edge, fromPoint, toPoint) {
  if (!edge || !fromPoint || !toPoint) return false;
  if (String(edge.from_station_id) !== String(fromPoint.stationId)) return false;
  if (String(edge.to_station_id) !== String(toPoint.stationId)) return false;
  if (!isNullableIdMatch(edge.from_platform_id, fromPoint.platformId)) return false;
  if (!isNullableIdMatch(edge.to_platform_id, toPoint.platformId)) return false;
  return true;
}

function isEdgeDistanceReasonable(distanceM, fromPoint, toPoint) {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return false;
  const directDistanceM = haversineDistanceMeters(
    Number(fromPoint.lat),
    Number(fromPoint.lon),
    Number(toPoint.lat),
    Number(toPoint.lon)
  );
  if (!Number.isFinite(directDistanceM) || directDistanceM <= 0) return true;
  const minDistanceM = Math.max(5, directDistanceM * 0.75);
  const maxDistanceM = Math.max(600, directDistanceM * 8 + 200);
  return distanceM >= minDistanceM && distanceM <= maxDistanceM;
}

function getUsableEdge({
  variantEdges,
  seq,
  fromPoint,
  toPoint,
  requireGeometry = false,
}) {
  const edge = variantEdges?.get(`${seq}:${seq + 1}`);
  if (!edge) return null;
  if (!isEdgeAlignedWithPoints(edge, fromPoint, toPoint)) return null;

  const distanceM = Number(edge.distance_m) || 0;
  const durationS = Number(edge.duration_s) || 0;
  if (distanceM <= 0 || durationS <= 0) return null;
  if (!isEdgeDistanceReasonable(distanceM, fromPoint, toPoint)) return null;

  if (!requireGeometry) {
    return { edge, distanceM, durationS, geometry: null };
  }

  const geometry = parseLineGeoJson(edge.line_geojson);
  if (!geometry) return null;
  return { edge, distanceM, durationS, geometry };
}

function buildFallbackBusEdgeGeometry(fromPoint, toPoint) {
  const distanceM = Math.max(
    haversineDistanceMeters(
      Number(fromPoint.lat),
      Number(fromPoint.lon),
      Number(toPoint.lat),
      Number(toPoint.lon)
    ),
    BUS_FALLBACK_MIN_DISTANCE_M
  );
  const durationS = Math.max(
    Math.round(distanceM / BUS_FALLBACK_SPEED_MPS),
    BUS_FALLBACK_MIN_DURATION_S
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
  };
}

function buildFallbackWalkLeg(fromPoint, toPoint) {
  const distanceM = Math.max(
    haversineDistanceMeters(
      Number(fromPoint.lat),
      Number(fromPoint.lon),
      Number(toPoint.lat),
      Number(toPoint.lon)
    ),
    WALK_FALLBACK_MIN_DISTANCE_M
  );
  const durationS = Math.max(
    Math.round(distanceM / WALKING_SPEED_MPS),
    WALK_FALLBACK_MIN_DURATION_S
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
  };
}

function buildApproxBusMetrics({
  option,
  edgeIndex,
  variantStopSequenceToPoint,
}) {
  const variantEdges = edgeIndex.get(option.variantId);
  const sequenceToPoint = variantStopSequenceToPoint.get(option.variantId);
  if (!sequenceToPoint) return null;

  let distanceM = 0;
  let durationS = 0;
  for (let seq = option.originSeq; seq < option.destinationSeq; seq += 1) {
    const fromPoint = sequenceToPoint.get(seq);
    const toPoint = sequenceToPoint.get(seq + 1);
    if (!fromPoint || !toPoint) {
      return null;
    }

    const usableEdge = getUsableEdge({
      variantEdges,
      seq,
      fromPoint,
      toPoint,
      requireGeometry: false,
    });
    if (usableEdge) {
      distanceM += usableEdge.distanceM;
      durationS += usableEdge.durationS;
      continue;
    }

    const fallbackEdge = buildFallbackBusEdgeGeometry(fromPoint, toPoint);
    distanceM += fallbackEdge.distanceM;
    durationS += fallbackEdge.durationS;
  }

  return {
    distanceM,
    durationS,
  };
}

async function runWithTimeout(timeoutMs, runner) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await runner(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWalkingLegWithCache({
  from,
  to,
  cache,
}) {
  const cacheKey = `${Number(from.lat).toFixed(6)},${Number(from.lon).toFixed(6)}->${Number(
    to.lat
  ).toFixed(6)},${Number(to.lon).toFixed(6)}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  let leg = null;
  try {
    leg = await runWithTimeout(DIRECTIONS_CALL_TIMEOUT_MS, (walkSignal) =>
      fetchDirectionsLeg({
        profile: "walking",
        from: { lat: from.lat, lon: from.lon },
        to: { lat: to.lat, lon: to.lon },
        signal: walkSignal,
      })
    );
  } catch {
    leg = null;
  }

  if (!leg || !Number.isFinite(Number(leg.distanceM)) || !Number.isFinite(Number(leg.durationS))) {
    leg = buildFallbackWalkLeg(from, to);
  }

  cache.set(cacheKey, leg);
  return leg;
}

async function buildBusSegment({
  option,
  edgeIndex,
  variantStopSequenceToPoint,
}) {
  const variantEdges = edgeIndex.get(option.variantId);
  const sequenceToPoint = variantStopSequenceToPoint.get(option.variantId);
  if (!sequenceToPoint) return null;

  let distanceM = 0;
  let durationS = 0;
  const lineStrings = [];

  for (let seq = option.originSeq; seq < option.destinationSeq; seq += 1) {
    const fromPoint = sequenceToPoint.get(seq);
    const toPoint = sequenceToPoint.get(seq + 1);
    if (!fromPoint || !toPoint) return null;

    const usableEdge = getUsableEdge({
      variantEdges,
      seq,
      fromPoint,
      toPoint,
      requireGeometry: true,
    });
    if (usableEdge?.geometry) {
      distanceM += usableEdge.distanceM;
      durationS += usableEdge.durationS;
      lineStrings.push(usableEdge.geometry);
      continue;
    }

    const fallbackEdge = buildFallbackBusEdgeGeometry(fromPoint, toPoint);
    distanceM += fallbackEdge.distanceM;
    durationS += fallbackEdge.durationS;
    lineStrings.push(fallbackEdge.geometry);
  }

  if (distanceM <= 0 || durationS <= 0) return null;
  const geometry = mergeLineStrings(lineStrings);
  if (!geometry) return null;

  return {
    distanceM,
    durationS,
    geometry,
  };
}

function roundNumber(value) {
  return Math.round(Number(value) || 0);
}

function formatPlatform(platform) {
  if (!platform) return null;
  return {
    id: platform.id,
    name: platform.name,
    side: platform.side,
    lat: platform.lat,
    lon: platform.lon,
  };
}

function buildSegment(id, mode, color, payload) {
  return {
    id,
    mode,
    color,
    distanceM: roundNumber(payload.distanceM),
    durationS: roundNumber(payload.durationS),
    geometry: payload.geometry,
  };
}

function buildCandidateOptions({
  originCandidates,
  destinationCandidates,
  variants,
  variantStationIndex,
  edgeIndex,
  variantStopSequenceToPoint,
}) {
  const candidateOptions = [];

  for (const originStation of originCandidates) {
    for (const destinationStation of destinationCandidates) {
      if (originStation.id === destinationStation.id) continue;

      for (const variant of variants) {
        const variantStations = variantStationIndex.get(variant.id);
        if (!variantStations) continue;

        const originSequences = variantStations.stationSequences.get(originStation.id);
        const destinationSequences = variantStations.stationSequences.get(destinationStation.id);
        if (!originSequences || !destinationSequences) continue;

        for (const originSeq of originSequences) {
          for (const destinationSeq of destinationSequences) {
            if (originSeq >= destinationSeq) continue;

            const approxBusMetrics = buildApproxBusMetrics({
              option: {
                variantId: variant.id,
                originSeq,
                destinationSeq,
              },
              edgeIndex,
              variantStopSequenceToPoint,
            });
            if (!approxBusMetrics) continue;

            const approxWalkDurationS =
              (Number(originStation.distanceM) + Number(destinationStation.distanceM)) /
              WALKING_SPEED_MPS;
            const approxWalkDistanceM =
              (Number(originStation.distanceM) || 0) +
              (Number(destinationStation.distanceM) || 0);
            const approxScoreS =
              approxWalkDurationS + approxBusMetrics.durationS + WAIT_PENALTY_S;

            candidateOptions.push({
              variantId: variant.id,
              routeId: variant.route_id,
              direction: variant.direction,
              originStation,
              destinationStation,
              originSeq,
              destinationSeq,
              approxWalkDistanceM,
              approxBusDurationS: approxBusMetrics.durationS,
              approxScoreS,
            });
          }
        }
      }
    }
  }

  return candidateOptions;
}

function findCandidatesByNearestStopExpansion({
  originCandidates,
  destinationCandidates,
  variants,
  variantStationIndex,
  edgeIndex,
  variantStopSequenceToPoint,
}) {
  const maxDepth = Math.max(originCandidates.length, destinationCandidates.length);

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const originPool = originCandidates.slice(0, Math.min(depth, originCandidates.length));
    const destinationPool = destinationCandidates.slice(
      0,
      Math.min(depth, destinationCandidates.length)
    );
    if (originPool.length === 0 || destinationPool.length === 0) continue;

    const candidateOptions = buildCandidateOptions({
      originCandidates: originPool,
      destinationCandidates: destinationPool,
      variants,
      variantStationIndex,
      edgeIndex,
      variantStopSequenceToPoint,
    });
    if (candidateOptions.length > 0) {
      return candidateOptions;
    }
  }

  return [];
}

function buildEvaluationShortlist(candidateOptions) {
  if (candidateOptions.length <= MAX_EXACT_WALK_EVALUATIONS) {
    return candidateOptions;
  }

  const byApproxScore = candidateOptions
    .slice()
    .sort((a, b) => a.approxScoreS - b.approxScoreS)
    .slice(0, MAX_EXACT_WALK_EVALUATIONS);

  const nearestByVariantAndOrigin = new Map();
  for (const option of candidateOptions) {
    const key = `${option.routeId}:${option.variantId}:${option.originSeq}`;
    const current = nearestByVariantAndOrigin.get(key);
    const optionDestDistance = Number(option.destinationStation.distanceM) || Number.POSITIVE_INFINITY;
    const currentDestDistance = current
      ? Number(current.destinationStation.distanceM) || Number.POSITIVE_INFINITY
      : Number.POSITIVE_INFINITY;

    if (!current || optionDestDistance < currentDestDistance) {
      nearestByVariantAndOrigin.set(key, option);
    }
  }

  const merged = new Map();
  for (const option of byApproxScore) {
    const key = `${option.variantId}:${option.originSeq}:${option.destinationSeq}`;
    merged.set(key, option);
  }
  for (const option of nearestByVariantAndOrigin.values()) {
    const key = `${option.variantId}:${option.originSeq}:${option.destinationSeq}`;
    merged.set(key, option);
  }

  return Array.from(merged.values())
    .sort((a, b) => a.approxScoreS - b.approxScoreS)
    .slice(0, MAX_SHORTLIST_SIZE);
}

function buildFastCandidateRanking({
  shortlist,
  edgeIndex,
  variantStopSequenceToPoint,
  fromLat,
  fromLon,
  toLat,
  toLon,
}) {
  const ranked = [];

  for (const option of shortlist) {
    const sequenceToPoint = variantStopSequenceToPoint.get(option.variantId);
    const boardingPoint = sequenceToPoint?.get(option.originSeq);
    const alightingPoint = sequenceToPoint?.get(option.destinationSeq);
    if (!boardingPoint || !alightingPoint) continue;

    const approxBusMetrics = buildApproxBusMetrics({
      option: {
        variantId: option.variantId,
        originSeq: option.originSeq,
        destinationSeq: option.destinationSeq,
      },
      edgeIndex,
      variantStopSequenceToPoint,
    });
    if (!approxBusMetrics) continue;

    const walkToBoardingApprox = buildFallbackWalkLeg(
      { lat: fromLat, lon: fromLon },
      { lat: boardingPoint.lat, lon: boardingPoint.lon }
    );
    const walkToDestinationApprox = buildFallbackWalkLeg(
      { lat: alightingPoint.lat, lon: alightingPoint.lon },
      { lat: toLat, lon: toLon }
    );

    const approxTotalDurationS =
      walkToBoardingApprox.durationS +
      approxBusMetrics.durationS +
      walkToDestinationApprox.durationS +
      WAIT_PENALTY_S;
    const approxTotalWalkDistanceM =
      Number(walkToBoardingApprox.distanceM || 0) +
      Number(walkToDestinationApprox.distanceM || 0);

    ranked.push({
      option,
      boardingPoint,
      alightingPoint,
      approxTotalWalkDistanceM,
      approxTotalDurationS,
      approxFinalWalkDurationS: walkToDestinationApprox.durationS,
      approxWalkDistanceM: walkToBoardingApprox.distanceM + walkToDestinationApprox.distanceM,
    });
  }

  ranked.sort((a, b) => {
    if (a.approxTotalDurationS !== b.approxTotalDurationS) {
      return a.approxTotalDurationS - b.approxTotalDurationS;
    }
    if (a.approxFinalWalkDurationS !== b.approxFinalWalkDurationS) {
      return a.approxFinalWalkDurationS - b.approxFinalWalkDurationS;
    }
    return a.approxTotalWalkDistanceM - b.approxTotalWalkDistanceM;
  });

  return ranked;
}

export async function planSingleBusTrip({ fromLat, fromLon, toLat, toLon }) {
  const [initialOriginCandidates, initialDestinationCandidates, variants] = await Promise.all([
    getNearbyStations({
      lat: fromLat,
      lon: fromLon,
      radiusM: NEARBY_RADIUS_M,
      limit: ORIGIN_NEARBY_LIMIT,
    }),
    getNearbyStations({
      lat: toLat,
      lon: toLon,
      radiusM: NEARBY_RADIUS_M,
      limit: DEST_NEARBY_LIMIT,
    }),
    getAllRouteVariants(),
  ]);

  let originCandidates = initialOriginCandidates;
  let destinationCandidates = initialDestinationCandidates;

  if (originCandidates.length === 0 || destinationCandidates.length === 0) {
    const [expandedOriginCandidates, expandedDestinationCandidates] = await Promise.all([
      getNearbyStations({
        lat: fromLat,
        lon: fromLon,
        radiusM: EXPANDED_NEARBY_RADIUS_M,
        limit: EXPANDED_ORIGIN_NEARBY_LIMIT,
      }),
      getNearbyStations({
        lat: toLat,
        lon: toLon,
        radiusM: EXPANDED_NEARBY_RADIUS_M,
        limit: EXPANDED_DEST_NEARBY_LIMIT,
      }),
    ]);
    originCandidates = originCandidates.length > 0 ? originCandidates : expandedOriginCandidates;
    destinationCandidates =
      destinationCandidates.length > 0 ? destinationCandidates : expandedDestinationCandidates;
  }

  if (originCandidates.length === 0 || destinationCandidates.length === 0) {
    return buildNoRouteResponse(
      "NO_NEARBY_STOPS",
      "No nearby boarding or destination bus stops were found."
    );
  }
  if (variants.length === 0) {
    return buildNoRouteResponse("NO_ROUTE_DATA", "Route variant data is missing.");
  }

  const variantIdList = variants.map((variant) => variant.id);
  const [variantStops, edges, routes] = await Promise.all([
    getRouteVariantStopsByVariantIds(variantIdList),
    getRouteEdgesByVariantIds(variantIdList),
    getRoutesByIds(variants.map((variant) => variant.route_id)),
  ]);

  if (variantStops.length === 0) {
    return buildNoRouteResponse(
      "NO_EDGES",
      "Route stop data has not been loaded yet."
    );
  }

  const routeById = new Map(routes.map((route) => [route.id, route]));
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const variantStationIndex = buildVariantStationIndex(variantStops);
  const edgeIndex = buildEdgeIndex(edges);
  const allStationIds = Array.from(new Set(variantStops.map((row) => row.station_id)));
  const allStations = await getStationsByIds(allStationIds);
  const stationById = new Map(allStations.map((station) => [station.id, station]));
  const platformIds = Array.from(
    new Set(variantStops.map((row) => row.platform_id).filter(Boolean))
  );
  const allPlatforms = await getPlatformsByIds(platformIds);
  const platformById = new Map(allPlatforms.map((platform) => [platform.id, platform]));
  const variantStopSequenceToPoint = new Map();
  for (const row of variantStops) {
    if (!variantStopSequenceToPoint.has(row.variant_id)) {
      variantStopSequenceToPoint.set(row.variant_id, new Map());
    }
    const point = resolveStopPoint(row, stationById, platformById);
    if (!point) continue;
    variantStopSequenceToPoint
      .get(row.variant_id)
      .set(Number(row.stop_sequence), point);
  }

  let candidateOptions = findCandidatesByNearestStopExpansion({
    originCandidates,
    destinationCandidates,
    variants,
    variantStationIndex,
    edgeIndex,
    variantStopSequenceToPoint,
  });

  if (candidateOptions.length === 0) {
    const [expandedOriginCandidates, expandedDestinationCandidates] = await Promise.all([
      getNearbyStations({
        lat: fromLat,
        lon: fromLon,
        radiusM: EXPANDED_NEARBY_RADIUS_M,
        limit: EXPANDED_ORIGIN_NEARBY_LIMIT,
      }),
      getNearbyStations({
        lat: toLat,
        lon: toLon,
        radiusM: EXPANDED_NEARBY_RADIUS_M,
        limit: EXPANDED_DEST_NEARBY_LIMIT,
      }),
    ]);

    candidateOptions = findCandidatesByNearestStopExpansion({
      originCandidates: expandedOriginCandidates,
      destinationCandidates: expandedDestinationCandidates,
      variants,
      variantStationIndex,
      edgeIndex,
      variantStopSequenceToPoint,
    });
  }

  if (candidateOptions.length === 0) {
    return buildNoRouteResponse(
      "NO_DIRECT_ROUTE",
      "No direct single-bus route was found for this trip."
    );
  }

  const shortlist = buildEvaluationShortlist(candidateOptions);
  const rankedCandidates = buildFastCandidateRanking({
    shortlist,
    edgeIndex,
    variantStopSequenceToPoint,
    fromLat,
    fromLon,
    toLat,
    toLon,
  }).slice(0, MAX_FINAL_CANDIDATE_EVALUATIONS);
  if (rankedCandidates.length === 0) {
    return buildNoRouteResponse(
      "NO_DIRECT_ROUTE",
      "No direct single-bus route was found for this trip."
    );
  }
  const walkingLegCache = new Map();

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestFinalWalkDistanceM = Number.POSITIVE_INFINITY;

  for (const ranked of rankedCandidates) {
    try {
      const option = ranked.option;
      const busSegment = await buildBusSegment({
        option: {
          variantId: option.variantId,
          originSeq: option.originSeq,
          destinationSeq: option.destinationSeq,
        },
        edgeIndex,
        variantStopSequenceToPoint,
      });
      if (!busSegment) continue;

      const [walkToBoarding, walkToDestination] = await Promise.all([
        fetchWalkingLegWithCache({
          from: { lat: fromLat, lon: fromLon },
          to: { lat: ranked.boardingPoint.lat, lon: ranked.boardingPoint.lon },
          cache: walkingLegCache,
        }),
        fetchWalkingLegWithCache({
          from: { lat: ranked.alightingPoint.lat, lon: ranked.alightingPoint.lon },
          to: { lat: toLat, lon: toLon },
          cache: walkingLegCache,
        }),
      ]);

      const totalDurationS =
        walkToBoarding.durationS +
        busSegment.durationS +
        walkToDestination.durationS +
        WAIT_PENALTY_S;

      const finalWalkDistanceM =
        Number(walkToDestination.distanceM) || Number.POSITIVE_INFINITY;
      const isSameRouteAndBoarding =
        best &&
        best.option.routeId === option.routeId &&
        best.option.variantId === option.variantId &&
        best.option.originSeq === option.originSeq;

      let shouldReplace = false;
      if (!best) {
        shouldReplace = true;
      } else if (isSameRouteAndBoarding) {
        // Within the same chosen service, prefer alighting that minimizes final walk.
        if (finalWalkDistanceM + 1 < bestFinalWalkDistanceM) {
          shouldReplace = true;
        } else if (
          Math.abs(finalWalkDistanceM - bestFinalWalkDistanceM) <= 1 &&
          totalDurationS < bestScore
        ) {
          shouldReplace = true;
        }
      } else if (totalDurationS + 1 < bestScore) {
        shouldReplace = true;
      } else if (
        Math.abs(totalDurationS - bestScore) <= 120 &&
        finalWalkDistanceM + 5 < bestFinalWalkDistanceM
      ) {
        // If ETA is close, prefer less final walking.
        shouldReplace = true;
      }

      if (shouldReplace) {
        bestScore = totalDurationS;
        bestFinalWalkDistanceM = finalWalkDistanceM;
        best = {
          option,
          busSegment,
          walkToBoarding,
          walkToDestination,
          totalDurationS,
        };
      }
    } catch {
      // Ignore individual candidate failures and try the next one.
    }
  }

  if (!best) {
    throw new HttpError(
      502,
      "Unable to evaluate walking segments from MapTiler for candidate trips."
    );
  }

  const route = routeById.get(best.option.routeId);
  const variant = variantById.get(best.option.variantId);

  const platforms = await getPlatformsByStationIds([
    best.option.originStation.id,
    best.option.destinationStation.id,
  ]);
  const platformsByStation = new Map();
  for (const platform of platforms) {
    if (!platformsByStation.has(platform.station_id)) {
      platformsByStation.set(platform.station_id, []);
    }
    platformsByStation.get(platform.station_id).push(platform);
  }

  const boardingTarget = getLastCoordinate(best.walkToBoarding.geometry, {
    lon: best.option.originStation.lon,
    lat: best.option.originStation.lat,
  });
  const alightingTarget = getFirstCoordinate(best.walkToDestination.geometry, {
    lon: best.option.destinationStation.lon,
    lat: best.option.destinationStation.lat,
  });

  const boardingPlatform = pickNearestPlatform(
    platformsByStation.get(best.option.originStation.id) ?? [],
    boardingTarget.lat,
    boardingTarget.lon
  );
  const alightingPlatform = pickNearestPlatform(
    platformsByStation.get(best.option.destinationStation.id) ?? [],
    alightingTarget.lat,
    alightingTarget.lon
  );
  const bestSequencePoints = variantStopSequenceToPoint.get(best.option.variantId);
  const mappedBoardingPlatformId = bestSequencePoints?.get(best.option.originSeq)?.platformId ?? null;
  const mappedAlightingPlatformId =
    bestSequencePoints?.get(best.option.destinationSeq)?.platformId ?? null;
  const mappedBoardingPlatform = mappedBoardingPlatformId
    ? platformById.get(mappedBoardingPlatformId)
    : null;
  const mappedAlightingPlatform = mappedAlightingPlatformId
    ? platformById.get(mappedAlightingPlatformId)
    : null;

  const walkToBoardingSegment = buildSegment("walk_to_boarding", "walk", "#2D7FF9", {
    distanceM: best.walkToBoarding.distanceM,
    durationS: best.walkToBoarding.durationS,
    geometry: best.walkToBoarding.geometry,
  });
  const busSegment = buildSegment("bus_ride", "bus", "#1FAE66", {
    distanceM: best.busSegment.distanceM,
    durationS: best.busSegment.durationS,
    geometry: best.busSegment.geometry,
  });
  const walkToDestinationSegment = buildSegment("walk_to_destination", "walk", "#2D7FF9", {
    distanceM: best.walkToDestination.distanceM,
    durationS: best.walkToDestination.durationS,
    geometry: best.walkToDestination.geometry,
  });

  const totalDistanceM =
    walkToBoardingSegment.distanceM + busSegment.distanceM + walkToDestinationSegment.distanceM;

  return {
    status: "ok",
    itinerary: {
      route: {
        id: route?.id ?? best.option.routeId,
        name: route?.name ?? "Bus Route",
      },
      variant: {
        id: variant?.id ?? best.option.variantId,
        direction: variant?.direction ?? best.option.direction,
      },
      boardingStation: {
        id: best.option.originStation.id,
        name: best.option.originStation.name,
        lat: best.option.originStation.lat,
        lon: best.option.originStation.lon,
      },
      boardingPlatform: formatPlatform(mappedBoardingPlatform ?? boardingPlatform),
      alightingStation: {
        id: best.option.destinationStation.id,
        name: best.option.destinationStation.name,
        lat: best.option.destinationStation.lat,
        lon: best.option.destinationStation.lon,
      },
      alightingPlatform: formatPlatform(mappedAlightingPlatform ?? alightingPlatform),
      segments: [walkToBoardingSegment, busSegment, walkToDestinationSegment],
      totals: {
        totalDistanceM: roundNumber(totalDistanceM),
        totalDurationS: roundNumber(best.totalDurationS),
      },
    },
  };
}
