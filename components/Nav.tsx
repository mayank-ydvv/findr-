"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Radar } from "lucide-react";
import { useMatchAlerts } from "@/components/match/MatchAlerts";

const LINKS = [
  { href: "/map", label: "Map" },
  { href: "/report", label: "Report" },
  { href: "/matches", label: "Matches" },
] as const;

/** No sign-in/sign-up UI for now — every visitor gets an anonymous Supabase
 * session transparently (see proxy.ts), so there's no account state to
 * show here yet. Bring the account menu back when real auth returns. */
export default function Nav() {
  const pathname = usePathname();
  const { unreadCount } = useMatchAlerts();

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-5 py-3">
        <Link
          href="/"
          className="flex shrink-0 cursor-pointer items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-fg"
        >
          <Radar className="h-5 w-5 text-accent-hover" aria-hidden />
          Findr
        </Link>

        <nav className="flex items-center gap-1" aria-label="Main">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                  active ? "text-fg" : "text-fg-muted hover:text-fg"
                }`}
              >
                {/* Shared layoutId slides the pill between tabs instead of
                    cross-fading two separate backgrounds. */}
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-md bg-elevated"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative inline-flex items-center gap-1.5">
                  {link.label}
                  {link.href === "/matches" && unreadCount > 0 && (
                    <motion.span
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 24 }}
                      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-found px-1 text-[10px] font-bold tabular-nums text-bg"
                    >
                      {unreadCount > 9 ? "9+" : unreadCount}
                      <span className="sr-only"> new matches</span>
                    </motion.span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>

        <Link
          href="/report"
          className="ml-auto hidden cursor-pointer rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-on-accent transition-colors duration-200 hover:bg-accent-hover sm:inline-block"
        >
          Report an item
        </Link>
      </div>
    </header>
  );
}
