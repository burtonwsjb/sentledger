import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

// Service-role client: server only. Never sent to the browser.
export const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "public" },
});

/** Throws on a Supabase error, returns data otherwise. */
export function must<T>(res: { data: T; error: { message: string; code?: string } | null }, what = "database"): T {
  if (res.error) {
    const e = new Error(`${what}: ${res.error.message}`) as Error & { code?: string };
    e.code = res.error.code;
    throw e;
  }
  return res.data;
}
