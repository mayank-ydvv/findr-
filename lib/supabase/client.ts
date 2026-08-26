import { createBrowserClient } from "@supabase/ssr";

/** Browser client — anon key only, subject to RLS. Safe to import in
 * client components.
 *
 * Returns null when Supabase isn't configured yet, instead of letting
 * @supabase/ssr throw synchronously — every call site already has a natural
 * "not ready" branch (a loading state, an auth check), so this lets that
 * branch handle the unconfigured case too rather than crashing the page. */
export function createClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
