import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS entirely. This is the ONLY client that
 * may read/write report_secrets, write matches.ai_confidence, or flip
 * claims.state to 'verified'. Never import this from a client component or
 * anything that ends up in a browser bundle; the `server-only` import throws
 * a build error if that happens.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
