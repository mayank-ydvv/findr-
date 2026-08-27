"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, MapPin, PackageCheck, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  DROPOFF_POINTS,
  dropoffLabel,
  dropoffPointById,
  type DropoffPointId,
} from "@/lib/dropoffPoints";

export interface HandoverState {
  dropoff_point: DropoffPointId | null;
  dropped_off_at: string | null;
  collected_at: string | null;
}

async function postJson(url: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  // Same defensive read as the report form: a failure from the platform
  // rather than the route comes back as text, not JSON.
  const raw = await res.text();
  let json: { error?: string } & Record<string, unknown>;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Request failed (${res.status}). Please try again.`);
  }
  if (!res.ok) throw new Error(json.error ?? "Something went wrong");
  return json;
}

export default function HandoverPanel({
  claimId,
  viewerIsHolder,
  initial,
}: {
  claimId: string;
  /** True when the viewer is the finder currently holding the item. */
  viewerIsHolder: boolean;
  initial: HandoverState;
}) {
  const [state, setState] = useState<HandoverState>(initial);
  const [choice, setChoice] = useState<DropoffPointId>(DROPOFF_POINTS[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The owner shouldn't have to refresh to learn the item has been handed
  // in. claims is in the realtime publication (migration 0009) and its RLS
  // is participant-scoped, so this only ever delivers this claim's own row.
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`claim-handover-${claimId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "claims", filter: `id=eq.${claimId}` },
        (payload) => {
          const row = payload.new as HandoverState;
          setState({
            dropoff_point: row.dropoff_point,
            dropped_off_at: row.dropped_off_at,
            collected_at: row.collected_at,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [claimId]);

  async function handIn() {
    setBusy(true);
    setError(null);
    try {
      const json = await postJson(`/api/claims/${claimId}/handover`, { point: choice });
      setState(json.handover as HandoverState);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCollected() {
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/claims/${claimId}/collect`);
      setState((s) => ({ ...s, collected_at: new Date().toISOString() }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const point = dropoffPointById(state.dropoff_point);

  if (state.collected_at) {
    return (
      <div className="rounded-lg border border-found/40 bg-found-soft p-4">
        <p className="flex items-center gap-2 font-medium text-found">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Collected — all done
        </p>
        <p className="mt-1 text-sm text-fg-muted">
          {point ? `Picked up from ${dropoffLabel(point)}.` : "This item is back with its owner."}{" "}
          Both reports are now closed.
        </p>
      </div>
    );
  }

  // Handed in, waiting to be collected.
  if (state.dropped_off_at && point) {
    return (
      <div className="space-y-3 rounded-lg border border-accent/40 bg-accent/10 p-4">
        <p className="flex items-center gap-2 font-medium text-accent-hover">
          <PackageCheck className="h-4 w-4" aria-hidden />
          {viewerIsHolder ? "You handed this in" : "Ready to collect"}
        </p>

        <div className="rounded-md border border-line bg-surface p-3">
          <p className="text-sm font-semibold text-fg">{point.name}</p>
          <p className="text-sm text-fg-muted">{point.desk}</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-fg-subtle">
            <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
            Ask the {point.custodian.toLowerCase()}
          </p>
        </div>

        {viewerIsHolder ? (
          <p className="text-sm text-fg-muted">
            The owner has been told where to collect it. Nothing else for you to do — thanks for
            handing it in.
          </p>
        ) : (
          <>
            <p className="text-sm text-fg-muted">
              Go to the desk and describe the item to the guard to pick it up. Confirm below once
              you have it, so both reports can be closed.
            </p>
            <button
              type="button"
              onClick={confirmCollected}
              disabled={busy}
              className="w-full cursor-pointer rounded-md bg-accent py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {busy ? "Confirming…" : "I've collected it"}
            </button>
          </>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  // Not handed in yet.
  if (!viewerIsHolder) {
    return (
      <div className="rounded-lg border border-line bg-surface p-4">
        <p className="font-medium text-fg">Waiting for hand-in</p>
        <p className="mt-1 text-sm text-fg-muted">
          The finder is handing this to a guard at one of the collection desks. You&apos;ll be told
          which one as soon as they do — no need to meet them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <div>
        <p className="font-medium text-fg">Hand it in at a desk</p>
        <p className="mt-1 text-sm text-fg-muted">
          Please don&apos;t arrange to meet — leave the item with a guard at either desk and mark
          it below. The owner collects it from there.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="sr-only">Choose a drop-off desk</legend>
        {DROPOFF_POINTS.map((p) => (
          <label
            key={p.id}
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
              choice === p.id
                ? "border-accent bg-accent/10"
                : "border-line hover:border-line-strong"
            }`}
          >
            <input
              type="radio"
              name="dropoff"
              value={p.id}
              checked={choice === p.id}
              onChange={() => setChoice(p.id)}
              className="mt-1 accent-[var(--color-accent,#4667f5)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-fg">{p.name}</span>
              <span className="block text-sm text-fg-muted">{p.desk}</span>
              <span className="mt-0.5 flex items-center gap-1 text-xs text-fg-subtle">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                {p.custodian}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        onClick={handIn}
        disabled={busy}
        className="w-full cursor-pointer rounded-md bg-accent py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? "Saving…" : "I've handed it in"}
      </button>

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
