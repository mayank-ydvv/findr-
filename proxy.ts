import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session cookie on every request — standard
 * @supabase/ssr pattern for the Next.js App Router. Without this, sessions
 * silently expire mid-visit because Server Components can't write cookies.
 *
 * Also transparently provisions an anonymous session for first-time
 * visitors. There's no sign-in/sign-up UI right now (deferred, not
 * removed — see components/Nav.tsx), but reports/claims/chat still need a
 * real user_id for ownership and RLS to mean anything. Supabase anonymous
 * users get a genuine auth.users row and a real auth.uid() with the normal
 * `authenticated` role, so every existing RLS policy (all written as
 * `to authenticated using (user_id = auth.uid())`) applies to them
 * unchanged — this only works if "Allow anonymous sign-ins" is turned on
 * in Supabase (Authentication → Sign In / Providers → Anonymous), which is
 * off by default.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Supabase isn't configured yet — nothing to refresh. Without this guard
  // every request 500s before any page-level "set your env vars" message
  // can render, since proxy runs ahead of all of them.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error(
        "Anonymous sign-in failed — enable it under Supabase → Authentication → " +
          "Sign In / Providers → Anonymous:",
        error.message,
      );
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
