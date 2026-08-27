"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ImageOff, MapPin, Search, ShieldCheck, Clock, Inbox } from "lucide-react";
import type { MyReport } from "@/app/api/reports/mine/route";

function timeAgo(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

type Tone = "waiting" | "active" | "settled";

interface Outcome {
  tone: Tone;
  label: string;
  detail: string;
  href: string | null;
}

/**
 * Turns a report's match/claim state into the one line its owner came here to
 * read. Phrased from the reporter's side rather than the data's: someone who
 * lost a bottle wants "has anyone found it", not "1 match, state=suggested".
 */
function outcomeOf(r: MyReport): Outcome {
  const isLost = r.kind === "lost";

  if (r.claim) {
    if (r.claim.state === "verified") {
      return {
        tone: "settled",
        label: isLost ? "It's yours — verified" : "Owner verified",
        detail: isLost
          ? "You passed the ownership check. Arrange the handover in your thread."
          : "They answered the ownership questions correctly. Arrange the handover.",
        href: "/matches",
      };
    }
    if (r.claim.state === "pending") {
      return r.claim.viewerIsHolder
        ? {
            tone: "active",
            label: "Someone says it's theirs",
            detail: "Review their answers and verify them before handing anything over.",
            href: `/claim/${r.claim.id}`,
          }
        : {
            tone: "active",
            label: "Your claim is pending",
            detail: "You've answered the ownership questions. Waiting on the finder.",
            href: `/claim/${r.claim.id}`,
          };
    }
  }

  if (r.matchCount > 0) {
    const n = r.matchCount;
    return {
      tone: "active",
      label: isLost
        ? `${n} possible ${n === 1 ? "find" : "finds"}`
        : `${n} possible ${n === 1 ? "owner" : "owners"}`,
      detail: isLost
        ? "Someone reported finding something like this. Check the match to claim it."
        : "Someone reported losing something like this.",
      href: "/matches",
    };
  }

  return {
    tone: "waiting",
    label: "Still looking",
    detail: isLost
      ? "No one has reported finding it yet. Findr checks every new report against this one."
      : "No one has claimed it yet. Findr checks every new report against this one.",
    href: null,
  };
}

const TONE_STYLES: Record<Tone, { chip: string; icon: typeof Clock }> = {
  waiting: { chip: "border-line bg-elevated text-fg-muted", icon: Search },
  active: { chip: "border-accent/40 bg-accent/10 text-accent-hover", icon: Inbox },
  settled: { chip: "border-found/40 bg-found-soft text-found", icon: ShieldCheck },
};

export default function MyReports() {
  const [reports, setReports] = useState<MyReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/reports/mine");
        const raw = await res.text();
        let json: { reports?: MyReport[]; error?: string };
        try {
          json = JSON.parse(raw);
        } catch {
          throw new Error(`Couldn't load your reports (${res.status}).`);
        }
        if (!res.ok) throw new Error(json.error ?? "Couldn't load your reports.");
        if (!cancelled) setReports(json.reports ?? []);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="rounded-lg border border-lost/40 bg-lost-soft p-4 text-sm text-lost">{error}</p>
    );
  }

  if (reports === null) {
    return (
      <ul className="space-y-3" aria-label="Loading your reports">
        {[0, 1].map((i) => (
          <li key={i} className="flex gap-3 rounded-xl border border-line bg-surface p-3">
            <div className="h-20 w-20 shrink-0 animate-pulse rounded-lg bg-elevated" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3.5 w-1/3 animate-pulse rounded bg-elevated" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-elevated" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line p-8 text-center">
        <p className="text-sm text-fg-muted">You haven&apos;t reported anything yet.</p>
        <p className="mt-1 text-xs text-fg-subtle">
          Anything you report shows up here, along with whether anyone has found or claimed it.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {reports.map((r) => {
        const outcome = outcomeOf(r);
        const { chip, icon: Icon } = TONE_STYLES[outcome.tone];
        const title = [r.primary_color, r.category].filter(Boolean).join(" ") || "Item";
        // The counterpart photo is the payoff for a lost report — it's the
        // picture of the thing someone else is holding.
        const thumb = r.photoUrl ?? r.counterpartPhotoUrl;

        return (
          <li key={r.id} className="rounded-xl border border-line bg-surface p-3">
            <div className="flex gap-3">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-elevated">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt={`${r.kind} ${r.category ?? "item"}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-fg-subtle">
                    <ImageOff className="h-5 w-5" aria-hidden />
                  </div>
                )}
                <span
                  className={`absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide backdrop-blur ${
                    r.kind === "lost"
                      ? "bg-lost-soft text-lost ring-1 ring-lost/40"
                      : "bg-found-soft text-found ring-1 ring-found/40"
                  }`}
                >
                  {r.kind}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold capitalize tracking-tight text-fg">
                    {title}
                  </h3>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${chip}`}
                  >
                    <Icon className="mr-1 inline h-2.5 w-2.5 align-[-1px]" aria-hidden />
                    {outcome.label}
                  </span>
                </div>

                {r.user_description && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-fg-muted">{r.user_description}</p>
                )}

                <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{outcome.detail}</p>

                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-fg-subtle">
                  {r.zoneName && (
                    <>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-2.5 w-2.5" aria-hidden />
                        {r.zoneName}
                      </span>
                      <span aria-hidden>·</span>
                    </>
                  )}
                  <time dateTime={r.created_at}>{timeAgo(r.created_at)}</time>
                  {r.topConfidence !== null && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="tabular-nums">{r.topConfidence}% confidence</span>
                    </>
                  )}
                  {outcome.href && (
                    <>
                      <span aria-hidden>·</span>
                      <Link
                        href={outcome.href}
                        className="font-medium text-accent-hover underline-offset-2 hover:underline"
                      >
                        {outcome.tone === "settled" ? "Open thread" : "View"}
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
