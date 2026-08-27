"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { MessagesSquare, ChevronLeft, ImageOff } from "lucide-react";
import AnonChat from "./AnonChat";
import type { ChatThread } from "@/app/api/claims/threads/route";
import HandoverPanel from "@/components/claim/HandoverPanel";
import { VERIFICATION_ENABLED } from "@/lib/scoring";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

// With verification switched off nothing has actually been verified, so the
// badge says "Active" rather than claiming a check that never ran.
const STATE_LABEL: Record<ChatThread["state"], { text: string; className: string }> = {
  pending: {
    text: VERIFICATION_ENABLED ? "Verifying" : "Active",
    className: VERIFICATION_ENABLED ? "bg-lost-soft text-lost" : "bg-found-soft text-found",
  },
  verified: {
    text: VERIFICATION_ENABLED ? "Verified" : "Active",
    className: "bg-found-soft text-found",
  },
  rejected: { text: "Closed", className: "bg-elevated text-fg-subtle" },
};

/**
 * Threads list + open conversation, sized to sit beside the matches list.
 * On narrow screens the two are stacked rather than side by side, so this
 * behaves as a single column that swaps between list and conversation.
 */
export default function ChatPanel({ userId }: { userId: string }) {
  const searchParams = useSearchParams();
  // ?chat=<claimId> lands here straight from claiming a match. Read as the
  // initial value rather than synced in an effect, so opening a thread by
  // hand afterwards isn't overridden by a stale URL.
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("chat"));
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/claims/threads")
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setThreads(json.threads ?? []);
      })
      .catch(() => {
        if (!cancelled) setThreads([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const open = threads?.find((t) => t.claimId === openId) ?? null;

  return (
    <aside className="flex h-[32rem] flex-col overflow-hidden rounded-xl border border-line bg-surface lg:h-[calc(100vh-8rem)] lg:sticky lg:top-20">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        {open ? (
          <>
            <button
              onClick={() => setOpenId(null)}
              aria-label="Back to conversations"
              className="-ml-1 cursor-pointer rounded p-1 text-fg-muted transition-colors duration-200 hover:text-fg"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold capitalize text-fg">{open.itemLabel}</p>
              <p className="text-[11px] text-fg-subtle">
                {open.viewerIsHolder ? "You found this" : "You reported this lost"}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                STATE_LABEL[open.state].className
              }`}
            >
              {STATE_LABEL[open.state].text}
            </span>
          </>
        ) : (
          <>
            <MessagesSquare className="h-4 w-4 text-accent-hover" aria-hidden />
            <h2 className="text-sm font-semibold tracking-tight text-fg">Conversations</h2>
            {threads && threads.length > 0 && (
              <span className="ml-auto text-[11px] tabular-nums text-fg-subtle">
                {threads.length}
              </span>
            )}
          </>
        )}
      </header>

      <div className="min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.div
              key={open.claimId}
              initial={reduced ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: 12 }}
              transition={{ duration: 0.18 }}
              className="flex h-full min-h-0 flex-col"
            >
              <div className="shrink-0 overflow-y-auto p-3">
                <HandoverPanel
                  claimId={open.claimId}
                  canHandIn={open.viewerIsHolder}
                  canCollect={open.viewerIsClaimant}
                  initial={open.handover}
                />
              </div>
              <div className="min-h-0 flex-1">
                <AnonChat
                  claimId={open.claimId}
                  userId={userId}
                  viewerIsHolder={open.viewerIsHolder}
                  claimState={open.state}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="h-full overflow-y-auto"
            >
              {threads === null && (
                <p className="px-4 py-6 text-center text-xs text-fg-subtle">Loading…</p>
              )}

              {threads?.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-fg-muted">No conversations yet.</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-fg-subtle">
                    When you claim a match — or someone claims something you found — a
                    private thread opens here. Neither side ever sees the other&apos;s
                    contact details.
                  </p>
                </div>
              )}

              <ul>
                {threads?.map((t) => (
                  <li key={t.claimId}>
                    <button
                      onClick={() => setOpenId(t.claimId)}
                      className="flex w-full cursor-pointer items-center gap-3 border-b border-line px-3 py-3 text-left transition-colors duration-200 hover:bg-elevated"
                    >
                      <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-elevated">
                        {t.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={t.photoUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-fg-subtle">
                            <ImageOff className="h-4 w-4" aria-hidden />
                          </span>
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium capitalize text-fg">
                            {t.itemLabel}
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums text-fg-subtle">
                            {timeAgo(t.lastMessageAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">
                            {t.lastMessage ?? (
                              <span className="italic text-fg-subtle">No messages yet</span>
                            )}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                              STATE_LABEL[t.state].className
                            }`}
                          >
                            {STATE_LABEL[t.state].text}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}
