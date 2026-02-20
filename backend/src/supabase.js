import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

let cachedClient = null;

export function getSupabaseClient() {
  if (cachedClient) return cachedClient;
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error("Supabase environment variables are missing.");
  }
  cachedClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedClient;
}

