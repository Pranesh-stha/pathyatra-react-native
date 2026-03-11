import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(backendRoot, ".env") });

const parseNumber = (value, fallback) => {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseCsvList = (value) => {
  if (value == null || value === "") return [];
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export const config = {
  port: parseNumber(process.env.PORT, 4000),
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  maptilerApiKey: process.env.MAPTILER_API_KEY ?? "",
  maptilerDirectionsBaseUrl:
    process.env.MAPTILER_DIRECTIONS_BASE_URL ?? "https://api.maptiler.com/directions/v2",
  osrmBaseUrl: process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org/route/v1",
  preferredRouteIds: parseCsvList(process.env.PREFERRED_ROUTE_IDS),
  preferredRouteBonusS: Math.max(0, parseNumber(process.env.PREFERRED_ROUTE_BONUS_S, 0)),
  preferredRouteOrderStepS: Math.max(
    0,
    parseNumber(process.env.PREFERRED_ROUTE_ORDER_STEP_S, 120)
  ),
};

export function assertServerConfig() {
  const required = [
    ["SUPABASE_URL", config.supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", config.supabaseServiceRoleKey],
    ["MAPTILER_API_KEY", config.maptilerApiKey],
  ];
  const missing = required.filter((entry) => !entry[1]).map((entry) => entry[0]);
  if (missing.length > 0) {
    throw new Error(`Missing required env variables: ${missing.join(", ")}`);
  }
}
