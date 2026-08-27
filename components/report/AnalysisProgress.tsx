"use client";

import { useEffect, useState } from "react";

const STAGES = [
  "Uploading photo…",
  "Analysing image with Claude…",
  "Building the item's fingerprint…",
  "Scanning open reports for a match…",
];

/** Ingest takes ~9s end to end (vision + embedding + rerank) — this exists
 * so that wait reads as the product working, not as a hang. */
export default function AnalysisProgress({ active }: { active: boolean }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => {
      setStage((s) => Math.min(s + 1, STAGES.length - 1));
    }, 1800);
    return () => {
      window.clearInterval(interval);
      setStage(0);
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
      <span className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-line-strong border-t-accent-hover" />
      <span className="text-sm text-fg">{STAGES[stage]}</span>
    </div>
  );
}
