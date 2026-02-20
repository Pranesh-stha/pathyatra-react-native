import { config } from "./config.js";
import { HttpError } from "./errors.js";
import { normalizeLineStringGeometry } from "./geo.js";

const sanitizeBaseUrl = (value) => value.replace(/\/+$/, "");

function normalizeProfile(profile) {
  return profile === "driving" ? "driving" : "walking";
}

function normalizePoints(points) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new HttpError(400, "Directions points must contain at least 2 coordinates.");
  }
  return points
    .map((point) => ({
      lon: Number(point.lon),
      lat: Number(point.lat),
    }))
    .filter((point) => Number.isFinite(point.lon) && Number.isFinite(point.lat));
}

function buildCoordinates(points) {
  return points.map((point) => `${point.lon},${point.lat}`).join(";");
}

function buildCandidateUrls(baseUrl, profileName, coordinates, key) {
  const encodedKey = encodeURIComponent(key);
  const query = `key=${encodedKey}&overview=full&geometries=geojson&alternatives=false&steps=false`;
  const candidates = [
    `${baseUrl}/${profileName}/${coordinates}.json?${query}`,
    `${baseUrl}/${profileName}/${coordinates}?${query}`,
  ];

  // Some MapTiler setups expose routing under /routes/ instead of /directions/.
  if (baseUrl.includes("/directions/")) {
    const altBase = baseUrl.replace("/directions/", "/routes/");
    candidates.push(`${altBase}/${profileName}/${coordinates}.json?${query}`);
    candidates.push(`${altBase}/${profileName}/${coordinates}?${query}`);
  }

  return Array.from(new Set(candidates));
}

function parseMapTilerRoute(data) {
  if (Array.isArray(data?.routes) && data.routes.length > 0) {
    const route = data.routes[0];
    const geometry = normalizeLineStringGeometry(route?.geometry);
    if (!geometry) {
      throw new HttpError(502, "MapTiler route geometry is missing or invalid.");
    }
    return {
      distanceM: Number(route.distance) || 0,
      durationS: Number(route.duration) || 0,
      geometry,
      source: "maptiler",
    };
  }

  if (Array.isArray(data?.features) && data.features.length > 0) {
    const feature = data.features[0];
    const geometry = normalizeLineStringGeometry(feature?.geometry);
    if (!geometry) {
      throw new HttpError(502, "MapTiler feature geometry is missing or invalid.");
    }
    const props = feature?.properties ?? {};
    return {
      distanceM:
        Number(props.distance) || Number(props.length) || Number(props.distance_m) || 0,
      durationS:
        Number(props.duration) || Number(props.time) || Number(props.duration_s) || 0,
      geometry,
      source: "maptiler",
    };
  }

  throw new HttpError(502, "MapTiler returned no route result.");
}

function parseOsrmRoute(data) {
  if (!Array.isArray(data?.routes) || data.routes.length === 0) {
    throw new HttpError(502, "OSRM returned no route result.");
  }
  const route = data.routes[0];
  const geometry = normalizeLineStringGeometry(route?.geometry);
  if (!geometry) {
    throw new HttpError(502, "OSRM route geometry is missing or invalid.");
  }
  return {
    distanceM: Number(route.distance) || 0,
    durationS: Number(route.duration) || 0,
    geometry,
    source: "osrm",
  };
}

async function fetchOsrmPath({ profile, points, signal }) {
  const baseUrl = sanitizeBaseUrl(config.osrmBaseUrl);
  const osrmProfile = normalizeProfile(profile) === "driving" ? "driving" : "foot";
  const normalizedPoints = normalizePoints(points);
  const coordinates = buildCoordinates(normalizedPoints);
  const url =
    `${baseUrl}/${osrmProfile}/${coordinates}` +
    `?overview=full&geometries=geojson&alternatives=false&steps=false`;

  const response = await fetch(url, {
    method: "GET",
    signal,
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new HttpError(502, `OSRM directions failed (${response.status}).`, body);
  }
  const data = await response.json();
  return parseOsrmRoute(data);
}

export async function fetchDirectionsPath({ profile, points, signal }) {
  if (!config.maptilerApiKey) {
    throw new HttpError(500, "Missing MAPTILER_API_KEY on backend.");
  }

  const profileName = normalizeProfile(profile);
  const normalizedPoints = normalizePoints(points);
  const baseUrl = sanitizeBaseUrl(config.maptilerDirectionsBaseUrl);
  const coordinates = buildCoordinates(normalizedPoints);

  const candidateUrls = buildCandidateUrls(
    baseUrl,
    profileName,
    coordinates,
    config.maptilerApiKey
  );

  let lastStatus = null;
  let lastBody = "";

  for (const url of candidateUrls) {
    const response = await fetch(url, {
      method: "GET",
      signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      lastStatus = response.status;
      lastBody = await response.text().catch(() => "");
      // Try another candidate for 404/405 style endpoint mismatch.
      if (response.status === 404 || response.status === 405) {
        continue;
      }
      throw new HttpError(502, `MapTiler directions failed (${response.status}).`, lastBody);
    }

    const data = await response.json();
    return parseMapTilerRoute(data);
  }

  // Fallback: if MapTiler routing endpoint is unavailable for this key,
  // use OSRM so imports/planning can still proceed.
  try {
    return await fetchOsrmPath({ profile, points: normalizedPoints, signal });
  } catch (osrmError) {
    throw new HttpError(
      502,
      `MapTiler directions failed (${lastStatus ?? "unknown"}) and OSRM fallback failed.`,
      {
        maptiler: lastBody || "No successful MapTiler endpoint variant.",
        osrm: osrmError instanceof HttpError ? osrmError.details ?? osrmError.message : String(osrmError),
      }
    );
  }
}

export async function fetchDirectionsLeg({ profile, from, to, signal }) {
  return fetchDirectionsPath({
    profile,
    points: [
      { lon: Number(from.lon), lat: Number(from.lat) },
      { lon: Number(to.lon), lat: Number(to.lat) },
    ],
    signal,
  });
}
