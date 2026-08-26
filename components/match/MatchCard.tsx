"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfidenceRing from "./ConfidenceRing";
import EvidenceList from "./EvidenceList";
import type { MatchState } from "@/lib/types";

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
      <div className="aspect-square w-full overflow-hidden rounded-md bg-neutral-800">
        {report.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={report.photoUrl} alt={`${label} item`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">🧩</div>
        )}
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        {label} · {timeAgo(report.occurred_at)}
      </p>
    </div>
  );
}

export default function MatchCard({ match }: { match: MatchCardData }) {
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      router.push(`/claim/${json.claim.id}`);
    } catch (err) {
      setError((err as Error).message);
      setClaiming(false);
    }
  }

  const canClaim = match.viewerIsLostOwner && match.state === "suggested" && !match.isDemo;

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-1 gap-3">
          <Thumb report={match.lost} label="Lost" />
          <Thumb report={match.found} label="Found" />
        </div>
        <ConfidenceRing confidence={match.ai_confidence} />
      </div>

      <h3 className="mt-3 font-medium text-white">
        {match.lost.primary_color ?? match.found.primary_color}{" "}
        {match.lost.category ?? match.found.category}
        {match.isDemo && (
          <span className="ml-2 rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Demo
          </span>
        )}
      </h3>
      <p className="mt-1 text-sm text-neutral-400">{match.ai_reasoning}</p>

      <div className="mt-3">
        <EvidenceList matching={match.matching_features} conflicting={match.conflicting_features} />
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {canClaim && (
        <button
          onClick={openClaim}
          disabled={claiming}
          className="mt-4 w-full rounded-md bg-emerald-500 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {claiming ? "Opening claim…" : "This is mine — verify to claim"}
        </button>
      )}
      {match.state === "claim_requested" && (
        <p className="mt-3 rounded-md bg-neutral-800 px-3 py-2 text-center text-xs text-neutral-400">
          Claim in progress — verification pending.
        </p>
      )}
      {match.state === "verified" && (
        <p className="mt-3 rounded-md bg-emerald-950 px-3 py-2 text-center text-xs text-emerald-300">
          Verified and resolved.
        </p>
      )}
    </div>
  );
}
