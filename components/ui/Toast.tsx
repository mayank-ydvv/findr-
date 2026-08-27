"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";

export interface ToastItem {
  id: string;
  title: string;
  body?: string;
  href?: string;
  /** Tints the leading rail. Defaults to the brand accent. */
  tone?: "accent" | "found" | "lost";
}

const RAIL: Record<NonNullable<ToastItem["tone"]>, string> = {
  accent: "bg-accent",
  found: "bg-found",
  lost: "bg-lost",
};

/**
 * Deliberately not a toast library: there is exactly one publisher
 * (MatchNotifier), so a dependency would cost more than it saves.
 *
 * aria-live is "polite" rather than "assertive" — a possible match is worth
 * announcing but never worth interrupting whatever the user is mid-sentence
 * on. The region itself is always mounted so screen readers observe it
 * before the first toast arrives; announcing an element that only appears at
 * the same moment its content does is unreliable.
 */
export default function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  const reduced = useReducedMotion() ?? false;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Inner = (
            <div className="flex items-start gap-3 p-3.5 pl-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tracking-tight text-fg">{t.title}</p>
                {t.body && <p className="mt-0.5 text-xs text-fg-muted">{t.body}</p>}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  // The whole card may be a link; dismissing must not navigate.
                  e.preventDefault();
                  e.stopPropagation();
                  onDismiss(t.id);
                }}
                aria-label="Dismiss notification"
                className="-m-1 shrink-0 cursor-pointer rounded p-1 text-fg-subtle transition-colors duration-200 hover:text-fg"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );

          return (
            <motion.div
              key={t.id}
              layout={!reduced}
              initial={reduced ? false : { opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl border border-line bg-surface shadow-xl backdrop-blur"
            >
              <div className="flex">
                <span className={`w-1 shrink-0 ${RAIL[t.tone ?? "accent"]}`} aria-hidden />
                {t.href ? (
                  <Link href={t.href} className="min-w-0 flex-1 cursor-pointer">
                    {Inner}
                  </Link>
                ) : (
                  <div className="min-w-0 flex-1">{Inner}</div>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
