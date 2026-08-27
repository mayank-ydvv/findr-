"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ToastViewport, { type ToastItem } from "@/components/ui/Toast";

const LAST_SEEN_KEY = "findr:matches-last-seen";
const TOAST_MS = 8000;

interface MatchAlertsValue {
  /** Suggested matches created since the user last opened /matches. */
  unreadCount: number;
}

const MatchAlertsContext = createContext<MatchAlertsValue>({ unreadCount: 0 });

export function useMatchAlerts() {
  return useContext(MatchAlertsContext);
}

function readLastSeen(): string {
  try {
    return localStorage.getItem(LAST_SEEN_KEY) ?? new Date(0).toISOString();
  } catch {
    // Private mode / blocked storage: treat everything as already seen rather
    // than permanently showing a badge the user has no way to clear.
    return new Date().toISOString();
  }
}

/**
 * Match notifications ride on Postgres Changes, not the CAMPUS_FEED_CHANNEL
 * broadcast in lib/realtime.ts. That channel is a single public one every
 * client subscribes to, so it cannot target a user — whereas `matches` has
 * participant-scoped RLS, and Realtime applies RLS to Postgres Changes. The
 * subscription therefore only ever delivers rows this user is party to,
 * without any client-side filtering to get wrong. See
 * supabase/migrations/0006_realtime_matches.sql.
 */
export default function MatchAlertsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast: ToastItem) => {
      setToasts((prev) => (prev.some((t) => t.id === toast.id) ? prev : [...prev, toast]));
      timers.current.set(toast.id, window.setTimeout(() => dismiss(toast.id), TOAST_MS));
    },
    [dismiss],
  );

  const refreshUnread = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;
    const { count } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("state", "suggested")
      .gt("created_at", readLastSeen());
    setUnreadCount(count ?? 0);
  }, []);

  useEffect(() => {
    const timersAtMount = timers.current;
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel("match-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "matches" },
        ({ new: row }) => {
          const match = row as { id: string; state: string; ai_confidence: number | null };
          if (match.state !== "suggested") return;
          push({
            id: match.id,
            title: "Possible match found",
            body: match.ai_confidence
              ? `${match.ai_confidence}% confidence — tap to review and claim.`
              : "Tap to review and claim.",
            href: "/matches",
            tone: "found",
          });
          void refreshUnread();
        },
      )
      // State changes (dismissed, claimed, verified) never toast — only one of
      // them is news — but they do move the badge.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches" },
        () => void refreshUnread(),
      )
      // The initial count is read here rather than in the effect body: it
      // belongs to the subscription's lifecycle, and doing it once the
      // channel is live closes the gap where a match landing between an
      // eager fetch and an established subscription would be missed by both.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refreshUnread();
      });

    return () => {
      supabase.removeChannel(channel);
      for (const handle of timersAtMount.values()) window.clearTimeout(handle);
      timersAtMount.clear();
    };
  }, [push, refreshUnread]);

  // Opening the matches list marks them seen. This effect only writes to an
  // external store — the badge itself is derived below, so there's no
  // cascading setState here.
  useEffect(() => {
    if (pathname !== "/matches") return;
    try {
      localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    } catch {
      /* storage blocked — the badge just won't persist as cleared */
    }
    // Re-reads against the timestamp just written, so the count is already
    // correct by the time the user navigates away.
    //
    // set-state-in-effect is disabled rather than worked around: the rule
    // guards against a setState that runs synchronously in the effect body
    // and triggers a cascading re-render. refreshUnread awaits a Supabase
    // round-trip first, so its setState lands in a later task — the linter
    // flags the call without following the await. Deriving the badge instead
    // (see displayedUnread below) covers the render path; this only refreshes
    // the underlying count for after the user navigates away.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshUnread();
  }, [pathname, refreshUnread]);

  // Derived, not stored: while the list is open there is by definition
  // nothing unread on it.
  const displayedUnread = pathname === "/matches" ? 0 : unreadCount;

  return (
    <MatchAlertsContext.Provider value={{ unreadCount: displayedUnread }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </MatchAlertsContext.Provider>
  );
}
