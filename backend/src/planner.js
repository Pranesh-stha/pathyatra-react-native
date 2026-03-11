import { config } from "./config.js";
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

function normalizeRouteIdList(routeIds) {
  if (!Array.isArray(routeIds)) return [];
  const seen = new Set();
  const normalized = [];
  for (const routeId of routeIds) {
    const value = String(routeId || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

function buildRoutePriorityConfig({
  preferredRouteIds,
  preferredRouteBonusS,
  preferredRouteOrderStepS,
} = {}) {
  const routeIds =
    Array.isArray(preferredRouteIds) && preferredRouteIds.length > 0
      ? preferredRouteIds
      : config.preferredRouteIds;
  const normalizedRouteIds = normalizeRouteIdList(routeIds);
  const routeIdSet = new Set(normalizedRouteIds);
  const rankByRouteId = new Map(normalizedRouteIds.map((routeId, index) => [routeId, index]));
  const parsedBonus = Number(preferredRouteBonusS);
  const bonusS = Number.isFinite(parsedBonus)
    ? Math.max(0, parsedBonus)
    : Number(config.preferredRouteBonusS) || 0;
  const parsedOrderStep = Number(preferredRouteOrderStepS);
  const orderStepS = Number.isFinite(parsedOrderStep)
    ? Math.max(0, parsedOrderStep)
    : Number(config.preferredRouteOrderStepS) || 0;

  return {
    routeIdSet,
    orderedRouteIds: normalizedRouteIds,
    rankByRouteId,
    bonusS,
    orderStepS,
  };
}

function getRoutePriorityBonusS(routeId, routePriority) {
  if (!routePriority) return 0;
  if (routePriority.bonusS <= 0 && routePriority.orderStepS <= 0) return 0;
  const normalizedRouteId = String(routeId);
  if (!routePriority.routeIdSet.has(normalizedRouteId)) return 0;

  const totalPreferred = routePriority.rankByRouteId.size;
  const rank = routePriority.rankByRouteId.get(normalizedRouteId) ?? totalPreferred - 1;
  const positionalBonusS = Math.max(0, (totalPreferred - 1 - rank) * routePriority.orderStepS);
  return routePriority.bonusS + positionalBonusS;
}

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

function buildVariantSequenceOrder(variantStops) {
  const sequencesByVariant = new Map();
  for (const row of variantStops) {
    const variantId = row.variant_id;
    if (!sequencesByVariant.has(variantId)) {
      sequencesByVariant.set(variantId, new Set());
    }
    sequencesByVariant.get(variantId).add(Number(row.stop_sequence));
  }

  const ordered = new Map();
  for (const [variantId, seqSet] of sequencesByVariant.entries()) {
    const values = Array.from(seqSet.values())
      .filter((seq) => Number.isFinite(seq))
      .sort((a, b) => a - b);
    if (values.length >= 2) {
      ordered.set(variantId, values);
    }
  }
  return ordered;
}

function buildLegSequencePairs(option, variantSequenceOrder) {
  const sequenceOrder = variantSequenceOrder.get(option.variantId);
  if (!sequenceOrder || sequenceOrder.length < 2) return null;

  const indexBySeq = new Map(sequenceOrder.map((seq, index) => [seq, index]));
  const originIndex = indexBySeq.get(Number(option.originSeq));
  const destinationIndex = indexBySeq.get(Number(option.destinationSeq));
  if (!Number.isInteger(originIndex) || !Number.isInteger(destinationIndex)) return null;
  if (originIndex === destinationIndex) return null;
  if (!option.wrapAround && originIndex >= destinationIndex) return null;

  const pairs = [];
  let currentIndex = originIndex;
  let guard = 0;
  while (currentIndex !== destinationIndex) {
    const nextIndex = (currentIndex + 1) % sequenceOrder.length;
    if (!option.wrapAround && nextIndex <= currentIndex) {
      return null;
    }
    const fromSeq = sequenceOrder[currentIndex];
    const toSeq = sequenceOrder[nextIndex];
    pairs.push({ fromSeq, toSeq });
    currentIndex = nextIndex;
    guard += 1;
    if (guard > sequenceOrder.length + 1) return null;
  }

  return pairs.length > 0 ? pairs : null;
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
  nextSeq,
  fromPoint,
  toPoint,
  requireGeometry = false,
}) {
  const resolvedNextSeq =
    Number.isFinite(Number(nextSeq)) ? Number(nextSeq) : Number(seq) + 1;
  const edge = variantEdges?.get(`${Number(seq)}:${resolvedNextSeq}`);
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
  variantSequenceOrder,
}) {
  const variantEdges = edgeIndex.get(option.variantId);
  const sequenceToPoint = variantStopSequenceToPoint.get(option.variantId);
  if (!sequenceToPoint) return null;
  const legPairs = buildLegSequencePairs(option, variantSequenceOrder);
  if (!legPairs) return null;

  let distanceM = 0;
  let durationS = 0;
  for (const legPair of legPairs) {
    const fromPoint = sequenceToPoint.get(legPair.fromSeq);
    const toPoint = sequenceToPoint.get(legPair.toSeq);
    if (!fromPoint || !toPoint) {
      return null;
    }

    const usableEdge = getUsableEdge({
      variantEdges,
      seq: legPair.fromSeq,
      nextSeq: legPair.toSeq,
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
  variantSequenceOrder,
}) {
  const variantEdges = edgeIndex.get(option.variantId);
  const sequenceToPoint = variantStopSequenceToPoint.get(option.variantId);
  if (!sequenceToPoint) return null;
  const legPairs = buildLegSequencePairs(option, variantSequenceOrder);
  if (!legPairs) return null;

  let distanceM = 0;
  let durationS = 0;
  const lineStrings = [];

  for (const legPair of legPairs) {
    const fromPoint = sequenceToPoint.get(legPair.fromSeq);
    const toPoint = sequenceToPoint.get(legPair.toSeq);
    if (!fromPoint || !toPoint) return null;

    const usableEdge = getUsableEdge({
      variantEdges,
      seq: legPair.fromSeq,
      nextSeq: legPair.toSeq,
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
  variantSequenceOrder,
  routeIsLoopById,
  routePriority,
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
            const isLoopRoute = Boolean(routeIsLoopById.get(variant.route_id));
            const traversalModes =
              originSeq < destinationSeq
                ? [false]
                : isLoopRoute && originSeq !== destinationSeq
                  ? [true]
                  : [];

            for (const wrapAround of traversalModes) {
              const approxBusMetrics = buildApproxBusMetrics({
                option: {
                  variantId: variant.id,
                  originSeq,
                  destinationSeq,
                  wrapAround,
                },
                edgeIndex,
                variantStopSequenceToPoint,
                variantSequenceOrder,
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
              const priorityBonusS = getRoutePriorityBonusS(variant.route_id, routePriority);

              candidateOptions.push({
                variantId: variant.id,
                routeId: variant.route_id,
                direction: variant.direction,
                originStation,
                destinationStation,
                originSeq,
                destinationSeq,
                wrapAround,
                approxWalkDistanceM,
                approxBusDurationS: approxBusMetrics.durationS,
                approxScoreS,
                priorityBonusS,
                priorityAdjustedApproxScoreS: approxScoreS - priorityBonusS,
              });
            }
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
  variantSequenceOrder,
  routeIsLoopById,
  routePriority,
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
      variantSequenceOrder,
      routeIsLoopById,
      routePriority,
    });
    if (candidateOptions.length > 0) {
      return candidateOptions;
    }
  }

  return [];
}

function buildEvaluationShortlist(candidateOptions) {
  const getApproxSortScore = (option) =>
    Number.isFinite(Number(option.priorityAdjustedApproxScoreS))
      ? Number(option.priorityAdjustedApproxScoreS)
      : Number(option.approxScoreS) || Number.POSITIVE_INFINITY;

  if (candidateOptions.length <= MAX_EXACT_WALK_EVALUATIONS) {
    return candidateOptions;
  }

  const byApproxScore = candidateOptions
    .slice()
    .sort((a, b) => getApproxSortScore(a) - getApproxSortScore(b))
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
    const key = `${option.variantId}:${option.originSeq}:${option.destinationSeq}:${Number(
      option.wrapAround ? 1 : 0
    )}`;
    merged.set(key, option);
  }
  for (const option of nearestByVariantAndOrigin.values()) {
    const key = `${option.variantId}:${option.originSeq}:${option.destinationSeq}:${Number(
      option.wrapAround ? 1 : 0
    )}`;
    merged.set(key, option);
  }

  return Array.from(merged.values())
    .sort((a, b) => getApproxSortScore(a) - getApproxSortScore(b))
    .slice(0, MAX_SHORTLIST_SIZE);
}

function buildFastCandidateRanking({
  shortlist,
  edgeIndex,
  variantStopSequenceToPoint,
  variantSequenceOrder,
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
        wrapAround: Boolean(option.wrapAround),
      },
      edgeIndex,
      variantStopSequenceToPoint,
      variantSequenceOrder,
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
      adjustedApproxTotalScoreS:
        approxTotalDurationS - (Number(option.priorityBonusS) || 0),
      approxFinalWalkDurationS: walkToDestinationApprox.durationS,
      approxWalkDistanceM: walkToBoardingApprox.distanceM + walkToDestinationApprox.distanceM,
    });
  }

  ranked.sort((a, b) => {
    if (a.adjustedApproxTotalScoreS !== b.adjustedApproxTotalScoreS) {
      return a.adjustedApproxTotalScoreS - b.adjustedApproxTotalScoreS;
    }
    if (a.approxFinalWalkDurationS !== b.approxFinalWalkDurationS) {
      return a.approxFinalWalkDurationS - b.approxFinalWalkDurationS;
    }
    return a.approxTotalWalkDistanceM - b.approxTotalWalkDistanceM;
  });

  return ranked;
}

function buildVariantSearchOrder(variants, routePriority) {
  const preferredRouteIds = routePriority?.routeIdSet;
  if (!preferredRouteIds || preferredRouteIds.size === 0) {
    return [variants];
  }

  const orderedRouteIds = Array.isArray(routePriority?.orderedRouteIds)
    ? routePriority.orderedRouteIds
    : [];
  const variantsByRouteId = new Map();
  for (const variant of variants) {
    const routeId = String(variant.route_id);
    if (!preferredRouteIds.has(routeId)) continue;
    if (!variantsByRouteId.has(routeId)) {
      variantsByRouteId.set(routeId, []);
    }
    variantsByRouteId.get(routeId).push(variant);
  }

  const preferredVariantPools = [];
  for (const routeId of orderedRouteIds) {
    const pool = variantsByRouteId.get(routeId) ?? [];
    if (pool.length === 0) continue;
    preferredVariantPools.push(
      pool.slice().sort((left, right) => String(left.id).localeCompare(String(right.id)))
    );
  }

  if (preferredVariantPools.length === 0) {
    return [variants];
  }

  const hasNonPreferred = variants.some(
    (variant) => !preferredRouteIds.has(String(variant.route_id))
  );

  if (!hasNonPreferred) {
    return preferredVariantPools;
  }

  // Fallback to all routes only if no preferred route can serve the trip.
  return [...preferredVariantPools, variants];
}

export async function planSingleBusTrip({
  fromLat,
  fromLon,
  toLat,
  toLon,
  preferredRouteIds,
  preferredRouteBonusS,
}) {
  const routePriority = buildRoutePriorityConfig({
    preferredRouteIds,
    preferredRouteBonusS,
  });
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
  const routeIsLoopById = new Map(routes.map((route) => [route.id, Boolean(route.is_loop)]));
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const variantStationIndex = buildVariantStationIndex(variantStops);
  const variantSequenceOrder = buildVariantSequenceOrder(variantStops);
  const edgeIndex = buildEdgeIndex(edges);
  const variantSearchOrder = buildVariantSearchOrder(variants, routePriority);
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

  let candidateOptions = [];
  for (const variantPool of variantSearchOrder) {
    candidateOptions = findCandidatesByNearestStopExpansion({
      originCandidates,
      destinationCandidates,
      variants: variantPool,
      variantStationIndex,
      edgeIndex,
      variantStopSequenceToPoint,
      variantSequenceOrder,
      routeIsLoopById,
      routePriority,
    });
    if (candidateOptions.length > 0) break;
  }

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

    for (const variantPool of variantSearchOrder) {
      candidateOptions = findCandidatesByNearestStopExpansion({
        originCandidates: expandedOriginCandidates,
        destinationCandidates: expandedDestinationCandidates,
        variants: variantPool,
        variantStationIndex,
        edgeIndex,
        variantStopSequenceToPoint,
        variantSequenceOrder,
        routeIsLoopById,
        routePriority,
      });
      if (candidateOptions.length > 0) break;
    }
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
    variantSequenceOrder,
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
  let bestAdjustedScore = Number.POSITIVE_INFINITY;
  let bestFinalWalkDistanceM = Number.POSITIVE_INFINITY;

  for (const ranked of rankedCandidates) {
    try {
      const option = ranked.option;
      const busSegment = await buildBusSegment({
        option: {
          variantId: option.variantId,
          originSeq: option.originSeq,
          destinationSeq: option.destinationSeq,
          wrapAround: Boolean(option.wrapAround),
        },
        edgeIndex,
        variantStopSequenceToPoint,
        variantSequenceOrder,
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
      const adjustedTotalScoreS =
        totalDurationS - (Number(option.priorityBonusS) || 0);

      const finalWalkDistanceM =
        Number(walkToDestination.distanceM) || Number.POSITIVE_INFINITY;
      const isSameRouteAndBoarding =
        best &&
        best.option.routeId === option.routeId &&
        best.option.variantId === option.variantId &&
        best.option.originSeq === option.originSeq &&
        Boolean(best.option.wrapAround) === Boolean(option.wrapAround);

      let shouldReplace = false;
      if (!best) {
        shouldReplace = true;
      } else if (isSameRouteAndBoarding) {
        // Within the same chosen service, prefer alighting that minimizes final walk.
        if (finalWalkDistanceM + 1 < bestFinalWalkDistanceM) {
          shouldReplace = true;
        } else if (
          Math.abs(finalWalkDistanceM - bestFinalWalkDistanceM) <= 1 &&
          adjustedTotalScoreS < bestAdjustedScore
        ) {
          shouldReplace = true;
        }
      } else if (adjustedTotalScoreS + 1 < bestAdjustedScore) {
        shouldReplace = true;
      } else if (
        Math.abs(adjustedTotalScoreS - bestAdjustedScore) <= 120 &&
        finalWalkDistanceM + 5 < bestFinalWalkDistanceM
      ) {
        // If ETA is close, prefer less final walking.
        shouldReplace = true;
      }

      if (shouldReplace) {
        bestAdjustedScore = adjustedTotalScoreS;
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
