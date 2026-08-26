"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import VerificationForm from "@/components/claim/VerificationForm";
import AnonChat from "@/components/claim/AnonChat";

interface ClaimData {
  claim: {
    id: string;
    state: "pending" | "verified" | "rejected";
    isClaimant: boolean;
  };
  questions: { question: string }[];
  lostReport: { category: string | null; primary_color: string | null } | null;
  foundReport: { category: string | null; primary_color: string | null } | null;
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
        setVerified(json.claim.state === "verified");
      })
      .catch((err) => setLoadError((err as Error).message));
  }, [claimId, checkingAuth, userId]);

  if (checkingAuth) return null;

  if (!userId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-neutral-400">Sign in to view this claim.</p>
        <Link
          href="/login"
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (loadError) {
    return <p className="p-8 text-center text-sm text-red-400">{loadError}</p>;
  }

  if (!data) return null;

  const itemLabel = `${data.lostReport?.primary_color ?? data.foundReport?.primary_color ?? ""} ${
    data.lostReport?.category ?? data.foundReport?.category ?? "item"
  }`.trim();

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold text-white capitalize">{itemLabel}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {data.claim.isClaimant
            ? "Verify a few details to confirm this item is yours."
            : "Someone believes this found item is theirs and is verifying ownership."}
        </p>
      </div>

      {!verified && data.claim.isClaimant && data.questions.length > 0 && (
        <VerificationForm
          claimId={claimId}
          questions={data.questions.map((q) => q.question)}
          onVerified={(loc) => {
            setPickupLocation(loc);
            setVerified(true);
          }}
        />
      )}

      {!verified && !data.claim.isClaimant && (
        <p className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
          Waiting for the claimant to answer verification questions.
        </p>
      )}

      {verified && (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-4">
            <p className="font-medium text-emerald-300">Ownership verified</p>
            {pickupLocation && (
              <p className="mt-1 text-sm text-neutral-400">
                Exact pickup location: {pickupLocation.lat.toFixed(5)},{" "}
                {pickupLocation.lng.toFixed(5)}
              </p>
            )}
          </div>
          <AnonChat claimId={claimId} userId={userId} />
        </div>
      )}
    </div>
  );
}
