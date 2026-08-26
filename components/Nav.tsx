"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/", label: "Map" },
  { href: "/report", label: "Report" },
  { href: "/matches", label: "Matches" },
] as const;

export default function Nav({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-white">
          Find<span className="text-emerald-400">r</span>
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname === link.href
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3 text-sm">
        {userEmail ? (
          <>
            <span className="text-neutral-500">{userEmail}</span>
            <button
              onClick={signOut}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:border-neutral-500 hover:text-white"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-emerald-500 px-3 py-1.5 font-medium text-neutral-950 hover:bg-emerald-400"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
