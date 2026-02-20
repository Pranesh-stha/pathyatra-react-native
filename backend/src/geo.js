const EARTH_RADIUS_M = 6371000;

const toRad = (value) => (value * Math.PI) / 180;

export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const radLat1 = toRad(lat1);
  const radLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(radLat1) * Math.cos(radLat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

function isValidCoordinate(pair) {
  return (
    Array.isArray(pair) &&
    pair.length === 2 &&
    Number.isFinite(Number(pair[0])) &&
    Number.isFinite(Number(pair[1]))
  );
}

export function normalizeLineStringGeometry(geometry) {
  if (!geometry || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
    return null;
  }
  const coordinates = geometry.coordinates
    .filter(isValidCoordinate)
    .map((pair) => [Number(pair[0]), Number(pair[1])]);
  if (coordinates.length < 2) return null;
  return {
    type: "LineString",
    coordinates,
  };
}

export function mergeLineStrings(lineStrings) {
  const merged = [];
  for (const line of lineStrings) {
    const normalized = normalizeLineStringGeometry(line);
    if (!normalized) continue;
    if (merged.length === 0) {
      merged.push(...normalized.coordinates);
      continue;
    }
    const [nextLng, nextLat] = normalized.coordinates[0];
    const [lastLng, lastLat] = merged[merged.length - 1];
    const isDuplicateStart =
      Math.abs(lastLng - nextLng) < 1e-10 && Math.abs(lastLat - nextLat) < 1e-10;
    if (isDuplicateStart) {
      merged.push(...normalized.coordinates.slice(1));
    } else {
      merged.push(...normalized.coordinates);
    }
  }

  if (merged.length < 2) return null;
  return {
    type: "LineString",
    coordinates: merged,
  };
}

export function getFirstCoordinate(geometry, fallback) {
  const normalized = normalizeLineStringGeometry(geometry);
  if (!normalized) return fallback;
  const [lon, lat] = normalized.coordinates[0];
  return { lon, lat };
}

export function getLastCoordinate(geometry, fallback) {
  const normalized = normalizeLineStringGeometry(geometry);
  if (!normalized) return fallback;
  const [lon, lat] = normalized.coordinates[normalized.coordinates.length - 1];
  return { lon, lat };
}

export function pickNearestPlatform(platforms, targetLat, targetLon) {
  if (!Array.isArray(platforms) || platforms.length === 0) return null;
  let winner = null;
  let winnerDistance = Number.POSITIVE_INFINITY;

  for (const platform of platforms) {
    const distance = haversineDistanceMeters(
      Number(platform.lat),
      Number(platform.lon),
      targetLat,
      targetLon
    );
    if (distance < winnerDistance) {
      winner = platform;
      winnerDistance = distance;
    }
  }
  return winner;
}

