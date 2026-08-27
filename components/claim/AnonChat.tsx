"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Send, ShieldAlert, Check, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { VERIFICATION_ENABLED } from "@/lib/scoring";

interface ChatMessage {
  id: string;
  claim_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

export default function AnonChat({
  claimId,
  userId,
  /** The holder is the person who found the item — they're the one who must
   * not give away verification answers before the claimant has passed. */
  viewerIsHolder = false,
  claimState = "pending",
}: {
  claimId: string;
  userId: string;
  viewerIsHolder?: boolean;
  claimState?: "pending" | "verified" | "rejected";
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hasScrolledOnce = useRef(false);
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    supabase
      .from("claim_messages")
      .select("*")
      .eq("claim_id", claimId)
      .order("created_at", { ascending: true })
      .returns<ChatMessage[]>()
      .then(({ data }) => setMessages(data ?? []));

    const channel = supabase
      .channel(`claim-${claimId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "claim_messages",
          filter: `claim_id=eq.${claimId}`,
        },
        (payload) =>
          setMessages((prev) => {
            const incoming = payload.new as ChatMessage;
            // The sender already appended this optimistically.
            return prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming];
          }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [claimId]);

  // Scroll the message list itself rather than calling scrollIntoView on a
  // sentinel: scrollIntoView walks up and scrolls *every* scrollable
  // ancestor, so opening a conversation would yank the whole matches page
  // down to bring the chat's bottom into view. Setting scrollTop touches
  // only this element.
  //
  // The first pass jumps instantly — smooth-scrolling a list the user has
  // only just opened looks like the panel is drifting on its own.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({
      top: list.scrollHeight,
      behavior: hasScrolledOnce.current && !reduced ? "smooth" : "auto",
    });
    hasScrolledOnce.current = true;
  }, [messages.length, reduced]);

  const locked = claimState === "rejected";

  // Group consecutive messages from the same sender so only the last one in a
  // run carries a tail and a timestamp — the WhatsApp grouping rule.
  const rows = useMemo(() => {
    return messages.map((m, i) => {
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
      const lastOfRun = !next || next.sender_id !== m.sender_id;
      return { message: m, newDay, lastOfRun };
    });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || locked) return;

    setSending(true);
    setError(null);
    const supabase = createClient();
    if (!supabase) {
      setSending(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("claim_messages")
      .insert({ claim_id: claimId, sender_id: userId, body })
      .select("*")
      .single<ChatMessage>();

    setSending(false);
    if (insertError) {
      // Keep the text so it isn't lost to a failed send.
      setError("Couldn't send — check your connection and try again.");
      return;
    }
    setDraft("");
    if (data) setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-bg">
      {/* Warning is shown only to the finder, and only while the claim is
          unproven — that's the exact window in which describing the item
          would hand over a verification answer. */}
      {VERIFICATION_ENABLED && viewerIsHolder && claimState === "pending" && (
        <div className="flex items-start gap-2 border-b border-lost/30 bg-lost-soft px-3 py-2">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lost" aria-hidden />
          <p className="text-[11px] leading-relaxed text-lost">
            They haven&apos;t proved ownership yet — don&apos;t describe stickers, marks, or
            what&apos;s inside. Those are the answers they need to supply.
          </p>
        </div>
      )}

      <div
        ref={listRef}
        className="flex-1 space-y-1 overflow-y-auto px-3 py-3"
        style={{
          // Faint diagonal weave, the WhatsApp wallpaper cue, kept low-contrast
          // so message text keeps its ratio against it.
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.012) 0 2px, transparent 2px 9px)",
        }}
      >
        {messages.length === 0 && (
          <p className="mt-10 text-center text-xs text-fg-subtle">
            No messages yet — say hello and arrange a handoff.
          </p>
        )}

        <AnimatePresence initial={false}>
          {rows.map(({ message: m, newDay, lastOfRun }) => {
            const mine = m.sender_id === userId;
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-md bg-surface px-2 py-0.5 text-[10px] font-medium text-fg-subtle shadow-sm">
                      {dayLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <motion.div
                  initial={reduced ? false : { opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 480, damping: 32 }}
                  className={`flex ${mine ? "justify-end" : "justify-start"} ${
                    lastOfRun ? "mb-1.5" : "mb-0.5"
                  }`}
                >
                  <div
                    className={`relative max-w-[78%] px-2.5 py-1.5 text-sm shadow-sm ${
                      mine
                        ? "rounded-lg rounded-br-sm bg-found-soft text-fg"
                        : "rounded-lg rounded-bl-sm bg-surface text-fg"
                    }`}
                  >
                    <span className="whitespace-pre-wrap break-words">{m.body}</span>
                    <span className="ml-2 inline-flex select-none items-center gap-0.5 align-bottom text-[10px] text-fg-subtle">
                      {timeLabel(m.created_at)}
                      {mine &&
                        // Delivery ticks are honest here: a single tick means
                        // stored, double means the other participant's client
                        // has it via Realtime. We can't observe read state, so
                        // there is deliberately no blue "read" tick.
                        (messages.some((o) => o.sender_id !== userId && o.created_at > m.created_at) ? (
                          <CheckCheck className="h-3 w-3" aria-label="Delivered" />
                        ) : (
                          <Check className="h-3 w-3" aria-label="Sent" />
                        ))}
                    </span>
                  </div>
                </motion.div>
              </div>
            );
          })}
        </AnimatePresence>
      </div>

      {error && (
        <p className="border-t border-line bg-danger-soft px-3 py-1.5 text-[11px] text-danger">
          {error}
        </p>
      )}

      {locked ? (
        <p className="border-t border-line px-3 py-3 text-center text-xs text-fg-subtle">
          This claim was closed — the conversation is read-only.
        </p>
      ) : (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-line bg-surface p-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter breaks the line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(e as unknown as React.FormEvent);
              }
            }}
            rows={1}
            placeholder="Message…"
            aria-label="Message"
            className="max-h-24 min-h-9 flex-1 resize-none rounded-2xl border border-line-strong bg-bg px-3 py-2 text-sm text-fg outline-none transition-colors duration-200 placeholder:text-fg-subtle focus:border-accent"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label="Send message"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-on-accent transition-colors duration-200 hover:bg-accent-hover disabled:opacity-40"
          >
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </form>
      )}
    </div>
  );
}
