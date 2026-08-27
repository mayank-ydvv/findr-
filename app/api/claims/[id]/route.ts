import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PublicReport } from "@/lib/types";
import { VERIFICATION_ENABLED } from "@/lib/scoring";

/**
 * The one narrow, server-mediated read of report_secrets outside ingest:
 * returns the found item's verification questions (never expected_answer)
 * to the claimant so the claim page can render the form even after a page
 * reload — POST /api/claims already returns the same shape inline, but that
 * response isn't persisted anywhere the client can re-fetch it from.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: claimId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: claim, error: claimError } = await admin
    .from("claims")
    .select(
      "id, claimant_id, holder_id, state, match_id, created_at, verified_at, dropoff_point, dropped_off_at, collected_at",
    )
    .eq("id", claimId)
    .single();

  if (claimError || !claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }
  if (claim.claimant_id !== user.id && claim.holder_id !== user.id) {
    return NextResponse.json({ error: "Not your claim" }, { status: 403 });
  }

  const { data: match } = await admin
    .from("matches")
    .select("lost_report_id, found_report_id")
    .eq("id", claim.match_id)
    .single();

  const [{ data: lostReport }, { data: foundReport }] = await Promise.all([
    admin
      .from("public_reports")
      .select("*")
      .eq("id", match?.lost_report_id ?? "")
      .single<PublicReport>(),
    admin
      .from("public_reports")
      .select("*")
      .eq("id", match?.found_report_id ?? "")
      .single<PublicReport>(),
  ]);

  let questions: { question: string }[] = [];
  if (claim.claimant_id === user.id && claim.state === "pending") {
    const { data: secrets } = await admin
      .from("report_secrets")
      .select("verification_questions")
      .eq("report_id", match?.found_report_id ?? "")
      .single();

    if (secrets) {
      questions = (
        secrets.verification_questions as { question: string; expected_answer: string }[]
      ).map((q) => ({ question: q.question }));
    }
  }

  // Once a claim is settled the exact pickup spot is no longer secret from
  // its two participants. With verification disabled a claim is settled the
  // moment it's opened, so this is the only place the location now surfaces
  // — /verify used to return it and nothing calls that route any more.
  let pickupLocation: { lat: number; lng: number } | null = null;
  const claimIsLive = VERIFICATION_ENABLED
    ? claim.state === "verified"
    : claim.state !== "rejected";
  if (claimIsLive && !claim.dropped_off_at && match?.found_report_id) {
    const { data: exact } = await admin
      .from("reports")
      .select("exact_lat, exact_lng")
      .eq("id", match.found_report_id)
      .single();
    if (exact) pickupLocation = { lat: exact.exact_lat, lng: exact.exact_lng };
  }

  return NextResponse.json({
    claim: {
      id: claim.id,
      state: claim.state,
      created_at: claim.created_at,
      verified_at: claim.verified_at,
      isClaimant: claim.claimant_id === user.id,
    },
    handover: {
      dropoff_point: claim.dropoff_point ?? null,
      dropped_off_at: claim.dropped_off_at ?? null,
      collected_at: claim.collected_at ?? null,
    },
    questions,
    lostReport,
    foundReport,
    pickupLocation,
  });
}
