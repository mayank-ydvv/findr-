"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Map as MapIcon, ImageOff } from "lucide-react";
import ConfidenceRing from "./ConfidenceRing";
import EvidenceList from "./EvidenceList";
import type { MatchState } from "@/lib/types";
import { VERIFICATION_ENABLED } from "@/lib/scoring";

export interface MatchCardReport {
  id: string;
  category: string | null;
  primary_color: string | null;
  user_description: string;
  photoUrl: string | null;
  occurred_at: string;
}

export interface MatchCardData {
  id: string;
  ai_confidence: number;
  ai_reasoning: string;
  matching_features: string[];
  conflicting_features: string[];
  state: MatchState;
  lost: MatchCardReport;
  found: MatchCardReport;
  /** Whether the current viewer owns the lost report — only they may open a
   * claim, since a claim asserts "this found item is mine". */
  viewerIsLostOwner: boolean;
  isDemo?: boolean;
}

function timeAgo(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Thumb({ report, label }: { report: MatchCardReport; label: string }) {
  return (
    <div className="flex-1">
      <div className="aspect-square w-full overflow-hidden rounded-md bg-elevated">
        {report.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={report.photoUrl} alt={`${label} item`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-fg-subtle">
            <ImageOff className="h-6 w-6" aria-hidden />
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-fg-muted">
        {label} · {timeAgo(report.occurred_at)}
      </p>
    </div>
  );
}

export default function MatchCard({ match }: { match: MatchCardData }) {
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setRejected(rejected: boolean) {
    setDismissing(true);
    setError(null);
    try {
      const res = await fetch(`/api/match/${match.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejected }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not update this match");
      setDismissed(rejected);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDismissing(false);
    }
  }

  async function openClaim() {
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: match.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not open claim");
      // Straight into the conversation beside the matches list.
      router.push(`/matches?chat=${json.claim.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setClaiming(false);
    }
  }

  const canClaim = match.viewerIsLostOwner && match.state === "suggested" && !match.isDemo;
  const canDismiss =
    (match.state === "suggested" || match.state === "claim_requested") && !match.isDemo;

  // Collapsed rather than removed outright, so a misclick is recoverable.
  // The undo only lasts this session — the matches list filters rejected
  // rows out, so it's gone for good after a refresh.
  if (dismissed) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface/40 px-4 py-3">
        <p className="text-sm text-fg-muted">
          Dismissed —{" "}
          {match.viewerIsLostOwner
            ? "not your item."
            : "not the item you found."}
        </p>
        <button
          onClick={() => setRejected(false)}
          disabled={dismissing}
          className="shrink-0 text-xs text-fg-muted underline-offset-2 hover:text-fg hover:underline disabled:opacity-50"
        >
          {dismissing ? "…" : "Undo"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-1 gap-3">
          <Thumb report={match.lost} label="Lost" />
          <Thumb report={match.found} label="Found" />
        </div>
        <ConfidenceRing confidence={match.ai_confidence} />
      </div>

      <h3 className="mt-3 font-medium text-fg">
        {match.lost.primary_color ?? match.found.primary_color}{" "}
        {match.lost.category ?? match.found.category}
        {match.isDemo && (
          <span className="ml-2 rounded-full border border-line-strong px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
            Demo
          </span>
        )}
      </h3>
      <p className="mt-1 text-sm text-fg-muted">{match.ai_reasoning}</p>

      <div className="mt-3">
        <EvidenceList matching={match.matching_features} conflicting={match.conflicting_features} />
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {!match.isDemo && (
        <Link
          href={`/map?match=${match.id}`}
          className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-fg-muted transition-colors duration-200 hover:text-fg"
        >
          <MapIcon className="h-3.5 w-3.5" aria-hidden />
          Show this match on the map
        </Link>
      )}

      {(canClaim || canDismiss) && (
        <div className="mt-4 flex gap-2">
          {canClaim && (
            <button
              onClick={openClaim}
              disabled={claiming || dismissing}
              className="flex-1 rounded-md bg-accent py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
            >
              {claiming ? "Opening…" : "This is mine — message the finder"}
            </button>
          )}
          {canDismiss && (
            <button
              onClick={() => setRejected(true)}
              disabled={claiming || dismissing}
              className={`rounded-md border border-line-strong py-2 text-sm font-medium text-fg hover:border-fg-subtle hover:text-fg disabled:opacity-50 ${
                canClaim ? "px-3" : "flex-1"
              }`}
            >
              {dismissing
                ? "…"
                : match.viewerIsLostOwner
                  ? "Not my item"
                  : "Not a match"}
            </button>
          )}
        </div>
      )}
      {match.state === "claim_requested" && (
        <p className="mt-3 rounded-md bg-elevated px-3 py-2 text-center text-xs text-fg-muted">
          {VERIFICATION_ENABLED
            ? "Claim in progress — verification pending."
            : "Claimed — continue in Conversations."}
        </p>
      )}
      {match.state === "verified" && (
        <p className="mt-3 rounded-md bg-found-soft px-3 py-2 text-center text-xs text-found">
          Verified and resolved.
        </p>
      )}
    </div>
  );
}
