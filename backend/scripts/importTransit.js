import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabaseClient } from "../src/supabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_TRANSIT_FILE = path.resolve(__dirname, "../../rough_data/transit.json");
const UPSERT_BATCH_SIZE = 500;

function parseArgs() {
  const args = process.argv.slice(2);
  let filePath = DEFAULT_TRANSIT_FILE;
  let reset = true;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--file" && args[index + 1]) {
      filePath = path.resolve(process.cwd(), args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--no-reset") {
      reset = false;
    }
  }

  return { filePath, reset };
}

function chunk(items, size) {
  const output = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
}

async function upsertInBatches(supabase, table, rows, onConflict) {
  const batches = chunk(rows, UPSERT_BATCH_SIZE);
  for (const batch of batches) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) {
      throw new Error(`Failed to upsert ${table}: ${error.message}`);
    }
  }
}

function validateTransitData(data) {
  if (!Array.isArray(data?.stops) || !Array.isArray(data?.routes)) {
    throw new Error("Input JSON must contain stops[] and routes[] arrays.");
  }

  const stopIdSet = new Set(data.stops.map((stop) => stop.id));
  const duplicateStopIds = data.stops
    .map((stop) => stop.id)
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateStopIds.length > 0) {
    throw new Error(`Duplicate stop IDs found: ${Array.from(new Set(duplicateStopIds)).join(", ")}`);
  }

  // Keep structural validation strict, but route-level cleanup is handled below.
  return { stopIdSet };
}

function normalizeRoutes(routes, stopIdSet) {
  const validRoutes = [];
  const skippedRoutes = [];

  for (const route of routes) {
    const rawStopIds = Array.isArray(route?.stopIds) ? route.stopIds : [];
    const filteredStopIds = rawStopIds.filter((stopId) => stopIdSet.has(stopId));
    const uniqueStopIds = Array.from(new Set(filteredStopIds));

    if (uniqueStopIds.length < 2) {
      skippedRoutes.push({
        id: route?.id ?? "unknown_route",
        reason: `requires at least 2 valid stopIds (found ${uniqueStopIds.length})`,
      });
      continue;
    }

    validRoutes.push({
      ...route,
      stopIds: uniqueStopIds,
    });
  }

  return { validRoutes, skippedRoutes };
}

function buildVariants(route) {
  const variants = [
    {
      variantKey: `${route.id}__forward`,
      routeId: route.id,
      direction: "forward",
      stopIds: route.stopIds,
    },
  ];

  if (route.directionality === "bidirectional") {
    variants.push({
      variantKey: `${route.id}__reverse`,
      routeId: route.id,
      direction: "reverse",
      stopIds: [...route.stopIds].reverse(),
    });
  }
  return variants;
}

function buildPlatformLookup(stops) {
  const byStationId = new Map();
  for (const stop of stops) {
    const platforms = Array.isArray(stop?.platforms) ? stop.platforms : [];
    byStationId.set(stop.id, {
      all: platforms.map((platform) => platform.id),
      bySide: new Map(
        platforms.map((platform) => [String(platform.side || "").toLowerCase(), platform.id])
      ),
    });
  }
  return byStationId;
}

function pickPlatformIdForVariantStop({ stationId, variantDirection, platformLookup }) {
  const entry = platformLookup.get(stationId);
  if (!entry || entry.all.length === 0) return null;
  const preferredSide = variantDirection === "reverse" ? "right" : "left";
  return entry.bySide.get(preferredSide) ?? entry.all[0] ?? null;
}

async function fetchVariantIdMap(supabase, variantKeys) {
  const map = new Map();
  const batches = chunk(variantKeys, 120);
  for (const batch of batches) {
    const { data, error } = await supabase
      .from("route_variants")
      .select("id, variant_key")
      .in("variant_key", batch);
    if (error) {
      throw new Error(`Failed to fetch route variant IDs: ${error.message}`);
    }
    for (const row of data ?? []) {
      map.set(row.variant_key, row.id);
    }
  }
  return map;
}

async function main() {
  const { filePath, reset } = parseArgs();
  const supabase = getSupabaseClient();

  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw);
  const { stopIdSet } = validateTransitData(data);
  const { validRoutes, skippedRoutes } = normalizeRoutes(data.routes, stopIdSet);
  const platformLookup = buildPlatformLookup(data.stops);

  if (skippedRoutes.length > 0) {
    console.warn(
      `[import] Skipping ${skippedRoutes.length} invalid routes with <2 valid stops.`
    );
    skippedRoutes.slice(0, 20).forEach((route) => {
      console.warn(`[import] skipped route ${route.id}: ${route.reason}`);
    });
  }
  if (validRoutes.length === 0) {
    throw new Error("No valid routes available after route cleanup.");
  }

  if (reset) {
    const { error } = await supabase.rpc("reset_transit_data");
    if (error) {
      throw new Error(`Failed to reset existing data: ${error.message}`);
    }
  }

  const stationRows = data.stops.map((stop) => ({
    id: stop.id,
    name: stop.name,
    lat: Number(stop.lat),
    lon: Number(stop.lon),
  }));
  await upsertInBatches(supabase, "stations", stationRows, "id");

  const platformRows = data.stops.flatMap((stop) =>
    (stop.platforms ?? []).map((platform) => ({
      id: platform.id,
      station_id: stop.id,
      name: platform.name,
      side: platform.side,
      lat: Number(platform.lat),
      lon: Number(platform.lon),
    }))
  );
  await upsertInBatches(supabase, "platforms", platformRows, "id");

  const routeRows = validRoutes.map((route) => ({
    id: route.id,
    name: route.name,
    is_loop: Boolean(route.isLoop),
    directionality: route.directionality === "bidirectional" ? "bidirectional" : "one_way",
    loop_direction: route.loopDirection ?? null,
  }));
  await upsertInBatches(supabase, "routes", routeRows, "id");

  const allVariants = validRoutes.flatMap((route) => buildVariants(route));
  const variantRows = allVariants.map((variant) => ({
    variant_key: variant.variantKey,
    route_id: variant.routeId,
    direction: variant.direction,
    stop_count: variant.stopIds.length,
  }));
  await upsertInBatches(supabase, "route_variants", variantRows, "variant_key");

  const variantIdMap = await fetchVariantIdMap(
    supabase,
    allVariants.map((variant) => variant.variantKey)
  );

  const variantStopRows = [];
  for (const variant of allVariants) {
    const variantId = variantIdMap.get(variant.variantKey);
    if (!variantId) {
      throw new Error(`Variant ID missing after upsert: ${variant.variantKey}`);
    }
    for (let i = 0; i < variant.stopIds.length; i += 1) {
      const stationId = variant.stopIds[i];
      variantStopRows.push({
        variant_id: variantId,
        stop_sequence: i + 1,
        station_id: stationId,
        platform_id: pickPlatformIdForVariantStop({
          stationId,
          variantDirection: variant.direction,
          platformLookup,
        }),
      });
    }
  }
  await upsertInBatches(
    supabase,
    "route_variant_stops",
    variantStopRows,
    "variant_id,stop_sequence"
  );

  console.log(
    [
      `Import complete from ${filePath}`,
      `stations=${stationRows.length}`,
      `platforms=${platformRows.length}`,
      `routes=${routeRows.length}`,
      `route_variants=${variantRows.length}`,
      `route_variant_stops=${variantStopRows.length}`,
      `skipped_routes=${skippedRoutes.length}`,
    ].join(" | ")
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
