"use client";

import { use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import VerificationForm from "@/components/claim/VerificationForm";
import { VERIFICATION_ENABLED } from "@/lib/scoring";
import AnonChat from "@/components/claim/AnonChat";
import HandoverPanel, { type HandoverState } from "@/components/claim/HandoverPanel";

interface ClaimData {
  claim: {
    id: string;
    state: "pending" | "verified" | "rejected";
    isClaimant: boolean;
  };
  questions: { question: string }[];
  lostReport: { category: string | null; primary_color: string | null } | null;
  foundReport: { category: string | null; primary_color: string | null } | null;
  pickupLocation: { lat: number; lng: number } | null;
  handover: HandoverState;
}

export default function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: claimId } = use(params);

  const supabaseReady = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const [userId, setUserId] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(supabaseReady);
  const [data, setData] = useState<ClaimData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(
    supabaseReady ? null : "Supabase isn't configured yet.",
  );
  const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setCheckingAuth(false);
    });
  }, []);

  useEffect(() => {
    if (checkingAuth || !userId) return;
    fetch(`/api/claims/${claimId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not load claim");
        setData(json);
        // Mirrors `claimIsLive` in GET /api/claims/[id]. With verification
        // switched off a claim is settled the moment it's opened, so gating
        // on state === 'verified' would leave every claim showing its header
        // and nothing else — no chat, no handover, forever.
        setVerified(
          VERIFICATION_ENABLED
            ? json.claim.state === "verified"
            : json.claim.state !== "rejected",
        );
        if (json.pickupLocation) setPickupLocation(json.pickupLocation);
      })
      .catch((err) => setLoadError((err as Error).message));
  }, [claimId, checkingAuth, userId]);

  if (checkingAuth) return null;

  if (!userId) {
    // proxy.ts provisions an anonymous session on every request, so this
    // means that failed rather than that the visitor needs to sign in.
    return (
      <p className="p-8 text-center text-sm text-fg-muted">
        Couldn&apos;t start a session. If this persists, check that anonymous sign-ins are
        enabled in your Supabase project (Authentication → Sign In / Providers → Anonymous).
      </p>
    );
  }

  if (loadError) {
    return <p className="p-8 text-center text-sm text-danger">{loadError}</p>;
  }

  if (!data) return null;

  const itemLabel = `${data.lostReport?.primary_color ?? data.foundReport?.primary_color ?? ""} ${
    data.lostReport?.category ?? data.foundReport?.category ?? "item"
  }`.trim();

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold text-fg capitalize">{itemLabel}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {VERIFICATION_ENABLED
            ? data.claim.isClaimant
              ? "Verify a few details to confirm this item is yours."
              : "Someone believes this found item is theirs and is verifying ownership."
            : data.claim.isClaimant
              ? "You've claimed this item — message the finder below to arrange a handoff."
              : "Someone has claimed this item. Message them below to arrange a handoff."}
        </p>
      </div>

      {VERIFICATION_ENABLED && !verified && data.claim.isClaimant && data.questions.length > 0 && (
        <VerificationForm
          claimId={claimId}
          questions={data.questions.map((q) => q.question)}
          onVerified={(loc) => {
            setPickupLocation(loc);
            setVerified(true);
          }}
        />
      )}

      {VERIFICATION_ENABLED && !verified && !data.claim.isClaimant && (
        <p className="rounded-lg border border-line bg-surface p-4 text-sm text-fg-muted">
          Waiting for the claimant to answer verification questions.
        </p>
      )}

      {verified && (
        <div className="space-y-4">
          <div className="rounded-lg border border-found/40 bg-found-soft p-4">
            <p className="font-medium text-found">
              {VERIFICATION_ENABLED ? "Ownership verified" : "Claim opened"}
            </p>
            {pickupLocation && (
              <p className="mt-1 text-sm text-fg-muted">
                Found near: {pickupLocation.lat.toFixed(5)}, {pickupLocation.lng.toFixed(5)}
              </p>
            )}
          </div>

          <HandoverPanel
            claimId={claimId}
            viewerIsHolder={!data.claim.isClaimant}
            initial={data.handover}
          />
          <div className="h-96">
            <AnonChat
              claimId={claimId}
              userId={userId}
              viewerIsHolder={!data.claim.isClaimant}
              claimState={data.claim.state}
            />
          </div>
        </div>
      )}
    </div>
  );
}
