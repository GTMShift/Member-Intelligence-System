import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Config } from "./config";

export function createSupabaseClient(config: Config): SupabaseClient {
  return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
}
