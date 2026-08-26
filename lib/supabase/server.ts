import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Server client for Server Components, Server Actions, and Route Handlers —
 * anon key, subject to RLS, scoped to the requesting user's session via
 * cookies. Use this for anything a user should only see/do as themselves. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component with no response to write to —
            // fine as long as middleware refreshes the session.
          }
        },
      },
    },
  );
}
