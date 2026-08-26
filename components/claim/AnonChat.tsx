"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ChatMessage {
  id: string;
  claim_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export default function AnonChat({ claimId, userId }: { claimId: string; userId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

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
        { event: "INSERT", schema: "public", table: "claim_messages", filter: `claim_id=eq.${claimId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as ChatMessage]),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [claimId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("claim_messages").insert({ claim_id: claimId, sender_id: userId, body });
  }

  return (
    <div className="flex h-80 flex-col rounded-lg border border-neutral-800 bg-neutral-900">
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-xs text-neutral-600">
            No messages yet — say hello and arrange a handoff.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm ${
              m.sender_id === userId
                ? "ml-auto bg-emerald-600 text-white"
                : "bg-neutral-800 text-neutral-200"
            }`}
          >
            {m.body}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-neutral-800 p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message…"
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
        >
          Send
        </button>
      </form>
    </div>
  );
}
